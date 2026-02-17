import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { debounce, App } from 'obsidian';
import { StickyNoteData, WhiteboardData, WallStyle, MenuState } from '../types';

// --- 辅助 Hook: 始终保持最新的 Ref，避免闭包陷阱 ---
function useLatest<T>(value: T) {
    const ref = useRef(value);
    ref.current = value;
    return ref;
}

// --- 辅助函数：计算内容边界 ---
const getContentBounds = (notes: StickyNoteData[]) => {
    if (notes.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    notes.forEach(n => {
        const noteWidth = 200;
        const noteHeight = 200;
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + noteWidth);
        maxY = Math.max(maxY, n.y + noteHeight);
    });
    return {
        minX, minY, maxX, maxY,
        width: maxX - minX,
        height: maxY - minY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2
    };
};

// --- 接口定义 ---
interface UseWhiteboardLogicResult {
    notes: StickyNoteData[];
    wallStyle: WallStyle;
    selectedNoteId: string | null;
    menuState: MenuState;
    editingTargetId: string | null;
    isStraightened: boolean;
    setNotes: React.Dispatch<React.SetStateAction<StickyNoteData[]>>;
    setMenuState: React.Dispatch<React.SetStateAction<MenuState>>;
    setSelectedNoteId: React.Dispatch<React.SetStateAction<string | null>>;
    setEditingTargetId: React.Dispatch<React.SetStateAction<string | null>>;
    updateNote: (id: string, diff: Partial<StickyNoteData>) => void;
    deleteNote: (id: string) => void;
    createNoteAt: (canvasX: number, canvasY: number) => void;
    handleCopy: () => void;
    handlePaste: (pos?: { x: number, y: number }) => void;
    handleZoomToFit: () => void;
    toggleStraighten: () => void;
    cycleWallStyle: () => void;
    centerContent: () => void;

    // ✅ 修复：符合审核标准的 RefObject (只读接口)
    offsetRef: React.RefObject<{ x: number; y: number }>;
    scaleRef: React.RefObject<number>;

    // ✅ 新增：通过方法来修改 Ref，而不是直接暴露 MutableRef
    updateViewport: (dx: number, dy: number, newScale?: number) => void;

    applyOffsetToDOM: (x: number, y: number, scale: number) => void;
    screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number };
}

