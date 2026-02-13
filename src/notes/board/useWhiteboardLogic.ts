// src/notes/hooks/useWhiteboardLogic.ts

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { debounce, App } from 'obsidian';
import { StickyNoteData, WhiteboardData, WallStyle, MenuState } from '../types';

// ... (getContentBounds 辅助函数保持不变) ...
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
    offsetRef: React.MutableRefObject<{ x: number; y: number }>;
    scaleRef: React.MutableRefObject<number>;
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
    currentFile: string
): UseWhiteboardLogicResult => {
    // --- 1. 状态管理 ---
    const [notes, setNotes] = useState<StickyNoteData[]>(initialNotes || []);
    const [wallStyle, setWallStyle] = useState<WallStyle>(initialWallStyle || 'dots');
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
    const [menuState, setMenuState] = useState<MenuState>({ visible: false, x: 0, y: 0, noteId: null });
    const [editingTargetId, setEditingTargetId] = useState<string | null>(null);

    // --- 2. Refs ---
    const notesRef = useRef(notes);
    const selectedIdRef = useRef(selectedNoteId);
    const clipboardRef = useRef<StickyNoteData | null>(null);
    const offsetRef = useRef({ x: 0, y: 0 });
    const scaleRef = useRef(1);
    const isReadyRef = useRef(false);

    useEffect(() => { notesRef.current = notes; }, [notes]);
    useEffect(() => { selectedIdRef.current = selectedNoteId; }, [selectedNoteId]);
    useEffect(() => {
        isReadyRef.current = true;
        return () => { isReadyRef.current = false; };
    }, []);

    // --- 3. 自动保存逻辑 ---
    const debouncedSave = useMemo(
        () => debounce((currentNotes: StickyNoteData[], currentWallStyle: WallStyle) => {
            if (!isReadyRef.current) return;
            onSave({ version: 1, wallStyle: currentWallStyle, notes: currentNotes });
        }, 1000, true),
        [onSave]
    );

    useEffect(() => {
        debouncedSave(notes, wallStyle);
    }, [notes, wallStyle, debouncedSave]);

    // --- 4. 几何变换辅助 ---
    const applyOffsetToDOM = useCallback((x: number, y: number, scale: number) => {
        if (containerRef.current) {
            containerRef.current.style.backgroundPosition = `${x}px ${y}px`;
        }
        if (notesContainerRef.current) {
            notesContainerRef.current.style.transformOrigin = '0 0';
            notesContainerRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
        }
    }, [containerRef, notesContainerRef]);

    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: (clientX - rect.left - offsetRef.current.x) / scaleRef.current,
            y: (clientY - rect.top - offsetRef.current.y) / scaleRef.current
        };
    }, [containerRef]);

    // --- 5. CRUD 操作 (包含同步保存) ---
    const updateNote = useCallback((id: string, diff: Partial<StickyNoteData>) => {
        setNotes(prev => prev.map(n => n.id === id ? { ...n, ...diff } : n));
    }, []);

    const deleteNote = useCallback((id: string) => {
        setNotes(prev => {
            const updated = prev.filter(n => n.id !== id);
            onSave({ version: 1, wallStyle: wallStyle, notes: updated });
            return updated;
        });
        if (selectedIdRef.current === id) setSelectedNoteId(null);
    }, [onSave, wallStyle]);

    const createNoteAt = useCallback((canvasX: number, canvasY: number) => {
        const isStraightened = notesRef.current.some(n => n.originalRotation !== undefined);
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
            rotation: isStraightened ? 0 : (Math.random() * 6 - 3),
            pinType: 'none',
            pinPos: 'center',
            type: 'sticky-note',
            filepath: '' // ⭐ 这里是正确的逻辑，新建时为空
        };

        setNotes(prev => {
            const updated = [...prev, newNote];
            onSave({ version: 1, wallStyle: wallStyle, notes: updated });
            return updated;
        });
        setEditingTargetId(newNote.id);
        setSelectedNoteId(newNote.id);
        setTimeout(() => setEditingTargetId(null), 100);
    }, [onSave, wallStyle]);

    // --- 6. 剪贴板逻辑 (仅限便利贴数据) ---
    const handleCopy = useCallback(() => {
        const currentSelectedId = selectedIdRef.current;
        if (!currentSelectedId) return;
        const noteToCopy = notesRef.current.find(n => n.id === currentSelectedId);
        if (noteToCopy) {
            // 复制时我们只复制数据，filepath 会包含原文件的路径（如果已保存过）
            clipboardRef.current = { ...noteToCopy };
            navigator.clipboard.writeText(noteToCopy.content).catch(err => console.error(err));
        }
    }, []);

    // ⭐【修复关键点】handlePaste
    const handlePaste = useCallback((pos?: { x: number, y: number }) => {
        if (!clipboardRef.current) return;
        const source = clipboardRef.current;
        const newId = Date.now().toString();
        const newX = pos ? (pos.x - 80) : (source.x + 20);
        const newY = pos ? (pos.y - 80) : (source.y + 20);

        const newNote: StickyNoteData = {
            ...source, // 1. 复制所有源属性（包含错误的 filepath）
            id: newId,
            x: newX,
            y: newY,
            rotation: (Math.random() * 6 - 3),
            // 2. ⭐ 强制重置 filepath 为空
            // 这样它就会被视为属于当前打开的白板文件，而不是源文件
            filepath: ''
        };

        setNotes(prev => {
            const updated = [...prev, newNote];
            onSave({ version: 1, wallStyle: wallStyle, notes: updated });
            return updated;
        });
        setSelectedNoteId(newId);
    }, [onSave, wallStyle]); // 这里的依赖看起来没问题

    // --- 7. 快捷键监听 ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const container = containerRef.current;
            if (!container || !container.matches(':hover')) return;

            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                if (selectedIdRef.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCopy();
                }
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                if (clipboardRef.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePaste();
                }
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedIdRef.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteNote(selectedIdRef.current);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleCopy, handlePaste, deleteNote, containerRef]);

    // ... (后续的 handleZoomToFit 等逻辑保持不变) ...

    const handleZoomToFit = useCallback(() => {
        if (!containerRef.current) return;
        const bounds = getContentBounds(notesRef.current);
        const { clientWidth: containerW, clientHeight: containerH } = containerRef.current;

        if (!bounds) {
            const centerX = containerW / 2;
            const centerY = containerH / 2;
            offsetRef.current = { x: centerX, y: centerY };
            scaleRef.current = 1;
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

        offsetRef.current = { x: newX, y: newY };
        scaleRef.current = newScale;
        applyOffsetToDOM(newX, newY, newScale);
    }, [applyOffsetToDOM, containerRef]);

    const toggleStraighten = useCallback(() => {
        const isStraightened = notesRef.current.some(n => n.originalRotation !== undefined);
        setNotes(prev => {
            let updated;
            if (isStraightened) {
                updated = prev.map(n => {
                    const { originalRotation, ...rest } = n;
                    return { ...rest, rotation: originalRotation ?? (Math.random() * 6 - 3) };
                });
            } else {
                updated = prev.map(n => ({ ...n, originalRotation: n.rotation, rotation: 0 }));
            }
            onSave({ version: 1, wallStyle: wallStyle, notes: updated });
            return updated;
        });
    }, [onSave, wallStyle]);

    const cycleWallStyle = useCallback(() => {
        const styles: WallStyle[] = ['dots', 'grid', 'lines', 'mesh', 'plain', 'soft'];
        setWallStyle(prev => {
            const nextStyle = styles[(styles.indexOf(prev) + 1) % styles.length];
            onSave({ version: 1, wallStyle: nextStyle, notes: notesRef.current });
            return nextStyle;
        });
    }, [onSave]);

    const centerContent = useCallback(() => {
        if (!containerRef.current) return;
        const bounds = getContentBounds(notesRef.current);
        const { clientWidth: containerW, clientHeight: containerH } = containerRef.current;

        if (!bounds) {
            const centerX = containerW / 2;
            const centerY = containerH / 2;
            offsetRef.current = { x: centerX, y: centerY };
            scaleRef.current = 1;
            applyOffsetToDOM(centerX, centerY, 1);
            return;
        }

        const newScale = 1;
        const newX = (containerW / 2) - (bounds.centerX * newScale);
        const newY = (containerH / 2) - (bounds.centerY * newScale);

        offsetRef.current = { x: newX, y: newY };
        scaleRef.current = newScale;
        applyOffsetToDOM(newX, newY, newScale);
    }, [applyOffsetToDOM, containerRef]);

    return {
        notes, wallStyle, selectedNoteId, menuState, editingTargetId,
        isStraightened: notes.some(n => n.originalRotation !== undefined),
        setNotes, setMenuState, setSelectedNoteId, setEditingTargetId,
        updateNote, deleteNote, createNoteAt, handleCopy, handlePaste,
        handleZoomToFit, toggleStraighten, cycleWallStyle, centerContent,
        offsetRef, scaleRef, applyOffsetToDOM, screenToCanvas
    };
};