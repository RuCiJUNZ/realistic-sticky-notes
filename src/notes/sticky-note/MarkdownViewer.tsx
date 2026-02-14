// src/notes/components/MarkdownViewer.tsx
import React, { useEffect, useRef } from 'react';
import { MarkdownRenderer, Component, App } from 'obsidian';

interface MarkdownViewerProps {
    app: App;
    content: string;
    /** * sourcePath 用于解析相对链接和 WikiLink (例如图片 ![[]] 引用)
     * 如果是白板插件，通常可以使用当前白板文件的路径，或者空字符串（如果是根目录）
     */
    sourcePath: string;
    className?: string;
    style?: React.CSSProperties;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
    app,
    content,
    sourcePath,
    className,
    style
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    // 我们需要一个 Obsidian Component 实例来管理渲染的生命周期
    // 这里使用 useRef 保持一个持久的引用
    const componentRef = useRef<Component>(new Component());

    useEffect(() => {
        // 组件卸载时清理
        return () => {
            if (componentRef.current) {
                componentRef.current.unload();
            }
        };
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // 1. 清空旧内容
        container.empty();

        // 2. 渲染新 Markdown
        // MarkdownRenderer.render(app, markdown, containerEl, sourcePath, component)

        // 🟢 Fix: 使用 void 操作符显式忽略 Promise
        void MarkdownRenderer.render(
            app,
            content,
            container,
            sourcePath,
            componentRef.current
        );

        // 渲染后可能需要处理一下链接点击事件（可选，视需求而定）
        // Obsidian 默认渲染的链接通常需要配合主程序的事件委托

    }, [app, content, sourcePath]);

    return (
        <div
            ref={containerRef}
            className={`markdown-preview-view ${className || ''}`} // 加上 markdown-preview-view 让它继承 Obsidian 的默认样式
            style={{
                // 默认样式修正
                width: '100%',
                height: '100%',
                overflow: 'hidden', // 溢出隐藏，或者 'auto' 滚动
                userSelect: 'text', // 允许复制
                cursor: 'default',
                ...style
            }}
        />
    );
};