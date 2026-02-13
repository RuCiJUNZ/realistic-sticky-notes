// src/views/react-host.tsx

import { MarkdownPostProcessorContext, MarkdownRenderChild, App } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import React from "react";
import BrainCorePlugin from "../../main";

// ⚠️ 注意检查路径：
// 如果你的 Dashboard 在 src/core/Dashboard.tsx，这里应该改为：
// import { Dashboard } from "../../core/Dashboard";
import { Dashboard } from "./dashboard";

export class ReactHost extends MarkdownRenderChild {
    private root: Root | null = null;

    constructor(
        containerEl: HTMLElement,
        private boardName: string,
        private plugin: BrainCorePlugin, // 这里已经拿到了 plugin
        private ctx: MarkdownPostProcessorContext
    ) {
        super(containerEl);
    }

    /**
     * 当 Obsidian 渲染该代码块时触发
     */
    onload() {
        const nameToUse = this.boardName.trim() || "default";

        // 确保容器存在
        if (!this.containerEl) return;

        this.root = createRoot(this.containerEl);

        this.root.render(
            <Dashboard
                app={this.plugin.app}
                settings={this.plugin.settings}

                // ⭐⭐ 关键修复：把 plugin 实例传给 React 组件 ⭐⭐
                plugin={this.plugin}

                boardName={nameToUse}
                ctx={this.ctx}
                containerEl={this.containerEl}
            />
        );
    }

    /**
     * 当代码块被移除、文件关闭或插件卸载时触发
     */
    onunload() {
        if (this.root) {
            // 异步卸载更安全，防止React正在更新时被卸载
            setTimeout(() => {
                this.root?.unmount();
                this.root = null;
            }, 0);
        }
    }
}