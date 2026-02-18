import React from 'react';
import { createRoot, Root } from 'react-dom/client';
// 🟢 Fix: Explicit type import to resolve linter errors
import { Notice, TFile, App } from 'obsidian';
import type { MarkdownPostProcessorContext } from 'obsidian';
import { RegisterWidget, BaseWidget, WidgetConfig } from '../../core';
import { WhiteboardComponent } from './board/Whiteboard';
import { WhiteboardFileManager } from './managers/WhiteboardFileManager';
import BrainCorePlugin from '../../main';

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
                        // 🟢 Fix: Add void to handle the promise (no floating promises)
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

                    // Callback: Delete Board
                    onDeleteBoard={(name) => {
                        void (async () => {
                            try {
                                const success = await this.manager?.deleteBoard(name);

                                if (success) {
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
            setTimeout(() => {
                this.root?.unmount();
                this.root = null;
            }, 0);
        }
    }
}