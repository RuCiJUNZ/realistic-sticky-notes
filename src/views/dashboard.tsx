import React, { useState, useEffect, useRef } from 'react';
import { App, MarkdownPostProcessorContext, Notice, TFile } from 'obsidian';
import type { BrainCoreSettings } from '../../settings';
// 🟢 Fix: 使用 import type 避免循环依赖 (Circular Dependency)
import type BrainCorePlugin from '../../main';
import { ConfirmModal } from '../notes/board/ConfirmModal';
import { WhiteboardComponent } from '../notes/board/Whiteboard';
import { WhiteboardFileManager } from '../notes/managers/WhiteboardFileManager';
import { WhiteboardData } from '../notes/types';

interface DashboardProps {
    app: App;
    settings: BrainCoreSettings;
    plugin: BrainCorePlugin;
    boardName: string;
    ctx: MarkdownPostProcessorContext;
    containerEl: HTMLElement;
    initialHeight?: number;
}

// ============================================================
// 1. Logic Container
// ============================================================
const WhiteboardContainer: React.FC<{
    app: App;
    plugin: BrainCorePlugin;
    boardName: string;
    ctx: MarkdownPostProcessorContext;
    containerEl: HTMLElement;
}> = ({ app, plugin, boardName, ctx, containerEl }) => {

    const [data, setData] = useState<WhiteboardData | null>(null);
    const [fileList, setFileList] = useState<string[]>([]);
    const [currentName, setCurrentName] = useState(boardName);
    const managerRef = useRef<WhiteboardFileManager | null>(null);

    // Initialize manager strictly
    if (!managerRef.current) {
        managerRef.current = new WhiteboardFileManager(app, plugin);
    }

    // Update Markdown code block
    const updateMarkdownCodeBlock = async (newName: string) => {
        if (!ctx) return;
        const sectionInfo = ctx.getSectionInfo(containerEl);
        if (!sectionInfo) return;

        const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (file instanceof TFile) {
            const content = await app.vault.read(file);
            const lines = content.split('\n');
            const { lineStart, lineEnd } = sectionInfo;
            // 🟢 Fix: Ensure strict newline handling
            const newContent = `\`\`\`sticky-note\n${newName}\n\`\`\``;
            lines.splice(lineStart, lineEnd - lineStart + 1, newContent);
            await app.vault.modify(file, lines.join('\n'));
        }
    };

    // Data loading logic
    const loadData = async (targetName: string) => {
        if (!managerRef.current) return;
        try {
            await managerRef.current.checkAndMigrate();
            let list = await managerRef.current.listBoards();

            if (list.length === 0) {
                await managerRef.current.createBoard('default');
                list = ['default'];
            }

            // Ensure targetName exists; fallback if deleted
            let safeName = targetName;
            if (!list.includes(targetName)) {
                safeName = list[0] || 'default';
                setCurrentName(safeName);
                // Optional: Update markdown if the original board was missing
            }

            const { config, notes } = await managerRef.current.loadBoard(safeName);

            setFileList(list);
            setData({
                version: 1,
                wallStyle: config.wallStyle,
                notes: notes,
                isFullWidth: config.isFullWidth
            });
        } catch (error) {
            console.error("Load Failed:", error);
            // 🟢 Fix: Sentence case
            new Notice("Load failed");
        }
    };

    useEffect(() => {
        void loadData(currentName);
    }, [currentName]);

    // Delete handler function
    const handleDeleteBoard = (nameToDelete: string) => {
        // Prevent deleting the last remaining board
        if (fileList.length <= 1) {
            // 🟢 Fix: Sentence case
            new Notice("Cannot delete: at least one whiteboard is required.");
            return;
        }

        // Invoke Obsidian-style confirmation modal
        new ConfirmModal(
            app,
            // 🟢 Fix: Sentence case
            'Delete board',
            `Are you sure you want to delete "${nameToDelete}"? This action cannot be undone.`,
            () => {
                // 🟢 Fix: Explicit void for async closure
                void (async () => {
                    try {
                        const success = await managerRef.current?.deleteBoard(nameToDelete);
                        if (success) {
                            new Notice(`🗑️ Deleted "${nameToDelete}"`);

                            // Switch to the first board in the list
                            const newList = await managerRef.current?.listBoards();
                            const nextBoard = newList && newList.length > 0 ? newList[0] : 'default';

                            setCurrentName(nextBoard);
                            await updateMarkdownCodeBlock(nextBoard);
                        } else {
                            // 🟢 Fix: Sentence case
                            new Notice("❌ Delete failed");
                        }
                    } catch (error) {
                        console.error("Delete operation failed", error);
                        // 🟢 Fix: Sentence case
                        new Notice("❌ An error occurred. Please check the console.");
                    }
                })();
            }
        ).open();
    };

    if (!data) return <div className="bc-loading">Loading...</div>;

    return (
        <WhiteboardComponent
            app={app}
            settings={plugin.settings}
            plugin={plugin}
            initialNotes={data.notes}
            initialWallStyle={data.wallStyle}
            fileList={fileList}
            currentFile={currentName}

            onSave={(newData) => {
                void managerRef.current?.saveBoard(currentName, newData);
            }}

            onSwitchBoard={(newName) => {
                setCurrentName(newName);
                void updateMarkdownCodeBlock(newName).catch(err => {
                    console.error(err);
                });
            }}

            onCreateBoard={(newName) => {
                void (async () => {
                    try {
                        const success = await managerRef.current?.createBoard(newName);

                        if (success) {
                            new Notice(`✅ Created "${newName}"`);
                            setCurrentName(newName);
                            await updateMarkdownCodeBlock(newName);
                        } else {
                            // 🟢 Fix: Sentence case
                            new Notice(`⚠️ Failed to create "${newName}". It might already exist.`);
                        }
                    } catch (error) {
                        console.error("Error creating board:", error);
                        // 🟢 Fix: Sentence case
                        new Notice("❌ Error: could not create board. Check console for details.");
                    }
                })();
            }}

            onDeleteBoard={handleDeleteBoard}
        />
    );
};

