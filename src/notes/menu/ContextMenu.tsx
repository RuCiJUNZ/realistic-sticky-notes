// src/notes/ContextMenu.tsx

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Platform, App, TFile, normalizePath } from 'obsidian';
import { MenuState, StickyNoteData, NoteColor } from '../types';
import { PALETTES } from '../constants';
import { BrainCoreSettings } from '../../../settings';

interface ContextMenuProps {
    app: App;
    settings: BrainCoreSettings;
    menuState: MenuState;
    note: StickyNoteData | null;
    onClose: () => void;
    onUpdate: (id: string, diff: Partial<StickyNoteData>) => void;
    onDelete: (id: string) => void;
    onCreate: (x: number, y: number) => void;
    onEdit: (id: string) => void;
    onCopy: () => void;
    onPaste: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
    app, settings, menuState, note, onClose, onUpdate, onDelete, onCreate, onEdit, onCopy, onPaste
}) => {
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    const [assetFiles, setAssetFiles] = useState<TFile[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 1. 扫描资源文件夹
    const refreshAssets = () => {
        const assetPath = normalizePath(`${settings.basePath}/Assets`);
        const folder = app.vault.getAbstractFileByPath(assetPath);

        if (folder) {
            const files = app.vault.getFiles().filter(f =>
                f.path.startsWith(assetPath + '/') &&
                ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(f.extension.toLowerCase())
            );
            setAssetFiles(files.sort((a, b) => b.stat.mtime - a.stat.mtime));
        }
    };
    useEffect(() => {
        if (menuState.visible) {
            refreshAssets();
            setIsGalleryOpen(note?.bgStyle === 'custom');
        } else {
            setIsGalleryOpen(false);
        }
    }, [menuState.visible, note?.bgStyle]);

    if (!menuState.visible) return null;

    const currentStyle = note?.style || 'realistic';
    const currentPalette = PALETTES[currentStyle];
    const isMobile = Platform.isMobile;
    // 1. 定义菜单尺寸常数
    const MENU_WIDTH = 260;
    // 预估高度：展开库时 580px，不展开约 420px，空白菜单约 120px
    const estimatedHeight = !note ? 120 : (isGalleryOpen ? 580 : 420);

    // 2. 动态计算坐标
    let finalX = menuState.x;
    let finalY = menuState.y;

    if (!isMobile) {
        // 防止右侧溢出
        if (finalX + MENU_WIDTH > window.innerWidth) {
            finalX = window.innerWidth - MENU_WIDTH - 10;
        }
        // 防止底部溢出：如果下面放不下，就往上弹
        if (finalY + estimatedHeight > window.innerHeight) {
            finalY = window.innerHeight - estimatedHeight - 10;
        }
        // 确保不会溢出顶部
        finalY = Math.max(10, finalY);
    }
    // 坐标计算
    const menuStyle: React.CSSProperties = isMobile ? {
        position: 'fixed', left: 0, bottom: 0, width: '100%', borderRadius: '24px 24px 0 0',
        background: 'var(--background-primary)', zIndex: 9999, padding: '24px',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.2)', animation: 'bc-slide-up 0.3s ease'
    } : {
        position: 'fixed', left: Math.min(menuState.x, window.innerWidth - 280),
        top: Math.max(10, Math.min(menuState.y, window.innerHeight - (isGalleryOpen ? 600 : 450))),
        width: '260px', background: 'var(--background-primary)', borderRadius: '16px',
        zIndex: 9999, padding: '16px', boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
        border: '1px solid var(--background-modifier-border)',
        transition: 'top 0.2s ease, height 0.2s ease', // 增加平滑感
    };
    // 1. 定义一个辅助函数来读取文件 (放在组件外部或类内部均可)
    const readFileAsBuffer = (file: File): Promise<ArrayBuffer> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (reader.result instanceof ArrayBuffer) {
                    resolve(reader.result);
                } else {
                    reject(new Error("Failed to read file buffer"));
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    };

    // 2. 修改后的 handleUpload
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !note) return;

        // 规范化路径
        const assetPath = normalizePath(`${settings.basePath}/Assets`);

        // 检查文件夹是否存在 (使用 Vault API)
        if (!app.vault.getAbstractFileByPath(assetPath)) {
            await app.vault.createFolder(assetPath);
        }

        // 生成唯一文件名
        const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        const finalPath = normalizePath(`${assetPath}/${fileName}`);

        try {
            // 🟢 Fix: 使用 FileReader 读取，解决 "Unexpected await" 问题
            const buffer = await readFileAsBuffer(file);

            // 创建二进制文件
            await app.vault.createBinary(finalPath, buffer);

            // 更新状态
            onUpdate(note.id, { bgStyle: 'custom', bgImage: `Assets/${fileName}` });

            // 刷新资源 (如果有这个方法的话)
            await refreshAssets();
        } catch (err) {
            console.error("Sticky Notes: Failed to upload background image", err);
            // 建议：添加用户提示
            // new Notice("Failed to upload image.");
        }

        // 重置 input，允许重复上传同一文件
        e.target.value = '';
    };
    return createPortal(
        <>
            <div className="bc-ctx-overlay" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9998 }} />

            <div className="bc-ctx-menu mini-visual" style={menuStyle} onClick={e => e.stopPropagation()}>
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    // 🟢 修复：改为箭头函数，并使用 void 忽略 Promise
                    onChange={(e) => { void handleUpload(e); }}
                    accept="image/*"
                />

                {note ? (
                    <div className="bc-visual-grid">
                        {/* A. 工具栏 */}
                        <div className="bc-row-tools">
                            <div className="tool-btn" onClick={() => { onEdit(note.id); onClose(); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></div>
                            <div className="tool-btn" onClick={() => { onCopy(); onClose(); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></div>
                            <div className="tool-btn danger" onClick={() => { onDelete(note.id); onClose(); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></div>
                        </div>

                        {/* B. 颜色 */}
                        <div className="bc-section-label">Color</div>
                        {/* 颜色点选部分 */}
                        <div className="bc-color-strip">
                            {(Object.keys(currentPalette) as NoteColor[]).map(c => (
                                <div key={c}
                                    className={`color-dot ${note.color === c ? 'active' : ''} ${c === 'transparent' ? 'is-trans' : ''}`}
                                    style={{ background: c === 'transparent' ? 'transparent' : currentPalette[c].bg }}
                                    onClick={() => onUpdate(note.id, { color: c })}
                                    title={c}
                                >
                                    {/* ⭐ 如果是透明色，显示一个斜杠标识图标 */}
                                    {c === 'transparent' && (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" style={{ width: '100%', height: '100%', padding: '4px', color: 'rgba(255,0,0,0.6)' }}>
                                            <line x1="21" y1="3" x2="3" y2="21"></line>
                                        </svg>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* C. 纹理与图片库 */}
                        <div className="bc-section-label">Background</div>
                        <div className="bc-pattern-row">
                            <div className={`pat-btn ${note.bgStyle === 'solid' ? 'active' : ''}`} onClick={() => { onUpdate(note.id, { bgStyle: 'solid', bgImage: undefined }); setIsGalleryOpen(false); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="4" y="4" width="16" height="16" rx="2" /></svg></div>
                            <div className={`pat-btn ${note.bgStyle === 'lined' ? 'active' : ''}`} onClick={() => { onUpdate(note.id, { bgStyle: 'lined', bgImage: undefined }); setIsGalleryOpen(false); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="8" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="16" y2="14" /></svg></div>
                            <div className={`pat-btn ${note.bgStyle === 'grid' ? 'active' : ''}`} onClick={() => { onUpdate(note.id, { bgStyle: 'grid', bgImage: undefined }); setIsGalleryOpen(false); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></svg></div>
                            <div className={`pat-btn ${isGalleryOpen ? 'active expand' : ''}`} onClick={() => setIsGalleryOpen(!isGalleryOpen)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                            </div>
                        </div>

                        {/* D. Mini 图片库 */}
                        {isGalleryOpen && (
                            <div className="bc-mini-gallery">
                                <div className="gallery-item upload-trigger" onClick={() => fileInputRef.current?.click()}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                </div>
                                {assetFiles.map(file => {
                                    const rPath = app.vault.adapter.getResourcePath(file.path);
                                    const isSelected = note.bgImage === `Assets/${file.name}`;
                                    return (
                                        <div key={file.path} className={`gallery-item ${isSelected ? 'active' : ''}`} onClick={() => onUpdate(note.id, { bgStyle: 'custom', bgImage: `Assets/${file.name}` })}>
                                            <img src={rPath} loading="lazy" />
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* E. 钉子 (New) */}
                        <div className="bc-section-label">Pin Type</div>
                        <div className="bc-pattern-row">
                            <div className={`pat-btn ${note.pinType === 'none' ? 'active' : ''}`} onClick={() => onUpdate(note.id, { pinType: 'none' })} title="无"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg></div>
                            <div className={`pat-btn ${note.pinType === 'circle' ? 'active' : ''}`} onClick={() => onUpdate(note.id, { pinType: 'circle' })} title="圆贴"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="6" fill="currentColor" /></svg></div>
                            <div className={`pat-btn ${note.pinType === 'tape' ? 'active' : ''}`} onClick={() => onUpdate(note.id, { pinType: 'tape' })} title="胶带"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="6" y="10" width="12" height="4" transform="rotate(-15 12 12)" /></svg></div>
                            <div className={`pat-btn ${note.pinType === 'pin' ? 'active' : ''}`} onClick={() => onUpdate(note.id, { pinType: 'pin' })} title="图钉"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="10" r="3" /><path d="M12 13v7" /></svg></div>
                            <div className={`pat-btn ${note.pinType === 'clip' ? 'active' : ''}`} onClick={() => onUpdate(note.id, { pinType: 'clip' })} title="回形针"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg></div>
                        </div>

                        {/* F. 位置 (仅在有钉子时显示) */}
                        {note.pinType && note.pinType !== 'none' && (
                            <>
                                <div className="bc-section-label">Pin Position</div>
                                <div className="bc-row-controls">
                                    <div className="bc-segmented">
                                        <div className={note.pinPos === 'left' ? 'active' : ''} onClick={() => onUpdate(note.id, { pinPos: 'left' })}>Left</div>
                                        <div className={(!note.pinPos || note.pinPos === 'center') ? 'active' : ''} onClick={() => onUpdate(note.id, { pinPos: 'center' })}>Center</div>
                                        <div className={note.pinPos === 'right' ? 'active' : ''} onClick={() => onUpdate(note.id, { pinPos: 'right' })}>Right</div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* G. 风格 & 尺寸 */}
                        <div className="bc-section-label">Style & Size</div>
                        <div className="bc-row-controls"><div className="bc-segmented">
                            <div className={note.style === 'realistic' ? 'active' : ''} onClick={() => onUpdate(note.id, { style: 'realistic' })}>Realistic</div>
                            <div className={note.style === 'geometric' ? 'active' : ''} onClick={() => onUpdate(note.id, { style: 'geometric' })}>Flat</div>
                        </div></div>
                        <div className="bc-row-controls"><div className="bc-segmented">
                            <div className={note.size === 's' ? 'active' : ''} onClick={() => onUpdate(note.id, { size: 's' })}>S</div>
                            <div className={note.size === 'm' ? 'active' : ''} onClick={() => onUpdate(note.id, { size: 'm' })}>M</div>
                            <div className={note.size === 'l' ? 'active' : ''} onClick={() => onUpdate(note.id, { size: 'l' })}>L</div>
                        </div></div>
                        {/* 在 Size 下方插入 */}
                        <div className="bc-section-label">Shape</div>
                        <div className="bc-row-controls">
                            <div className="bc-segmented">
                                <div className={note.shape === 'square' ? 'active' : ''} onClick={() => onUpdate(note.id, { shape: 'square' })} title="正方形">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}><rect x="5" y="5" width="14" height="14" rx="1" /></svg>
                                </div>
                                <div className={note.shape === 'rect-h' ? 'active' : ''} onClick={() => onUpdate(note.id, { shape: 'rect-h' })} title="横向长方形">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}><rect x="3" y="7" width="18" height="10" rx="1" /></svg>
                                </div>
                                <div className={note.shape === 'rect-v' ? 'active' : ''} onClick={() => onUpdate(note.id, { shape: 'rect-v' })} title="纵向长方形">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}><rect x="7" y="3" width="10" height="18" rx="1" /></svg>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bc-row-tools-vertical">
                        <div className="tool-btn-big" onClick={() => { onCreate(menuState.canvasX || 0, menuState.canvasY || 0); onClose(); }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg> New✨
                        </div>
                        <div className="tool-btn-big" onClick={() => { onPaste(); onClose(); }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /></svg> Paste
                        </div>
                    </div>
                )}
            </div>
        </>,
        document.body
    );
};