// src/notes/index.tsx

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Notice, TFile, normalizePath, App, MarkdownPostProcessorContext } from 'obsidian';
// 假设这些导入路径是正确的
import { RegisterWidget, BaseWidget, WidgetConfig } from '../../core';
import { WhiteboardComponent } from './board/Whiteboard';
import { WhiteboardFileManager } from './managers/WhiteboardFileManager';
import BrainCorePlugin from '../../main';

@RegisterWidget('bc-whiteboard')
export class WhiteboardWidget extends BaseWidget {
    private root: Root | null = null;
    private manager: WhiteboardFileManager | null = null;
    private plugin: BrainCorePlugin;
    private currentBoardName: string = "default";
    private ctx: MarkdownPostProcessorContext | null = null;

    constructor(app: App, container: HTMLElement, config: WidgetConfig) {
        super(app, container, config);
        this.ctx = (config as any).context;
        if (config.content && config.content.trim()) {
            this.currentBoardName = config.content.trim();
        }
    }

    private getPluginInstance(): BrainCorePlugin {
        if (BrainCorePlugin.instance) return BrainCorePlugin.instance;
        // 注意：这里的 ID 'sticky-notes' 必须和 manifest.json 里的 id 一致
        const instance = (this.app as any).plugins.getPlugin('realistic-sticky-notes');
        if (!instance) {
            console.error("[BrainCore] Critical Error: Plugin instance not found!");
            throw new Error("Plugin instance not found");
        }
        return instance;
    }

    async render() {
        this.container.addClass('bc-transparent-widget');

        try {
            this.plugin = this.getPluginInstance();
        } catch (e) {
            return; // 无法获取插件实例，停止渲染防止崩溃
        }

        // 初始化文件管理器
        this.manager = new WhiteboardFileManager(this.app, this.plugin);

        // 执行迁移
        await this.manager.checkAndMigrate();

        // 获取白板列表
        let boards = await this.manager.listBoards();

        // 如果没有白板，创建默认白板
        if (boards.length === 0) {
            await this.manager.createBoard('default');
            boards = ['default'];
            if (!this.currentBoardName || this.currentBoardName === 'realistic-sticky-notes') {
                this.currentBoardName = 'default';
            }
        }

        // 启动 React
        if (!this.root) this.root = createRoot(this.container);

        // 渲染
        this.refreshReact(boards);
    }

    private async updateCodeBlock(newBoardName: string) {
        if (!this.ctx) return;
        const sectionInfo = this.ctx.getSectionInfo(this.container);
        if (!sectionInfo) return;

        const file = this.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
        if (file instanceof TFile) {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            const startLine = sectionInfo.lineStart;
            const endLine = sectionInfo.lineEnd;
            const newContent = `\`\`\`sticky-note\n${newBoardName}\n\`\`\``;
            lines.splice(startLine, endLine - startLine + 1, newContent);
            await this.app.vault.modify(file, lines.join('\n'));
        }
    }

    private async refreshReact(boards: string[]) {
        if (!this.manager || !this.root) return;

        // 1. 读取当前白板数据
        // loadBoard 现在返回 { config: BoardConfig, notes: StickyNoteData[] }
        const data = await this.manager.loadBoard(this.currentBoardName);

        // 2. 渲染组件
        this.root.render(
            <WhiteboardComponent
                // Key 变化会重置组件状态
                key={this.currentBoardName}

                // 传递数据
                initialNotes={data.notes}
                initialWallStyle={data.config.wallStyle}
                fileList={boards}
                currentFile={this.currentBoardName}

                // 传递上下文依赖
                app={this.app}
                settings={this.plugin.settings}
                plugin={this.plugin}

                // 回调：保存
                onSave={(newData) => {
                    this.manager?.saveBoard(this.currentBoardName, newData);
                }}

                // 回调：切换白板
                onSwitchBoard={async (newName) => {
                    this.currentBoardName = newName;
                    const latestBoards = await this.manager?.listBoards() || [];
                    this.refreshReact(latestBoards);
                    await this.updateCodeBlock(newName);
                }}

                // 回调：新建白板
                onCreateBoard={async (newName) => {
                    const success = await this.manager?.createBoard(newName);
                    if (success) {
                        new Notice(`已创建白板: ${newName}`);
                        this.currentBoardName = newName;
                        const latestBoards = await this.manager?.listBoards() || [];
                        this.refreshReact(latestBoards);
                        await this.updateCodeBlock(newName);
                    }
                }}

                // ⭐ 修复：新增删除回调
                onDeleteBoard={async (name) => {
                    // 1. 调用 manager 删除文件 (假设 manager 有 deleteBoard 方法)
                    const success = await this.manager?.deleteBoard(name);

                    if (success) {
                        new Notice(`已删除白板: ${name}`);

                        // 2. 获取最新列表
                        const latestBoards = await this.manager?.listBoards() || [];

                        // 3. 逻辑判断：如果删除的是当前正在显示的白板，需要自动切换
                        if (name === this.currentBoardName) {
                            if (latestBoards.length > 0) {
                                // 切换到列表中的第一个
                                this.currentBoardName = latestBoards[0];
                                await this.updateCodeBlock(this.currentBoardName);
                            } else {
                                // 如果删光了，可能需要处理空状态
                                this.currentBoardName = "";
                                // 可以选择清空 CodeBlock 或者显示默认信息
                            }
                        }

                        // 4. 刷新 React 视图
                        this.refreshReact(latestBoards);
                    }
                }}
            />
        );
    }

    onunload() {
        if (this.root) {
            setTimeout(() => {
                this.root?.unmount();
                this.root = null;
            }, 0);
        }
    }
}