// ============================================================
// 2. Main Dashboard Component
// ============================================================
export const Dashboard: React.FC<DashboardProps> = ({
    app,
    plugin,
    boardName,
    ctx,
    containerEl,
    initialHeight = 600
}) => {
    const [containerHeight, setContainerHeight] = useState(initialHeight);
    const [isDragging, setIsDragging] = useState(false);

    // Refs to store values for the event listener closure
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);

    // 🟢 Fix: Type the React Event strictly
    const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();

        // 🟢 Fix: Capture on currentTarget (the handle), not target
        e.currentTarget.setPointerCapture(e.pointerId);

        setIsDragging(true);
        startYRef.current = e.clientY;
        startHeightRef.current = containerHeight;
    };

    useEffect(() => {
        if (!isDragging) return;

        // 🟢 Fix: Window events are Native PointerEvents, not React.PointerEvent
        const handlePointerMove = (e: PointerEvent) => {
            e.preventDefault();
            const deltaY = e.clientY - startYRef.current;
            // Limit minimum height to 200px
            setContainerHeight(Math.max(200, startHeightRef.current + deltaY));
        };

        const handlePointerUp = () => {
            setIsDragging(false);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [isDragging]);

    return (
        <div
            className="brain-core-dashboard-wrapper"
            style={{
                width: '100%',
                height: `${containerHeight}px`,
                position: 'relative',
                transition: isDragging ? 'none' : 'height 0.2s ease',
                // Use CSS variables for theming compatibility
                border: '1px solid var(--background-modifier-border)',
                borderRadius: '8px',
                overflow: 'hidden',
                touchAction: 'none'
            }}
        >
            <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
                <WhiteboardContainer
                    app={app}
                    plugin={plugin}
                    boardName={boardName}
                    ctx={ctx}
                    containerEl={containerEl}
                />
            </div>

            <div
                className={`brain-core-resize-handle ${isDragging ? 'is-dragging' : ''}`}
                onPointerDown={handleResizeStart}
                // 🟢 Fix: Sentence case
                title="Drag to resize height"
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    height: '24px',
                    background: 'transparent',
                    cursor: 'ns-resize',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10,
                    touchAction: 'none'
                }}
            />
        </div>
    );
};