export const useWhiteboardLogic = (
    app: App,
    initialNotes: StickyNoteData[],
    initialWallStyle: WallStyle,
    onSave: (data: WhiteboardData) => void,
    containerRef: React.RefObject<HTMLDivElement | null>,
    notesContainerRef: React.RefObject<HTMLDivElement | null>,
): UseWhiteboardLogicResult => {

    // --- 1. 状态管理 ---
    const [notes, setNotes] = useState<StickyNoteData[]>(initialNotes || []);
    const [wallStyle, setWallStyle] = useState<WallStyle>(initialWallStyle || 'dots');
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
    const [menuState, setMenuState] = useState<MenuState>({ visible: false, x: 0, y: 0, noteId: null });
    const [editingTargetId, setEditingTargetId] = useState<string | null>(null);

    // --- 2. Refs ---
    const notesRef = useLatest(notes);
    const wallStyleRef = useLatest(wallStyle);
    const selectedIdRef = useLatest(selectedNoteId);

    // 内部状态 Refs
    const clipboardRef = useRef<StickyNoteData | null>(null);
    const offsetRef = useRef({ x: 0, y: 0 }); // 内部初始化，保证不为 null
    const scaleRef = useRef(1);
    const rafRef = useRef<number | null>(null);

    // --- 3. 视口更新逻辑 (封装变异) ---
    const updateViewport = useCallback((dx: number, dy: number, newScale?: number) => {
        if (offsetRef.current) {
            offsetRef.current.x += dx;
            offsetRef.current.y += dy;
        }
        if (newScale !== undefined && scaleRef.current !== null) {
            scaleRef.current = newScale;
        }
    }, []);

    // --- 4. 防抖保存逻辑 ---
    const debouncedSave = useMemo(
        () => debounce((currentNotes: StickyNoteData[], currentStyle: WallStyle) => {
            onSave({
                version: 1,
                wallStyle: currentStyle,
                notes: currentNotes
            });
        }, 1000, true),
        [onSave]
    );

    const setNotesAndSave = useCallback((
        updater: (prev: StickyNoteData[]) => StickyNoteData[],
        overrideStyle?: WallStyle
    ) => {
        setNotes(prev => {
            const nextNotes = updater(prev);
            debouncedSave(nextNotes, overrideStyle ?? wallStyleRef.current);
            return nextNotes;
        });
    }, [debouncedSave, wallStyleRef]);

    // --- 5. DOM 操作 (rAF) ---
    const applyOffsetToDOM = useCallback((x: number, y: number, scale: number) => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        rafRef.current = requestAnimationFrame(() => {
            // 1. 背景图位置更新
            if (containerRef.current) {
                const bgX = Math.round(x);
                const bgY = Math.round(y);

                // 🟢 修复：使用 setCssProps
                containerRef.current.setCssProps({
                    'background-position': `${bgX}px ${bgY}px`
                });
            }

            // 2. 笔记容器变换更新
            if (notesContainerRef.current) {
                // 🔴 删除：notesContainerRef.current.style.transformOrigin = '0 0';
                // 解释：这行代码已被移至 CSS 类 .brain-core-notes-container 中

                const finalX = Math.round(x);
                const finalY = Math.round(y);

                // 🟢 修复：使用 setCssProps 设置 transform
                notesContainerRef.current.setCssProps({
                    'transform': `translate(${finalX}px, ${finalY}px) scale(${scale})`
                });
            }
        });
    }, [containerRef, notesContainerRef]); // 依赖项通常是稳定的 ref，其实写 [] 也可以，但写上无妨
    useEffect(() => {
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        if (!containerRef.current || !offsetRef.current || !scaleRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: (clientX - rect.left - offsetRef.current.x) / scaleRef.current,
            y: (clientY - rect.top - offsetRef.current.y) / scaleRef.current
        };
    }, [containerRef]);

    // --- 6. 计算属性 ---
    const isStraightened = useMemo(() => {
        return notes.some(n => n.originalRotation !== undefined);
    }, [notes]);

    // --- 7. CRUD 操作 ---
    const updateNote = useCallback((id: string, diff: Partial<StickyNoteData>) => {
        setNotesAndSave(prev => prev.map(n => n.id === id ? { ...n, ...diff } : n));
    }, [setNotesAndSave]);

    const deleteNote = useCallback((id: string) => {
        setNotesAndSave(prev => prev.filter(n => n.id !== id));
        if (selectedIdRef.current === id) setSelectedNoteId(null);
    }, [setNotesAndSave, selectedIdRef]);

    const createNoteAt = useCallback((canvasX: number, canvasY: number) => {
        const hasRotated = notesRef.current.some(n => n.originalRotation !== undefined);
        const newNote: StickyNoteData = {
            id: Date.now().toString(),
            x: canvasX - 80,
            y: canvasY - 80,
            content: '',
            color: 'yellow',
            size: 'm',
            shape: 'square',
            style: 'realistic',
            bgStyle: 'solid',
            rotation: hasRotated ? 0 : (Math.random() * 6 - 3),
            pinType: 'none',
            pinPos: 'center',
            type: 'sticky-note',
            filepath: ''
        };

        setNotesAndSave(prev => [...prev, newNote]);
        setEditingTargetId(newNote.id);
        setSelectedNoteId(newNote.id);
        setTimeout(() => setEditingTargetId(null), 100);
    }, [setNotesAndSave, notesRef]);

    // --- 8. 剪贴板逻辑 ---
    const handleCopy = useCallback(() => {
        const currentSelectedId = selectedIdRef.current;
        if (!currentSelectedId) return;
        const noteToCopy = notesRef.current.find(n => n.id === currentSelectedId);
        if (noteToCopy) {
            clipboardRef.current = { ...noteToCopy };
            navigator.clipboard.writeText(noteToCopy.content).catch(err => console.error(err));
        }
    }, [selectedIdRef, notesRef]);

    const handlePaste = useCallback((pos?: { x: number, y: number }) => {
        if (!clipboardRef.current) return;
        const source = clipboardRef.current;
        const newId = Date.now().toString();
        const newX = pos ? (pos.x - 80) : (source.x + 20);
        const newY = pos ? (pos.y - 80) : (source.y + 20);

        const newNote: StickyNoteData = {
            ...source,
            id: newId,
            x: newX,
            y: newY,
            rotation: (Math.random() * 6 - 3),
            filepath: ''
        };

        setNotesAndSave(prev => [...prev, newNote]);
        setSelectedNoteId(newId);
    }, [setNotesAndSave]);

    // --- 9. 快捷键监听 ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeEl = document.activeElement;
            if (activeEl) {
                const tagName = activeEl.tagName;
                if (tagName === 'INPUT' || tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable) {
                    return;
                }
            }

            const container = containerRef.current;
            if (!container || !container.matches(':hover')) return;

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                if (selectedIdRef.current) {
                    e.preventDefault();
                    handleCopy();
                }
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                e.preventDefault();
                handlePaste();
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedIdRef.current) {
                    e.preventDefault();
                    deleteNote(selectedIdRef.current);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleCopy, handlePaste, deleteNote, containerRef, selectedIdRef]);

    // --- 10. 视图控制 ---
    const handleZoomToFit = useCallback(() => {
        if (!containerRef.current) return;
        const bounds = getContentBounds(notesRef.current);
        const { clientWidth: containerW, clientHeight: containerH } = containerRef.current;

        if (!bounds) {
            const centerX = containerW / 2;
            const centerY = containerH / 2;
            if (offsetRef.current) offsetRef.current = { x: centerX, y: centerY };
            if (scaleRef.current) scaleRef.current = 1;
            applyOffsetToDOM(centerX, centerY, 1);
            return;
        }

        const padding = 100;
        let newScale = Math.min(
            (containerW - padding) / bounds.width,
            (containerH - padding) / bounds.height
        );
        newScale = Math.min(Math.max(newScale, 0.1), 1);

        const newX = (containerW / 2) - (bounds.centerX * newScale);
        const newY = (containerH / 2) - (bounds.centerY * newScale);

        if (offsetRef.current) offsetRef.current = { x: newX, y: newY };
        if (scaleRef.current) scaleRef.current = newScale;
        applyOffsetToDOM(newX, newY, newScale);
    }, [applyOffsetToDOM, containerRef, notesRef]);

    const toggleStraighten = useCallback(() => {
        const hasRotated = notesRef.current.some(n => n.originalRotation !== undefined);
        setNotesAndSave(prev => prev.map(n => {
            if (hasRotated) {
                const { originalRotation, ...rest } = n;
                return { ...rest, rotation: originalRotation ?? (Math.random() * 6 - 3) };
            } else {
                return { ...n, originalRotation: n.rotation, rotation: 0 };
            }
        }));
    }, [setNotesAndSave, notesRef]);

    const cycleWallStyle = useCallback(() => {
        const styles: WallStyle[] = ['dots', 'grid', 'lines', 'mesh', 'plain', 'soft'];
        setWallStyle(prev => {
            const currentIndex = styles.indexOf(prev);
            const nextStyle = styles[(currentIndex + 1) % styles.length];
            debouncedSave(notesRef.current, nextStyle);
            return nextStyle;
        });
    }, [debouncedSave, notesRef]);

    const centerContent = useCallback(() => {
        if (!containerRef.current) return;

        const { clientWidth, clientHeight } = containerRef.current;

        const centerX = clientWidth / 2;
        const centerY = clientHeight / 2;
        applyOffsetToDOM(centerX, centerY, 1);

        offsetRef.current = { x: centerX, y: centerY };
        scaleRef.current = 1;
    }, []);

    return {
        notes,
        wallStyle,
        selectedNoteId,
        menuState,
        editingTargetId,
        isStraightened,
        setNotes,
        setMenuState,
        setSelectedNoteId,
        setEditingTargetId,
        updateNote,
        deleteNote,
        createNoteAt,
        handleCopy,
        handlePaste,
        handleZoomToFit,
        toggleStraighten,
        cycleWallStyle,
        centerContent,
        offsetRef, // 导出 RefObject
        scaleRef,
        updateViewport, // 导出修改方法
        applyOffsetToDOM,
        screenToCanvas
    };
};