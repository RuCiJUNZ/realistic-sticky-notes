// src/notes/index.tsx

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
// 🟢 Fix 1: 正确引入类型，避免编译报错
import { Notice, TFile, App, type MarkdownPostProcessorContext } from 'obsidian';
import { RegisterWidget, BaseWidget, WidgetConfig } from '../../core';
import { WhiteboardComponent } from './board/Whiteboard';
import { WhiteboardFileManager } from './managers/WhiteboardFileManager';
import BrainCorePlugin from '../../main';

// =============================================================================
// 1. 定义扩展接口
// =============================================================================

// 扩展 WidgetConfig，声明 context 属性
interface WidgetConfigWithContext extends WidgetConfig {
    context?: MarkdownPostProcessorContext;
    content?: string;
}

// =============================================================================
// 2. Widget 实现
// =============================================================================

@RegisterWidget('bc-whiteboard')
export class WhiteboardWidget extends BaseWidget {
    private root: Root | null = null;
    private manager: WhiteboardFileManager | null = null;
    private plugin: BrainCorePlugin | undefined;
    private currentBoardName: string = "default";
    private ctx: MarkdownPostProcessorContext | null = null;

    constructor(app: App, container: HTMLElement, config: WidgetConfig) {
        super(app, container, config);

        // 类型断言
        const extendedConfig = config as WidgetConfigWithContext;
        this.ctx = extendedConfig.context || null;

        if (extendedConfig.content && extendedConfig.content.trim()) {
            this.currentBoardName = extendedConfig.content.trim();
        }
    }

    // 🟢 Fix 3: 安全获取插件实例
    private getPluginInstance(): BrainCorePlugin {
        if (BrainCorePlugin.instance) {
            return BrainCorePlugin.instance;
        }
        console.error("[BrainCore] Plugin instance is missing.");
        throw new Error("BrainCore plugin not loaded");
    }

    async render() {
        this.container.addClass('bc-transparent-widget');

        try {
            this.plugin = this.getPluginInstance();
        } catch (e) {
            return; // 插件未加载时优雅退出
        }

        // 初始化文件管理器
        this.manager = new WhiteboardFileManager(this.app, this.plugin);

        try {
            // 执行迁移
            await this.manager.checkAndMigrate();

            // 获取白板列表
            let boards = await this.manager.listBoards();

            // 如果没有白板，创建默认白板
            if (boards.length === 0) {
                await this.manager.createBoard('default');
                boards = ['default'];

                // 重置当前名称
                const isInvalidName = !this.currentBoardName || this.currentBoardName === 'realistic-sticky-notes';
                if (isInvalidName) {
                    this.currentBoardName = 'default';
                }
            }

            // 启动 React
            if (!this.root) this.root = createRoot(this.container);

            // 渲染
            await this.refreshReact(boards);

        } catch (error) {
            console.error("Failed to render whiteboard widget:", error);
            new Notice("Failed to load sticky notes.");
        }
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
        if (!this.manager || !this.root || !this.plugin) return;

        try {
            // 1. 读取当前白板数据
            const data = await this.manager.loadBoard(this.currentBoardName);

            // 2. 渲染组件
            this.root.render(
                <WhiteboardComponent
                    key={this.currentBoardName} // Key 变化会重置组件状态

                    // 数据
                    initialNotes={data.notes}
                    initialWallStyle={data.config.wallStyle}
                    fileList={boards}
                    currentFile={this.currentBoardName}

                    // 依赖
                    app={this.app}
                    settings={this.plugin.settings}
                    plugin={this.plugin}

                    // 回调：保存 (fire-and-forget)
                    onSave={(newData) => {
                        this.manager?.saveBoard(this.currentBoardName, newData).catch(err => {
                            console.error("Auto-save failed:", err);
                        });
                    }}

                    // 回调：切换白板
                    onSwitchBoard={(newName) => {
                        void (async () => {
                            try {
                                this.currentBoardName = newName;
                                const latestBoards = await this.manager?.listBoards() || [];
                                await this.refreshReact(latestBoards);
                                await this.updateCodeBlock(newName);
                            } catch (error) {
                                console.error("Failed to switch board:", error);
                                new Notice("Failed to switch board.");
                            }
                        })();
                    }}

                    // 回调：新建白板
                    onCreateBoard={(newName) => {
                        void (async () => {
                            try {
                                const success = await this.manager?.createBoard(newName);
                                if (success) {
                                    // 🟢 Fix: UI Text Consistency (Removed colon, added quotes)
                                    new Notice(`✅ Created "${newName}"`);
                                    this.currentBoardName = newName;

                                    const latestBoards = await this.manager?.listBoards() || [];
                                    await this.refreshReact(latestBoards);
                                    await this.updateCodeBlock(newName);
                                } else {
                                    new Notice(`⚠️ Board "${newName}" already exists.`);
                                }
                            } catch (error) {
                                console.error("Failed to create board:", error);
                                new Notice("❌ Failed to create board. Check console.");
                            }
                        })();
                    }}

                    // 回调：删除白板
                    onDeleteBoard={(name) => {
                        void (async () => {
                            try {
                                const success = await this.manager?.deleteBoard(name);

                                if (success) {
                                    new Notice(`🗑️ Deleted "${name}"`);

                                    const latestBoards = await this.manager?.listBoards() || [];

                                    // 如果删除的是当前板，切换到其他板
                                    if (name === this.currentBoardName) {
                                        if (latestBoards.length > 0) {
                                            this.currentBoardName = latestBoards[0];
                                            await this.updateCodeBlock(this.currentBoardName);
                                        } else {
                                            this.currentBoardName = ""; // 清空
                                            await this.updateCodeBlock("");
                                        }
                                    }

                                    await this.refreshReact(latestBoards);
                                }
                            } catch (error) {
                                console.error("Failed to delete board:", error);
                                new Notice("❌ Failed to delete board.");
                            }
                        })();
                    }}
                />
            );
        } catch (error) {
            console.error("Error refreshing React component:", error);
        }
    }

    onunload() {
        if (this.root) {
            // 使用 setTimeout 确保在 React 渲染周期结束后卸载
            setTimeout(() => {
                this.root?.unmount();
                this.root = null;
            }, 0);
        }
    }
}