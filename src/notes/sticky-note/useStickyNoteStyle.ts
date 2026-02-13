// src/notes/hooks/useStickyNoteStyle.ts
import { useMemo, CSSProperties } from 'react';
import { App, normalizePath } from 'obsidian';
import { StickyNoteData } from '../types';
import { BrainCoreSettings } from '../../../settings';
import { SIZE_MAP, SHAPE_MAP, PALETTES } from '../constants';

export const useStickyNoteStyle = (
    app: App,
    settings: BrainCoreSettings,
    data: StickyNoteData,
    isEditing: boolean,
    isSelected: boolean = false
) => {
    // 1. 基础尺寸计算
    const { width, height } = useMemo(() => {
        const baseSize = SIZE_MAP[data.size] || SIZE_MAP['m']; // 增加默认值防止报错
        const ratio = SHAPE_MAP[data.shape] || SHAPE_MAP['square'];
        return {
            width: baseSize * ratio.w,
            height: baseSize * ratio.h
        };
    }, [data.size, data.shape]);

    // 2. 颜色与主题
    const theme = useMemo(() => {
        const currentStyle = data.style || 'realistic';
        // 增加兜底逻辑：如果找不到颜色，默认黄色
        return PALETTES[currentStyle]?.[data.color] || PALETTES[currentStyle]?.['yellow'] || { bg: '#fff', text: '#000' };
    }, [data.style, data.color]);

    // 3. 背景模式判断
    const isCustomBg = data.bgStyle === 'custom' && !!data.bgImage;
    const isStickerMode = data.color === 'transparent' && data.bgStyle === 'custom';
    const bgStyleClass = `bc-bg-${data.bgStyle || 'solid'}`;

    // 4. 背景图路径处理 (带缓存)
    const bgImageUrl = useMemo(() => {
        if (!isCustomBg || !data.bgImage) return undefined;
        if (data.bgImage.startsWith('data:')) return `url(${data.bgImage})`;

        const fullVaultPath = normalizePath(`${settings.basePath}/${data.bgImage}`);
        try {
            const resourcePath = app.vault.adapter.getResourcePath(fullVaultPath);
            return `url(${resourcePath})`;
        } catch (e) {
            console.warn("Failed to load background image:", fullVaultPath);
            return undefined;
        }
    }, [data.bgImage, isCustomBg, app, settings.basePath]);

    // 5. 旋转逻辑 (核心优化：有背景图时强制回正)
    const visualRotation = isCustomBg ? 0 : data.rotation;

    // 6. 整合最终样式对象
    const containerStyle: CSSProperties = useMemo(() => ({
        left: data.x,
        top: data.y,
        width,
        height,
        backgroundColor: theme.bg,
        color: theme.text,
        backgroundImage: bgImageUrl,
        backgroundSize: isCustomBg ? 'cover' : undefined,
        backgroundPosition: isCustomBg ? 'center' : undefined,
        backgroundRepeat: isCustomBg ? 'no-repeat' : undefined,
        transform: `rotate(${visualRotation}deg)`,
        zIndex: isEditing ? 999 : (isSelected ? 100 : 1),
        boxShadow: isSelected
            ? '0 0 0 2px var(--interactive-accent)'
            : (isStickerMode ? 'none' : undefined),
        border: (data.color === 'transparent' && !data.bgImage)
            ? '2px dashed var(--text-muted)' // 兜底边框
            : 'none'
    }), [
        data.x, data.y, width, height, theme, bgImageUrl, isCustomBg,
        visualRotation, isEditing, isSelected, isStickerMode, data.color, data.bgImage
    ]);

    // 返回：样式对象、类名、以及组件需要的标志位
    return {
        containerStyle,
        containerClass: `bc-wb-note style-${data.style || 'realistic'} ${bgStyleClass}`,
        isStickerMode
    };
};