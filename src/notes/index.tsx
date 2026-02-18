import React from 'react';
import { createRoot, Root } from 'react-dom/client';
// 🟢 Fix: 合并导入，确保 MarkdownPostProcessorContext 被正确识别
import {
    App,
    Notice,
    TFile,
    MarkdownPostProcessorContext
} from 'obsidian';
import { RegisterWidget, BaseWidget, WidgetConfig } from '../../core';
import { WhiteboardComponent } from './board/Whiteboard';
import { WhiteboardFileManager } from './managers/WhiteboardFileManager';
// 🟢 Fix: 使用 import type 避免循环引用
import type BrainCorePlugin from '../../main';

// =============================================================================
// 1. Definition
// =============================================================================

interface WidgetConfigWithContext extends WidgetConfig {
    context?: MarkdownPostProcessorContext;
    content?: string;
}

// =============================================================================
// 2. Widget Implementation
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

        const extendedConfig = config as WidgetConfigWithContext;
        this.ctx = extendedConfig.context || null;

        if (extendedConfig.content && extendedConfig.content.trim()) {
            this.currentBoardName = extendedConfig.content.trim();
        }
    }

    // Helper to safely access plugin instance
    private getPluginInstance(): BrainCorePlugin {
        // @ts-ignore: Accessing static instance for widget initialization
        const instance = window.app.plugins.plugins['brain-core'] as BrainCorePlugin;

        // Fallback to static instance if available (depending on your architecture)
        // Since we changed import to 'type', we can't access BrainCorePlugin.instance directly
        // unless we cast or use the global app.plugins method which is safer for loose coupling.
        // Assuming your main.ts still exports the class implementation for runtime:
        if (instance) return instance;

        console.error("[BrainCore] Plugin instance is missing.");
        throw new Error("BrainCore plugin not loaded");
    }

    async render() {
        this.container.addClass('bc-transparent-widget');

        try {
            this.plugin = this.getPluginInstance();
        } catch (e) {
            return;
        }

        this.manager = new WhiteboardFileManager(this.app, this.plugin);

        try {
            await this.manager.checkAndMigrate();

            let boards = await this.manager.listBoards();

            if (boards.length === 0) {
                await this.manager.createBoard('default');
                boards = ['default'];

                const isInvalidName = !this.currentBoardName || this.currentBoardName === 'realistic-sticky-notes';
                if (isInvalidName) {
                    this.currentBoardName = 'default';
                }
            }

            if (!this.root) this.root = createRoot(this.container);

            await this.refreshReact(boards);

        } catch (error) {
            console.error("Failed to render whiteboard widget:", error);
            // Sentence case
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
            const data = await this.manager.loadBoard(this.currentBoardName);

            this.root.render(
                <WhiteboardComponent
                    key={this.currentBoardName}
                    initialNotes={data.notes}
                    initialWallStyle={data.config.wallStyle}
                    fileList={boards}
                    currentFile={this.currentBoardName}
                    app={this.app}
                    settings={this.plugin.settings}
                    plugin={this.plugin}

                    // Callback: Save
                    onSave={(newData) => {
                        // 🟢 Fix: Add void to handle the promise
                        void this.manager?.saveBoard(this.currentBoardName, newData).catch(err => {
                            console.error("Auto-save failed:", err);
                        });
                    }}

                    // Callback: Switch Board
                    onSwitchBoard={(newName) => {
                        void (async () => {
                            try {
                                this.currentBoardName = newName;
                                const latestBoards = await this.manager?.listBoards() || [];
                                await this.refreshReact(latestBoards);
                                await this.updateCodeBlock(newName);
                            } catch (error) {
                                console.error("Failed to switch board:", error);
                                // Sentence case
                                new Notice("Failed to switch board.");
                            }
                        })();
                    }}

                    // Callback: Create Board
                    onCreateBoard={(newName) => {
                        void (async () => {
                            try {
                                const success = await this.manager?.createBoard(newName);
                                if (success) {
                                    // Sentence case
                                    new Notice(`✅ Created "${newName}"`);
                                    this.currentBoardName = newName;

                                    const latestBoards = await this.manager?.listBoards() || [];
                                    await this.refreshReact(latestBoards);
                                    await this.updateCodeBlock(newName);
                                } else {
                                    // Sentence case
                                    new Notice(`⚠️ Board "${newName}" already exists.`);
                                }
                            } catch (error) {
                                console.error("Failed to create board:", error);
                                // Sentence case
                                new Notice("❌ Failed to create board. Check console.");
                            }
                        })();
                    }}

                    // Callback: Delete Board
                    onDeleteBoard={(name) => {
                        void (async () => {
                            try {
                                const success = await this.manager?.deleteBoard(name);

                                if (success) {
                                    // Sentence case
                                    new Notice(`🗑️ Deleted "${name}"`);

                                    const latestBoards = await this.manager?.listBoards() || [];

                                    if (name === this.currentBoardName) {
                                        if (latestBoards.length > 0) {
                                            this.currentBoardName = latestBoards[0];
                                            await this.updateCodeBlock(this.currentBoardName);
                                        } else {
                                            this.currentBoardName = "";
                                            await this.updateCodeBlock("");
                                        }
                                    }

                                    await this.refreshReact(latestBoards);
                                }
                            } catch (error) {
                                console.error("Failed to delete board:", error);
                                // Sentence case
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
            // Keep setTimeout to prevent React 18 strict mode double-invoke issues during fast unloads
            setTimeout(() => {
                this.root?.unmount();
                this.root = null;
            }, 0);
        }
    }
}