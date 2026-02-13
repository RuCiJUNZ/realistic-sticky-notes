// constants.ts
// 如果 types.ts 里没有导出 Palette，我们可以在这里临时定义或者去 types.ts 里补上导出
// 这里假设 types.ts 里已经有了 NoteColor 和 NoteStyle
import { NoteStyle, NoteColor } from './types';

export const DATA_FILENAME = "便利贴.md";
export const CODE_BLOCK_TAG = "sticky-note";

export const SIZE_MAP = { s: 120, m: 180, l: 240 };

export const SHAPE_MAP = {
    'square': { w: 1, h: 1 },
    'rect-h': { w: 1.3, h: 0.8 },
    'rect-v': { w: 0.8, h: 1.3 }
};

// 简单定义 Palette 结构，防止引用报错
export interface ColorTheme {
    bg: string;
    text: string;
    name: string;
}
export type Palette = Record<NoteColor, ColorTheme>;

// 调色板定义
export const PALETTES: Record<NoteStyle, Palette> = {
    realistic: {
        yellow: { bg: '#fef9c3', text: '#854d0e', name: '黄' },
        blue: { bg: '#dbeafe', text: '#1e40af', name: '蓝' },
        green: { bg: '#dcfce7', text: '#166534', name: '绿' },
        red: { bg: '#fee2e2', text: '#991b1b', name: '红' },
        purple: { bg: '#f3e8ff', text: '#6b21a8', name: '紫' },
        transparent: { bg: 'transparent', text: 'var(--text-normal)', name: '透明' }
    },
    geometric: {
        yellow: { bg: '#fbf848', text: '#202020', name: '黄' },
        blue: { bg: '#8ae3f2', text: '#202020', name: '蓝' },
        green: { bg: '#ccff90', text: '#202020', name: '绿' },
        red: { bg: '#ff8a80', text: '#202020', name: '红' },
        purple: { bg: '#ea80fc', text: '#202020', name: '紫' },
        transparent: { bg: 'transparent', text: 'var(--text-normal)', name: '透明' }
    }
};