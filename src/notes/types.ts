// src/notes/types.ts

// ==========================================
// 1. 便利贴的基础属性定义
// ==========================================

export type PinType = 'none' | 'circle' | 'tape' | 'pin' | 'clip';
export type PinPos = 'left' | 'center' | 'right';
export type NoteSize = 's' | 'm' | 'l';
export type NoteShape = 'square' | 'rect-h' | 'rect-v';
export type NoteColor = 'yellow' | 'blue' | 'red' | 'green' | 'purple' | 'transparent';
export type NoteStyle = 'realistic' | 'geometric';
export type NoteBgStyle = 'solid' | 'lined' | 'grid' | 'dotted' | 'custom';
export type WallStyle = 'dots' | 'grid' | 'lines' | 'mesh' | 'plain' | 'soft';

// ==========================================
// 2. 核心数据结构 (Markdown YAML)
// ==========================================

/**
 * 存储在 .md 文件 YAML Frontmatter 中的数据
 */
export interface StickyNoteFrontmatter {
    type: 'sticky-note'; // 核心标识
    id: string;
    x: number;
    y: number;
    color: NoteColor;
    size: NoteSize;
    shape: NoteShape;
    style: NoteStyle;
    bgStyle: NoteBgStyle;
    bgImage?: string;
    rotation: number;
    pinType: PinType;
    pinPos: PinPos;
    originalRotation?: number;
    zIndex?: number;
}

/**
 * 运行时使用的完整便利贴对象
 */
export interface StickyNoteData extends StickyNoteFrontmatter {
    content: string;
    filepath: string;  // 对应 .md 文件的路径
}

// ==========================================
// 3. UI 状态与交互类型 (⭐ 修复 Whiteboard.tsx 的引用报错)
// ==========================================

export interface MenuState {
    visible: boolean;
    x: number;
    y: number;
    noteId: string | null;
    canvasX?: number;
    canvasY?: number;
}

/**
 * 用于 React 组件之间传递数据的快照对象
 * (虽然底层是文件存储，但在 UI 层我们仍然需要一个对象来表示"当前白板的所有数据")
 */
export interface WhiteboardData {
    version: number;
    wallStyle: WallStyle;
    notes: StickyNoteData[];
    isFullWidth?: boolean;
}

// ==========================================
// 4. 插件配置与旧数据兼容
// ==========================================

export interface BoardConfig {
    wallStyle: WallStyle;
    isFullWidth?: boolean;
    lastViewX?: number;
    lastViewY?: number;
    zoom?: number;
}

export interface StickyNotesSettings {
    basePath: string;
    hasShownWelcome: boolean;
    boards: Record<string, BoardConfig>;
    migratedFiles: string[];
}

export interface LegacyWhiteboardData {
    version: number;
    wallStyle: WallStyle;
    notes: StickyNoteData[];
    isFullWidth?: boolean;
}