import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useGesture } from '@use-gesture/react';
import { App } from 'obsidian';
import { WhiteboardData, StickyNoteData, WallStyle } from '../types';
import { ContextMenu } from '../menu/ContextMenu';
import { StickyNoteItem } from '../sticky-note/StickyNote';
import { useWhiteboardLogic } from './useWhiteboardLogic';
import { WhiteboardControls } from './WhiteboardControls';
import { BrainCoreSettings } from '../../../settings';
import BrainCorePlugin from '../../../main';

// --- 2. Memoized 组件 ---
const MemoizedStickyNoteItem = React.memo(StickyNoteItem, (prev, next) => {
    return (
        prev.data === next.data &&
        prev.isSelected === next.isSelected &&
        prev.activeEditId === next.activeEditId &&
        prev.settings === next.settings
    );
});

const MAX_NOTE_SIZE = 800;

interface WhiteboardProps {
    app: App;
    plugin: BrainCorePlugin;
    settings: BrainCoreSettings;
    initialNotes: StickyNoteData[];
    initialWallStyle: WallStyle;
    fileList: string[];
    currentFile: string;
    onSave: (data: WhiteboardData) => void;
    onSwitchBoard: (name: string) => void;
    onCreateBoard: (name: string) => void;
    onDeleteBoard: (name: string) => void;
}

