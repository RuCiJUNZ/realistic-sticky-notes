// src/notes/Whiteboard.tsx

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useGesture } from '@use-gesture/react';
import { App } from 'obsidian';
import { WhiteboardData, StickyNoteData, WallStyle } from '../types';
import { injectStyles } from '../styles';
import { ContextMenu } from '../menu/ContextMenu';
import { StickyNoteItem } from '../sticky-note/StickyNote';
import { useWhiteboardLogic } from './useWhiteboardLogic';
import { WhiteboardControls } from './WhiteboardControls';
import { BrainCoreSettings } from '../../../settings';
import BrainCorePlugin from '../../../main';

// ------------------------------------------------------------------
// 1. 辅助工具：简单的节流函数 (Throttle)
// 用于限制 React 渲染频率，避免在拖拽时每一帧都触发 React Diff
// ------------------------------------------------------------------
function throttle(func: Function, limit: number) {
    let inThrottle: boolean;
    return function (this: any, ...args: any[]) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// ------------------------------------------------------------------
// 2. 性能核心：Memo 化组件
// 只有当 data (位置/内容) 或 选中状态 改变时，才重新渲染
// ------------------------------------------------------------------
const MemoizedStickyNoteItem = React.memo(StickyNoteItem, (prev, next) => {
    return (
        prev.data === next.data && // 数据引用是否变化
        prev.isSelected === next.isSelected && // 选中状态
        prev.activeEditId === next.activeEditId && // 编辑状态
        prev.settings === next.settings // 设置变化
    );
});

// 预估便利贴最大尺寸（用于剔除边缘计算，宁大勿小）
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
    // DOM Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const notesContainerRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);
    // ------------------------------------------------------------------
    // 3. 视口状态 (Viewport State) - 用于 Culling
    // 注意：logic.offsetRef 是用于 DOM 操作的(快)，这个 state 是用于 React 渲染的(慢)
    // ------------------------------------------------------------------
    const [viewport, setViewport] = useState({ x: 0, y: 0, width: 0, height: 0, scale: 1 });

    // 注入样式
    useEffect(() => {
        injectStyles();
        // 初始化视口大小
        if (containerRef.current) {
            setViewport(prev => ({
                ...prev,
                width: containerRef.current!.clientWidth,
                height: containerRef.current!.clientHeight
            }));
        }

        // 监听窗口大小变化
        const handleResize = () => {
            if (containerRef.current) {
                setViewport(prev => ({
                    ...prev,
                    width: containerRef.current!.clientWidth,
                    height: containerRef.current!.clientHeight
                }));
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // 业务逻辑 Hook
    const logic = useWhiteboardLogic(
        app,
        initialNotes,
        initialWallStyle,
        onSave,
        containerRef,
        notesContainerRef,
        currentFile // <--- ⭐ 别忘了在父组件这里传入这个参数！
    );

    // ------------------------------------------------------------------
    // 4. 节流更新视口 (Sync Viewport Throttled)
    // 当用户拖拽画布时，我们不需要每一帧都计算 Culling，
    // 只需要每 100ms 更新一次"可见列表"即可。
    // ------------------------------------------------------------------
    const updateViewportState = useMemo(() => throttle((x: number, y: number, scale: number) => {
        setViewport(prev => ({ ...prev, x, y, scale }));
    }, 100), []); // 100ms 节流

    // 手势绑定
    const bgBind = useGesture({
        // 1. 拖拽开始时，先默认认为是点击（不上锁），直到移动距离够远
        onDragStart: () => {
            isDraggingRef.current = false;
        },

        // 2. 拖拽过程中检测移动距离
        onDrag: ({ delta: [dx, dy], movement: [mx, my], event }: any) => {
            // 【关键修改】只有移动距离超过 5px 才上锁
            // Math.hypot 计算直角三角形斜边长（即位移距离）
            if (!isDraggingRef.current && Math.hypot(mx, my) > 5) {
                isDraggingRef.current = true;
            }
            // 只允许在背景上拖拽移动画布
            if (event.target === containerRef.current) {
                logic.offsetRef.current.x += dx;
                logic.offsetRef.current.y += dy;

                // A. 立即应用 DOM 变换 (保持 60fps 丝滑视觉)
                logic.applyOffsetToDOM(
                    logic.offsetRef.current.x,
                    logic.offsetRef.current.y,
                    logic.scaleRef.current
                );

                // B. 节流更新 React 状态 (用于视口剔除计算)
                updateViewportState(
                    logic.offsetRef.current.x,
                    logic.offsetRef.current.y,
                    logic.scaleRef.current
                );
            }
        },
        // 【新增】拖拽结束时，延迟解锁
        onDragEnd: () => {
            // 延迟 50ms 解锁，确保这一瞬间触发的 click 事件能被拦截到
            setTimeout(() => {
                isDraggingRef.current = false;
            }, 50);
        },
        onContextMenu: ({ event }: any) => {
            if (event.target === containerRef.current) {
                event.preventDefault();
                const { x, y } = logic.screenToCanvas(event.clientX, event.clientY);
                logic.setMenuState({
                    visible: true,
                    x: event.clientX,
                    y: event.clientY,
                    noteId: null,
                    canvasX: x,
                    canvasY: y
                });
            }
        }
    }, {
        eventOptions: { passive: false }
    });

    // ------------------------------------------------------------------
    // 5. 核心逻辑：计算可见便利贴 (Viewport Culling)
    // ------------------------------------------------------------------
    const visibleNotes = useMemo(() => {
        // 如果没有 notes 或者视口未初始化，返回空或全部(视策略而定)
        if (logic.notes.length === 0) return [];

        // 视口在 Canvas 坐标系中的边界
        // Viewport X = (0 - containerOffset.x) / scale
        const vLeft = -viewport.x / viewport.scale;
        const vTop = -viewport.y / viewport.scale;
        const vRight = vLeft + (viewport.width / viewport.scale);
        const vBottom = vTop + (viewport.height / viewport.scale);

        // 缓冲区 (Buffer)：多渲染屏幕外一圈，避免拖拽时出现空白
        const buffer = 500 / viewport.scale;

        return logic.notes.filter(note => {
            // 简单的 AABB 碰撞检测 (Axis-Aligned Bounding Box)
            // 注意：因为 Note 大小不一，我们用 MAX_NOTE_SIZE 做保守估计
            // 只要 Note 的中心点或者左上角在 (View + Buffer) 范围内即可

            // Note 右边缘 > 视口左边缘 - Buffer
            // Note 左边缘 < 视口右边缘 + Buffer
            const isInX = (note.x + MAX_NOTE_SIZE) > (vLeft - buffer) && note.x < (vRight + buffer);
            const isInY = (note.y + MAX_NOTE_SIZE) > (vTop - buffer) && note.y < (vBottom + buffer);

            return isInX && isInY;
        });
    }, [logic.notes, viewport]); // 依赖：仅当笔记列表变动 或 视口粗略变动时重新计算

    // ------------------------------------------------------------------
    // 6. 稳定回调 (Stable Callbacks)
    // 传给 Memo 子组件的函数必须使用 useCallback，否则 Memo 会失效
    // ------------------------------------------------------------------
    // 修改 handleNoteClick
    const handleNoteClick = useCallback((e: React.MouseEvent, noteId: string) => {
        e.stopPropagation(); // 保持这个，防止背景拖拽

        logic.setSelectedNoteId(noteId);

        // ⭐【关键修复】手动将焦点聚焦回白板容器
        // 这样 document.activeElement 就会变成 container，快捷键守卫就能通过了
        if (containerRef.current) {
            containerRef.current.focus({ preventScroll: true });
        }
    }, [logic.setSelectedNoteId]); // 这里的依赖项不用变，因为 containerRef 是 ref

    const handleNoteContextMenu = useCallback((e: { clientX: number; clientY: number }, noteId: string) => {
        logic.setMenuState({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            noteId: noteId
        });
    }, [logic.setMenuState]);

    // 点击背景处理
    const lastTapTimeRef = useRef(0);
    const handleBgClick = (e: React.MouseEvent) => {
        if (e.target !== containerRef.current) return;

        // 【新增】核心修复：如果刚才在拖拽，直接忽略这次点击
        if (isDraggingRef.current) {
            return;
        }

        // 关闭菜单和取消选中
        if (logic.menuState.visible) logic.setMenuState(prev => ({ ...prev, visible: false }));
        logic.setSelectedNoteId(null);
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

        // 双击检测
        const now = Date.now();
        const diff = now - lastTapTimeRef.current;
        if (diff < 300 && diff > 0) {
            const { x, y } = logic.screenToCanvas(e.clientX, e.clientY);
            logic.createNoteAt(x, y);
            lastTapTimeRef.current = 0;
        } else {
            lastTapTimeRef.current = now;
        }
    };

    return (
        <div
            ref={containerRef}
            {...bgBind() as any}
            className={`bc-wb-container bc-wall-${logic.wallStyle}`}
            style={{
                touchAction: 'none',
                backgroundPosition: '0px 0px',
                width: '100%',
                height: '100%',
                position: 'relative',
                overflow: 'hidden'
            }}
            onClick={handleBgClick}
        >
            {/* Control Header */}
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

            {/* Canvas Content */}
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
                    // 注意：这里仍然由 useWhiteboardLogic 中的 applyOffsetToDOM 控制 transform
                    // React 渲染层只负责挂载 DOM 节点
                }}
            >
                {/* 渲染优化：只渲染 visibleNotes 而不是 logic.notes */}
                {visibleNotes.map(note => (
                    <div
                        key={note.id}
                        style={{ pointerEvents: 'auto' }}
                        onClick={(e) => handleNoteClick(e, note.id)}
                    >
                        {/* 使用 Memo 化的组件 */}
                        <MemoizedStickyNoteItem
                            app={app}
                            settings={settings}
                            data={note}
                            isSelected={logic.selectedNoteId === note.id}
                            onUpdate={logic.updateNote} // 假设 updateNote 在 logic 内部已 memo，如果没有建议也加上 useCallback
                            activeEditId={logic.editingTargetId}
                            onContextMenuTrigger={(e, id) => handleNoteContextMenu(e, id)}
                        />
                    </div>
                ))}
            </div>

            {/* Debug Info (可选，调试用，上线可删除) */}
            {/* <div style={{position:'absolute', bottom: 10, right: 10, color: 'red'}}>
                Total: {logic.notes.length} | Rendered: {visibleNotes.length}
            </div> */}

            {/* Menu / Overlay */}
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

            {/* Empty Hint */}
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
                    Double-click or Right-click to add a note✨
                </div>
            )}
        </div>
    );
};