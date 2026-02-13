// src/core/Dashboard.tsx

import React, { useState, useEffect, useRef } from 'react';
import { App, MarkdownPostProcessorContext, Notice, TFile, Platform } from 'obsidian';
import { BrainCoreSettings } from '../../settings';
import BrainCorePlugin from '../../main';
import { ConfirmModal } from '../notes/board/ConfirmModal'; // 导入弹窗类
// 引入你的 UI 组件和文件管理器
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
// 1. 逻辑容器组件 (增强版)
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

    if (!managerRef.current) {
        managerRef.current = new WhiteboardFileManager(app, plugin);
    }

    // 更新 Markdown 代码块
    const updateMarkdownCodeBlock = async (newName: string) => {
        if (!ctx) return;
        const sectionInfo = ctx.getSectionInfo(containerEl);
        if (!sectionInfo) return;
        const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (file instanceof TFile) {
            const content = await app.vault.read(file);
            const lines = content.split('\n');
            const { lineStart, lineEnd } = sectionInfo;
            const newContent = `\`\`\`sticky-note\n${newName}\n\`\`\``;
            lines.splice(lineStart, lineEnd - lineStart + 1, newContent);
            await app.vault.modify(file, lines.join('\n'));
        }
    };

    // 数据加载逻辑
    const loadData = async (targetName: string) => {
        if (!managerRef.current) return;
        try {
            await managerRef.current.checkAndMigrate();
            let list = await managerRef.current.listBoards();

            if (list.length === 0) {
                await managerRef.current.createBoard('default');
                list = ['default'];
            }

            // 确保 targetName 存在，如果已被删除则回退到 default 或列表第一个
            let safeName = targetName;
            if (!list.includes(targetName)) {
                safeName = list[0] || 'default';
                setCurrentName(safeName);
                // 注意：这里可能需要更新 markdown，视具体逻辑而定
                // updateMarkdownCodeBlock(safeName);
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
            new Notice("加载失败");
        }
    };

    useEffect(() => {
        loadData(currentName);
    }, [currentName]);

    // 删除处理函数
    const handleDeleteBoard = (nameToDelete: string) => {
        if (fileList.length <= 1) {
            new Notice("Cannot delete: At least one whiteboard is required.");
            return;
        }

        // 调用 Obsidian 风格确认弹窗
        new ConfirmModal(
            app,
            'Delete Board',
            `Are you sure you want to delete "${nameToDelete}"? This action cannot be undone.`,
            async () => {
                const success = await managerRef.current?.deleteBoard(nameToDelete);
                if (success) {
                    new Notice(`Deleted: ${nameToDelete}`);
                    // 删除后切换到列表里的第一个（或者默认）
                    const newList = await managerRef.current?.listBoards();
                    const nextBoard = newList && newList.length > 0 ? newList[0] : 'default';

                    setCurrentName(nextBoard);
                    await updateMarkdownCodeBlock(nextBoard);
                    // 重新加载数据会由 useEffect 触发
                } else {
                    new Notice("删除失败");
                }
            }
        ).open();
    };

    if (!data) return <div className="bc-loading">Loading...</div>;

    return (
        <WhiteboardComponent
            // ⭐ 核心修复：移除 key 属性
            // 之前是 key={currentName}，这会导致每次切换白板组件都重新挂载，从而重置工具栏状态。
            // 移除后，组件会复用，你需要确保 WhiteboardComponent 内部监听了 initialNotes 的变化来更新画布。

            app={app}
            settings={plugin.settings}
            plugin={plugin}
            initialNotes={data.notes}
            initialWallStyle={data.wallStyle}
            fileList={fileList}
            currentFile={currentName}

            onSave={(newData) => {
                managerRef.current?.saveBoard(currentName, newData);
            }}

            onSwitchBoard={async (newName) => {
                setCurrentName(newName);
                await updateMarkdownCodeBlock(newName);
            }}

            onCreateBoard={async (newName) => {
                const success = await managerRef.current?.createBoard(newName);
                if (success) {
                    new Notice(`Created: ${newName}`);
                    setCurrentName(newName);
                    await updateMarkdownCodeBlock(newName);
                }
            }}

            // 传入删除方法
            onDeleteBoard={handleDeleteBoard}
        />
    );
};

// ============================================================
// 2. 主 Dashboard 组件 (外壳)
// ============================================================
export const Dashboard: React.FC<DashboardProps> = ({
    app,
    settings,
    plugin,
    boardName,
    ctx,
    containerEl,
    initialHeight = 600
}) => {
    // 拖拽逻辑保持不变
    const [containerHeight, setContainerHeight] = useState(initialHeight);
    const [isDragging, setIsDragging] = useState(false);
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);

    const handleResizeStart = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        setIsDragging(true);
        startYRef.current = e.clientY;
        startHeightRef.current = containerHeight;
    };

    useEffect(() => {
        if (!isDragging) return;
        const handlePointerMove = (e: PointerEvent) => {
            e.preventDefault();
            const deltaY = e.clientY - startYRef.current;
            setContainerHeight(Math.max(200, startHeightRef.current + deltaY));
        };
        const handlePointerUp = (e: PointerEvent) => {
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
                title="拖拽调整高度"
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