export const WhiteboardComponent: React.FC<WhiteboardProps> = ({
    app,
    settings,
    initialNotes,
    initialWallStyle,
    fileList,
    currentFile,
    onSave,
    onSwitchBoard,
    onCreateBoard,
    onDeleteBoard
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const notesContainerRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);

    // --- 3. 逻辑 Hook ---
    const logic = useWhiteboardLogic(
        app,
        initialNotes,
        initialWallStyle,
        onSave,
        containerRef,
        notesContainerRef,
    );

    // --- 4. 虚拟窗口 (Lazy Virtualization) ---
    const [virtualWindow, setVirtualWindow] = useState({
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight,
        scale: 1
    });

    useEffect(() => {
        const updateDims = () => {
            if (containerRef.current) {
                setVirtualWindow(prev => ({
                    ...prev,
                    width: containerRef.current!.clientWidth,
                    height: containerRef.current!.clientHeight
                }));
            }
        };
        updateDims();
        window.addEventListener('resize', updateDims);
        return () => window.removeEventListener('resize', updateDims);
    }, []);

    // --- 5. 辅助方法：动态控制硬件加速层 ---
    const updateVisualState = useCallback((isDragging: boolean) => {
        isDraggingRef.current = isDragging;
        if (containerRef.current) {
            containerRef.current.style.cursor = isDragging ? 'grabbing' : 'grab';
        }
        if (notesContainerRef.current) {
            // 关键：拖动时开启 will-change 保证流畅，停止时设为 auto 恢复文字清晰度
            notesContainerRef.current.style.willChange = isDragging ? 'transform' : 'auto';
        }
    }, []);

    // --- 6. 手势绑定 ---
    const bgBind = useGesture({
        onDragStart: () => {
            updateVisualState(true);
        },

        onDrag: ({ delta: [dx, dy] }) => {
            // 更新逻辑层位移
            logic.updateViewport(dx, dy);

            // 实时应用到 DOM
            const currentOffset = logic.offsetRef.current;
            const currentScale = logic.scaleRef.current;

            if (currentOffset && currentScale) {
                logic.applyOffsetToDOM(currentOffset.x, currentOffset.y, currentScale);
            }
        },

        onDragEnd: () => {
            updateVisualState(false);

            // 拖拽结束，更新虚拟窗口用于 Culling 计算
            const currentOffset = logic.offsetRef.current;
            const currentScale = logic.scaleRef.current;

            if (currentOffset && currentScale) {
                setVirtualWindow(prev => ({
                    ...prev,
                    x: currentOffset.x,
                    y: currentOffset.y,
                    scale: currentScale
                }));
            }
        },

        onContextMenu: ({ event }) => {
            event.preventDefault();

            if (event.target === containerRef.current) {
                const mouseEvent = event as unknown as React.MouseEvent;
                const { x, y } = logic.screenToCanvas(mouseEvent.clientX, mouseEvent.clientY);
                logic.setMenuState({
                    visible: true,
                    x: mouseEvent.clientX,
                    y: mouseEvent.clientY,
                    noteId: null,
                    canvasX: x,
                    canvasY: y
                });
            }
        },

        onWheel: ({ event, ctrlKey }) => {
            if (ctrlKey) {
                event.preventDefault();
                // 缩放逻辑在此扩展...
            }
        }
    }, {
        drag: {
            from: () => [
                logic.offsetRef.current?.x || 0,
                logic.offsetRef.current?.y || 0
            ],
            filterTaps: true
        },
        eventOptions: { passive: false }
    });

    // --- 7. 计算可见便利贴 (Culling) ---
    const visibleNotes = useMemo(() => {
        if (logic.notes.length === 0) return [];

        const vLeft = -virtualWindow.x / virtualWindow.scale;
        const vTop = -virtualWindow.y / virtualWindow.scale;
        const vRight = vLeft + (virtualWindow.width / virtualWindow.scale);
        const vBottom = vTop + (virtualWindow.height / virtualWindow.scale);

        // 缓冲区设大一点，防止边缘闪烁
        const buffer = 1200 / virtualWindow.scale;

        return logic.notes.filter(note => {
            const noteRight = note.x + MAX_NOTE_SIZE;
            const noteBottom = note.y + MAX_NOTE_SIZE;
            const isInX = noteRight > (vLeft - buffer) && note.x < (vRight + buffer);
            const isInY = noteBottom > (vTop - buffer) && note.y < (vBottom + buffer);
            return isInX && isInY;
        });
    }, [logic.notes, virtualWindow]);

    // --- 8. 事件回调 ---
    const handleNoteClick = useCallback((e: React.MouseEvent, noteId: string) => {
        e.stopPropagation();
        if (isDraggingRef.current) return;
        logic.setSelectedNoteId(noteId);
        containerRef.current?.focus({ preventScroll: true });
    }, [logic]);

    const handleNoteContextMenu = useCallback((
        e: { clientX: number; clientY: number; preventDefault?: () => void; stopPropagation?: () => void },
        noteId: string
    ) => {
        e.preventDefault?.();
        e.stopPropagation?.();

        logic.setMenuState({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            noteId: noteId
        });
    }, [logic]);

    const lastTapTimeRef = useRef(0);
    const handleBgClick = useCallback((e: React.MouseEvent) => {
        if (e.target !== containerRef.current) return;
        if (isDraggingRef.current) return;

        if (logic.menuState.visible) logic.setMenuState(prev => ({ ...prev, visible: false }));
        logic.setSelectedNoteId(null);

        const now = Date.now();
        const diff = now - lastTapTimeRef.current;

        if (diff < 300 && diff > 0) {
            const { x, y } = logic.screenToCanvas(e.clientX, e.clientY);
            logic.createNoteAt(x, y);
            lastTapTimeRef.current = 0;
        } else {
            lastTapTimeRef.current = now;
        }
    }, [logic]);

    return (
        <div
            ref={containerRef}
            {...(bgBind() as unknown as React.DOMAttributes<HTMLDivElement>)}
            className={`bc-wb-container bc-wall-${logic.wallStyle}`}
            style={{
                touchAction: 'none',
                width: '100%',
                height: '100%',
                position: 'relative',
                overflow: 'hidden',
                outline: 'none',
                cursor: 'grab',
                // 确保容器背景平滑
                backgroundColor: 'var(--background-primary)'
            }}
            onClick={handleBgClick}
            tabIndex={0}
        >
            <WhiteboardControls
                fileList={fileList}
                currentFile={currentFile}
                onSwitchBoard={onSwitchBoard}
                onCreateBoard={onCreateBoard}
                onDeleteBoard={onDeleteBoard}
                onZoomToFit={logic.handleZoomToFit}
                onToggleWall={logic.cycleWallStyle}
                onStraighten={logic.toggleStraighten}
                onCenter={logic.centerContent}
                isStraightened={logic.isStraightened}
            />

            <div
                ref={notesContainerRef}
                style={{
                    width: '100%',
                    height: '100%',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    pointerEvents: 'none',
                    transformOrigin: '0 0',

                    // --- 修改如下 ---
                    // 1. 移除 backfaceVisibility: 'hidden' (它会导致次像素抗锯齿失效)
                    // backfaceVisibility: 'hidden',

                    // 2. 强制使用亚像素抗锯齿 (Obsidian Mac端可能需要)
                    WebkitFontSmoothing: 'subpixel-antialiased',
                    MozOsxFontSmoothing: 'grayscale', // Firefox/某些环境回退方案

                    // 3. 极其重要的 CSS 属性：告诉浏览器优化清晰度
                    // 注意：这可能稍微降低渲染性能，但对文字清晰度至关重要
                    imageRendering: 'auto', // 默认值，通常最好，但在缩放时可以尝试 high-quality (Chrome新属性)
                }}
            >
                {visibleNotes.map(note => (
                    <div
                        key={note.id}
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            pointerEvents: 'auto'
                        }}
                        onClick={(e) => handleNoteClick(e, note.id)}
                    >
                        <MemoizedStickyNoteItem
                            app={app}
                            settings={settings}
                            data={note}
                            isSelected={logic.selectedNoteId === note.id}
                            onUpdate={logic.updateNote}
                            activeEditId={logic.editingTargetId}
                            onContextMenuTrigger={(e) => handleNoteContextMenu(e, note.id)}
                        />
                    </div>
                ))}
            </div>

            {logic.menuState.visible && (
                <ContextMenu
                    app={app}
                    settings={settings}
                    menuState={logic.menuState}
                    note={logic.menuState.noteId ? logic.notes.find(n => n.id === logic.menuState.noteId) || null : null}
                    onClose={() => logic.setMenuState(prev => ({ ...prev, visible: false }))}
                    onUpdate={logic.updateNote}
                    onDelete={logic.deleteNote}
                    onCreate={logic.createNoteAt}
                    onEdit={(id) => {
                        logic.setEditingTargetId(id);
                        setTimeout(() => logic.setEditingTargetId(null), 100);
                    }}
                    onCopy={logic.handleCopy}
                    onPaste={() => logic.handlePaste(
                        logic.menuState.canvasX
                            ? { x: logic.menuState.canvasX, y: logic.menuState.canvasY! }
                            : undefined
                    )}
                />
            )}

            {logic.notes.length === 0 && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        opacity: 0.3,
                        pointerEvents: 'none',
                        userSelect: 'none',
                        color: 'var(--text-normal)'
                    }}
                >
                    Double-click or Right-click to add a note ✨
                </div>
            )}
        </div>
    );
};