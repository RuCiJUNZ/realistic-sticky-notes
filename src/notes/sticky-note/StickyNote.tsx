// src/notes/StickyNote.tsx

import React, { useEffect, useRef, useState } from 'react';
import { useGesture, FullGestureState } from '@use-gesture/react';
import { App, Platform, MarkdownRenderer, Component, normalizePath, Notice } from 'obsidian';
import { StickyNoteData } from '../types';
import { BrainCoreSettings } from '../../../settings';
import { StickyNotePin } from './StickyNotePin';
import { useStickyNoteStyle } from './useStickyNoteStyle';
import { inputStopPropagationProps } from './dom';

interface StickyNoteItemProps {
    app: App;
    data: StickyNoteData;
    settings: BrainCoreSettings;
    onUpdate: (id: string, diff: Partial<StickyNoteData>) => void;
    onContextMenuTrigger: (e: { clientX: number, clientY: number }, id: string) => void;
    activeEditId: string | null;
    isSelected?: boolean;
}

export const StickyNoteItem: React.FC<StickyNoteItemProps> = ({
    app,
    settings,
    data,
    onUpdate,
    onContextMenuTrigger,
    activeEditId,
    isSelected
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [localContent, setLocalContent] = useState(data.content);
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);

    const { containerStyle, containerClass, isStickerMode } = useStickyNoteStyle(
        app,
        settings,
        data,
        isEditing,
        isSelected || false
    );

    // 辅助函数：判断交互元素
    const isInteractiveElement = (target: HTMLElement) => {
        return (
            target.closest('.internal-link') ||
            target.closest('a') ||
            target.closest('.task-list-item-checkbox') ||
            target.tagName === 'INPUT'
        );
    };

    // 渲染 Markdown (保持不变)
    useEffect(() => {
        if (isEditing || !previewRef.current) return;
        const container = previewRef.current;
        container.empty();
        const component = new Component();
        component.load();
        const activeFile = app.workspace.getActiveFile();
        const sourcePath = activeFile ? activeFile.path : '';

        // 🟢 Fix: Use void operator to ignore the promise
        void MarkdownRenderer.render(app, data.content || (isStickerMode ? "" : " "), container, sourcePath, component);

        return () => component.unload();
    }, [app, data.content, isEditing, isStickerMode]);

    // 预览模式点击处理 (保持不变)
    const handlePreviewClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const internalLink = target.closest('.internal-link') as HTMLElement;
        if (internalLink) {
            e.preventDefault(); e.stopPropagation();
            const href = internalLink.getAttribute('data-href');
            // 🟢 Fix: openLinkText is async, use void
            if (href) void app.workspace.openLinkText(href, '', true);
            return;
        }
        const checkbox = target.closest('.task-list-item-checkbox') as HTMLInputElement;
        if (checkbox) {
            e.preventDefault(); e.stopPropagation();
            const allCheckboxes = Array.from(previewRef.current?.querySelectorAll('.task-list-item-checkbox') || []);
            const index = allCheckboxes.indexOf(checkbox);
            if (index !== -1) toggleTaskAtIndex(index);
        }
    };

    const toggleTaskAtIndex = (targetIndex: number) => {
        const lines = data.content.split('\n');
        let currentTaskIndex = 0;
        const newLines = lines.map((line) => {
            const taskMatch = line.match(/^(\s*[-*]\s\[)([ xX])(\]\s.*)/);
            if (taskMatch) {
                if (currentTaskIndex === targetIndex) {
                    const currentState = taskMatch[2];
                    const newState = (currentState === ' ' ? 'x' : ' ');
                    currentTaskIndex++;
                    return `${taskMatch[1]}${newState}${taskMatch[3]}`;
                }
                currentTaskIndex++;
            }
            return line;
        });
        onUpdate(data.id, { content: newLines.join('\n') });
    };

    // 进入编辑模式
    useEffect(() => {
        if (activeEditId === data.id && !isEditing) enterEditMode();
    }, [activeEditId]);

    const enterEditMode = () => {
        setLocalContent(data.content);
        setIsEditing(true);
        setTimeout(() => {
            editorRef.current?.focus();
            editorRef.current?.setSelectionRange(localContent.length, localContent.length);
        }, 50);
    };
    // ⭐ 修复后的 handlePaste：使用手动循环检测文件重名，兼容性更好
    const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const items = e.clipboardData.items;
        let blob: Blob | null = null;

        // 1. 遍历剪贴板查找图片
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                blob = items[i].getAsFile();
                break;
            }
        }

        // 如果没有图片，直接返回，允许默认粘贴行为（如粘贴文字）
        if (!blob) return;

        // 阻止默认粘贴（避免粘贴出 blob:http... 这种临时链接）
        e.preventDefault();

        try {
            const buffer = await blob.arrayBuffer();
            const extension = blob.type.split('/')[1] || 'png';

            const activeFile = app.workspace.getActiveFile();
            const sourcePath = activeFile ? activeFile.path : '';

            // 2. 生成基本文件名 (Pasted image YYYYMMDD...)
            const now = new Date();
            const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
            const baseFileName = `Pasted image ${dateStr}`;

            // 3. 获取附件应该保存的文件夹 (TFolder)
            const parentFolder = app.fileManager.getNewFileParent(sourcePath);

            // 4. ⭐ 手动计算可用路径 (循环检测直到找到未被占用的文件名)
            let attempt = 0;
            let finalPath = '';

            while (true) {
                // 如果是第一次尝试，不加后缀；之后尝试添加 " 1", " 2" 等
                const suffix = attempt === 0 ? '' : ` ${attempt}`;
                const fileName = `${baseFileName}${suffix}.${extension}`;

                // 组合完整路径并标准化
                const testPath = normalizePath(`${parentFolder.path}/${fileName}`);

                // getAbstractFileByPath 返回 null 表示文件不存在，说明该路径可用
                if (!app.vault.getAbstractFileByPath(testPath)) {
                    finalPath = testPath;
                    break;
                }
                attempt++;
            }

            // 5. 写入文件 (创建二进制文件)
            const createdFile = await app.vault.createBinary(finalPath, buffer);

            // 6. 生成 Obsidian 风格的 Markdown 链接
            let markdownLink = app.fileManager.generateMarkdownLink(createdFile, sourcePath);

            // ⭐ 核心逻辑：如果链接不是以 ! 开头（即不是嵌入格式），手动补上感叹号
            if (!markdownLink.startsWith('!')) {
                markdownLink = `!${markdownLink}`;
            }
            // 7. 将链接插入到编辑器光标处
            insertAtCursor(markdownLink);


        } catch (error) {
            console.error('粘贴图片失败:', error);
            new Notice('粘贴图片失败，请查看控制台');
        }
    };
    // 辅助：在 Textarea 光标处插入文本
    const insertAtCursor = (textToInsert: string) => {
        const textarea = editorRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const oldText = textarea.value;

        const newText = oldText.substring(0, start) + textToInsert + oldText.substring(end);

        // 更新本地状态和上层数据
        setLocalContent(newText);
        onUpdate(data.id, { content: newText });

        // 恢复焦点并移动光标
        setTimeout(() => {
            textarea.focus();
            const newCursorPos = start + textToInsert.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
    };

    // 手势 (保持不变)
    const bind = useGesture({
        onDrag: ({ delta: [dx, dy], event, tap }: FullGestureState<'drag'>) => {
            if (isEditing || tap) return;
            if (isInteractiveElement(event.target as HTMLElement)) return;
            event.stopPropagation();
            if (event.cancelable) event.preventDefault();
            onUpdate(data.id, { x: data.x + dx, y: data.y + dy });
        }
    }, {
        drag: { from: () => [data.x, data.y], threshold: 5 },
    });

    return (
        <div
            // 🟢 修复：用 React.DOMAttributes 代替 any
            {...(bind() as unknown as React.DOMAttributes<HTMLDivElement>)}

            onDoubleClick={(e) => {
                if (isEditing || isInteractiveElement(e.target as HTMLElement)) return;
                e.stopPropagation();
                enterEditMode();
            }}
            onContextMenu={(e) => {
                if (isEditing || isInteractiveElement(e.target as HTMLElement)) return;
                e.preventDefault(); e.stopPropagation();
                onContextMenuTrigger({ clientX: e.clientX, clientY: e.clientY }, data.id);
            }}
            className={`${containerClass} ${isEditing ? 'editing' : ''} ${isSelected ? 'selected' : ''}`}
            style={containerStyle}
        >
            <StickyNotePin type={data.pinType} pos={data.pinPos} />

            {isEditing ? (
                <textarea
                    ref={editorRef}
                    className="bc-wb-editor"
                    value={localContent}
                    onChange={(e) => setLocalContent(e.target.value)}
                    // ⭐ 绑定 onPaste 事件
                    // 🟢 Fix: handlePaste is async, wrap in void if passed inline, but here it's passed by reference which is fine for React event handlers.
                    // React event handlers that return promises are generally ignored by React itself, but explicit void wrapper is safer if lint complains.
                    onPaste={(e) => { void handlePaste(e); }}
                    onKeyDown={(e) => {
                        // 支持 Shift+Enter 换行，Enter 退出 (桌面端)
                        if (e.key === 'Enter' && !e.shiftKey && !Platform.isMobile) {
                            e.preventDefault(); editorRef.current?.blur();
                        }
                        e.stopPropagation();
                    }}
                    onBlur={() => {
                        setIsEditing(false);
                        if (localContent !== data.content) onUpdate(data.id, { content: localContent });
                    }}
                    {...inputStopPropagationProps}
                />
            ) : (
                <div
                    ref={previewRef}
                    onClick={handlePreviewClick}
                    className="bc-wb-markdown-view markdown-rendered"
                    style={{
                        width: '100%', height: '100%', overflow: 'hidden',
                        textAlign: 'left', wordBreak: 'break-word',
                        pointerEvents: 'auto',
                        userSelect: 'none',
                    }}
                />
            )}
        </div>
    );
};