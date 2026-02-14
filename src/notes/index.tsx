// src/notes/index.tsx

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Notice, TFile, App, MarkdownPostProcessorContext } from 'obsidian';
import { RegisterWidget, BaseWidget, WidgetConfig } from '../../core';
import { WhiteboardComponent } from './board/Whiteboard';
import { WhiteboardFileManager } from './managers/WhiteboardFileManager';
import BrainCorePlugin from '../../main';

// =============================================================================
// 🟢 1. 定义扩展接口 (用于解决 "Unexpected any")
// =============================================================================

// 扩展 App 接口，声明 plugins 属性 (Obsidian 内部 API)
interface InternalApp extends App {
    plugins: {
        getPlugin(id: string): BrainCorePlugin | undefined;
        enabledPlugins: Set<string>;
    };
}

// 扩展 WidgetConfig，声明 context 属性
interface WidgetConfigWithContext extends WidgetConfig {
    context?: MarkdownPostProcessorContext;
    content?: string; // 确保 content 也被正确定义
}

// =============================================================================
// 2. Widget 实现
// =============================================================================

@RegisterWidget('bc-whiteboard')
export class WhiteboardWidget extends BaseWidget {
    private root: Root | null = null;
    private manager: WhiteboardFileManager | null = null;
    private plugin: BrainCorePlugin | undefined; // plugin 可能会初始化失败，所以是 undefined
    private currentBoardName: string = "default";
    private ctx: MarkdownPostProcessorContext | null = null;

    constructor(app: App, container: HTMLElement, config: WidgetConfig) {
        super(app, container, config);

        // 🟢 修复：使用类型断言为具体的扩展接口，而不是 any
        const extendedConfig = config as WidgetConfigWithContext;
        this.ctx = extendedConfig.context || null;

        if (extendedConfig.content && extendedConfig.content.trim()) {
            this.currentBoardName = extendedConfig.content.trim();
        }
    }

    private getPluginInstance(): BrainCorePlugin {
        if (BrainCorePlugin.instance) return BrainCorePlugin.instance;

        // 🟢 修复：将 app 断言为 InternalApp
        const internalApp = this.app as InternalApp;
        const instance = internalApp.plugins.getPlugin('realistic-sticky-notes');

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
        } catch {
            return;
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
        // 确保 plugin 和 manager 存在
        if (!this.manager || !this.root || !this.plugin) return;

        // 1. 读取当前白板数据
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
                onSwitchBoard={(newName) => {
                    // 定义异步逻辑
                    const switchTask = async () => {
                        this.currentBoardName = newName;
                        const latestBoards = await this.manager?.listBoards() || [];
                        this.refreshReact(latestBoards);
                        await this.updateCodeBlock(newName);
                    };

                    // 执行并捕获错误 (Obsidian 审核通常要求处理 catch)
                    switchTask().catch((error) => {
                        console.error("Failed to switch board:", error);
                        // 如果需要，可以使用 new Notice("切换白板失败") 提示用户
                    });
                }}
                // 回调：新建白板
                onCreateBoard={(newName) => {
                    // 显式执行异步任务
                    (async () => {
                        try {
                            const success = await this.manager?.createBoard(newName);
                            if (success) {
                                new Notice(`✅ 已创建白板: ${newName}`);
                                this.currentBoardName = newName;

                                // 并发或顺序执行后续更新
                                const latestBoards = await this.manager?.listBoards() || [];
                                this.refreshReact(latestBoards);
                                await this.updateCodeBlock(newName);
                            }
                        } catch (error) {
                            // 捕获可能的文件写入失败或权限问题
                            console.error("Failed to create board:", error);
                            new Notice("❌ 创建白板失败，请检查控制台日志");
                        }
                    })();
                }}

                // ⭐ 修复：新增删除回调
                onDeleteBoard={(name) => {
                    // 立即执行异步闭包
                    (async () => {
                        try {
                            // 1. 调用 manager 删除文件
                            const success = await this.manager?.deleteBoard(name);

                            if (success) {
                                new Notice(`🗑️ 已删除白板: ${name}`);

                                // 2. 获取最新列表
                                const latestBoards = await this.manager?.listBoards() || [];

                                // 3. 逻辑判断：如果删除的是当前正在显示的白板，需要自动切换
                                if (name === this.currentBoardName) {
                                    if (latestBoards.length > 0) {
                                        // 切换到列表中的第一个
                                        this.currentBoardName = latestBoards[0];
                                        await this.updateCodeBlock(this.currentBoardName);
                                    } else {
                                        // 如果删光了，清空状态
                                        this.currentBoardName = "";
                                        await this.updateCodeBlock(""); // 建议显式清空，防止残余内容
                                    }
                                }

                                // 4. 刷新 React 视图
                                this.refreshReact(latestBoards);
                            }
                        } catch (error) {
                            // 关键：捕获删除过程中的异常（如文件被占用、权限不足等）
                            console.error("Failed to delete board:", error);
                            new Notice("❌ 删除失败：无法移除该白板文件");
                        }
                    })();
                }}
            />
        );
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