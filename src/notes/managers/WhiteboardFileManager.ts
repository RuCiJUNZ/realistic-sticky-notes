import {
    App,
    normalizePath,
    Notice,
    TFile,
    TFolder
} from 'obsidian';
// 🟢 Fix: 单独导入类型，解决 "error type" 问题
import type { CachedMetadata } from 'obsidian';

import { StickyNoteData, BoardConfig, WhiteboardData } from '../types';
// 🟢 Fix: 使用 import type 避免循环引用（如果 main.ts 也引用了这个文件）
import type BrainCorePlugin from '../../../main';
import { BoardConfigManager } from './BoardConfigManager';
import { LegacyMigrationManager } from './LegacyMigrationManager';

export class WhiteboardFileManager {
    private app: App;
    private plugin: BrainCorePlugin;
    public configManager: BoardConfigManager;
    private migrationManager: LegacyMigrationManager;

    constructor(app: App, plugin: BrainCorePlugin) {
        this.app = app;
        this.plugin = plugin;
        this.configManager = new BoardConfigManager(plugin);
        this.migrationManager = new LegacyMigrationManager(app, plugin);
    }

    private getBasePath(): string {
        return normalizePath(this.plugin.settings.basePath || 'StickyNotes');
    }

    // 1. 基础文件夹检查
    async ensureBaseFolder() {
        const path = this.getBasePath();
        const folder = this.app.vault.getAbstractFileByPath(path);
        if (!folder) {
            await this.app.vault.createFolder(path);
        }
    }

    // 2. 获取白板列表
    async listBoards(): Promise<string[]> {
        await this.ensureBaseFolder();
        const basePath = this.getBasePath();
        const folder = this.app.vault.getAbstractFileByPath(basePath);
        const boards: string[] = [];

        if (folder instanceof TFolder) {
            for (const child of folder.children) {
                // 排除非文件夹和特定的保留名称
                if (child instanceof TFolder && child.name !== "Whiteboards") {
                    boards.push(child.name);
                }
            }
        }
        return boards;
    }

    // 3. 创建新白板
    async createBoard(name: string): Promise<boolean> {
        await this.ensureBaseFolder();
        // 简单的文件名清洗
        const safeName = name.replace(/[\\/:*?"<>|]/g, "_");
        const folderPath = normalizePath(`${this.getBasePath()}/${safeName}`);

        const existingFolder = this.app.vault.getAbstractFileByPath(folderPath);
        if (existingFolder) {
            new Notice(`Board "${safeName}" already exists.`);
            return false;
        }

        try {
            await this.app.vault.createFolder(folderPath);
            await this.configManager.initializeConfig(folderPath);
            return true;
        } catch (error) {
            console.error("Failed to create board:", error);
            new Notice("Failed to create board.");
            return false;
        }
    }

    // 4. 删除白板
    async deleteBoard(boardName: string): Promise<boolean> {
        const folderPath = normalizePath(`${this.getBasePath()}/${boardName}`);
        const folder = this.app.vault.getAbstractFileByPath(folderPath);

        if (!folder) return false;

        try {
            await this.app.vault.trash(folder, true); // true = System trash (safer)
            return true;
        } catch (error) {
            console.error(`Failed to delete board: ${boardName}`, error);
            new Notice("Failed to delete board.");
            return false;
        }
    }

    // 5. 加载白板数据 (包含配置和所有笔记)
    async loadBoard(boardName: string): Promise<{ config: BoardConfig, notes: StickyNoteData[] }> {
        const folderPath = normalizePath(`${this.getBasePath()}/${boardName}`);
        const config = this.configManager.getConfig(folderPath);

        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        let notes: StickyNoteData[] = [];

        if (folder instanceof TFolder) {
            // 过滤出 Markdown 文件
            const files = folder.children.filter(f => f instanceof TFile && f.extension === 'md') as TFile[];

            // 并行解析所有文件
            const notePromises = files.map(file => this.parseNoteFile(file));
            const results = await Promise.all(notePromises);

            // 过滤掉 null 结果
            notes = results.filter((n): n is StickyNoteData => n !== null);
        }

        return { config, notes };
    }

    // 6. 迁移检查
    async checkAndMigrate() {
        await this.migrationManager.checkAndMigrate(this.getBasePath(), this);
    }

    // 7. 保存白板 (核心逻辑：保存配置 + 批量保存笔记 + 清理孤儿文件)
    async saveBoard(boardName: string, data: WhiteboardData) {
        const folderPath = normalizePath(`${this.getBasePath()}/${boardName}`);

        // 7.1 保存配置
        await this.configManager.updateConfig(folderPath, {
            wallStyle: data.wallStyle,
            isFullWidth: data.isFullWidth
        });

        const folder = this.app.vault.getAbstractFileByPath(folderPath);

        // 获取当前磁盘上的文件列表 (用于检测孤儿文件)
        const existingFilesMap = new Set<string>();
        if (folder instanceof TFolder) {
            folder.children.forEach(f => {
                if (f instanceof TFile && f.extension === 'md') existingFilesMap.add(f.path);
            });
        }

        const activeFilePaths = new Set<string>();

        // 7.2 并行保存所有笔记 (分批次处理以防止 I/O 拥堵)
        const notes = data.notes;
        const CHUNK_SIZE = 50;

        for (let i = 0; i < notes.length; i += CHUNK_SIZE) {
            const chunk = notes.slice(i, i + CHUNK_SIZE);
            const chunkPromises = chunk.map(async (note) => {
                try {
                    const path = await this.saveNote(boardName, note);
                    if (path) activeFilePaths.add(path);
                } catch (e) {
                    console.error(`Failed to save note ${note.id}`, e);
                }
            });
            await Promise.all(chunkPromises);
        }

        // 7.3 清理孤儿文件 (内存中已删除，但本地文件还在的)
        const deletePromises: Promise<void>[] = [];

        for (const existingPath of existingFilesMap) {
            if (!activeFilePaths.has(existingPath)) {
                const file = this.app.vault.getAbstractFileByPath(existingPath);

                if (file instanceof TFile) {
                    // 安全检查：只删除确实是 sticky-note 类型的文件
                    const cache = this.app.metadataCache.getFileCache(file);

                    if (cache?.frontmatter?.type === 'sticky-note') {
                        const deletePromise = this.app.vault.trash(file, true)
                            .then(() => {
                                console.debug(`[BrainCore] Deleted orphan: ${existingPath}`);
                            })
                            .catch((err) => {
                                console.error(`[BrainCore] Failed to delete orphan: ${existingPath}`, err);
                            });

                        deletePromises.push(deletePromise);
                    }
                }
            }
        }

        if (deletePromises.length > 0) {
            await Promise.all(deletePromises);
        }
    }

    // 8. 解析单个笔记文件
    private async parseNoteFile(file: TFile): Promise<StickyNoteData | null> {
        // 优先读取缓存的元数据
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        if (frontmatter && frontmatter.type === 'sticky-note') {
            // 读取文件内容 (I/O 操作)
            const content = await this.app.vault.read(file);
            // 移除 Frontmatter 块
            const bodyContent = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();

            return {
                id: frontmatter.id || file.basename,
                x: frontmatter.x || 0,
                y: frontmatter.y || 0,
                color: frontmatter.color || 'yellow',
                size: frontmatter.size || 'm',
                shape: frontmatter.shape || 'square',
                style: frontmatter.style || 'realistic',
                bgStyle: frontmatter.bgStyle || 'solid',
                rotation: frontmatter.rotation || 0,
                pinType: frontmatter.pinType || 'none',
                pinPos: frontmatter.pinPos || 'center',
                type: 'sticky-note',
                content: bodyContent,
                filepath: file.path,
                originalRotation: frontmatter.originalRotation
            };
        }
        return null;
    }

    /**
     * 9. 🚀 核心修复：保存单个笔记
     * 修复了 'TFile is error type' 问题，通过 instanceof TFile 进行类型收窄
     */
    async saveNote(boardName: string, note: StickyNoteData): Promise<string | null> {
        const folderPath = normalizePath(`${this.getBasePath()}/${boardName}`);

        // 确保文件夹存在
        if (!this.app.vault.getAbstractFileByPath(folderPath)) {
            await this.app.vault.createFolder(folderPath);
        }

        const newFileContent = this.constructFileContent(note);

        // 确定目标文件路径
        let targetPath = note.filepath;

        // 如果没有路径，或者路径对应的文件不存在（可能是改名导致的），则生成标准新路径
        if (!targetPath || !this.app.vault.getAbstractFileByPath(targetPath)) {
            targetPath = normalizePath(`${folderPath}/Note ${note.id}.md`);
        }

        // 获取路径对应的抽象文件对象
        const abstractFile = this.app.vault.getAbstractFileByPath(targetPath);

        try {
            // 情况 A: 文件已存在 (Update) -> 使用 instanceof 收窄类型
            if (abstractFile instanceof TFile) {
                const cache = this.app.metadataCache.getFileCache(abstractFile);

                // 仅当元数据变更或内容不一致时才写入 (性能优化)
                if (this.hasMetadataChanged(cache, note)) {
                    await this.app.vault.modify(abstractFile, newFileContent);
                } else {
                    const currentContent = await this.app.vault.read(abstractFile);
                    if (currentContent !== newFileContent) {
                        await this.app.vault.modify(abstractFile, newFileContent);
                    }
                }

                note.filepath = abstractFile.path;
                return abstractFile.path;
            }
            // 情况 B: 文件不存在 (Create)
            else {
                // 如果路径被占用但不是文件 (例如同名文件夹)，防止报错
                if (abstractFile) {
                    console.error(`Cannot create note at ${targetPath}: path is occupied.`);
                    return null;
                }

                const createdFile = await this.app.vault.create(targetPath, newFileContent);
                note.filepath = createdFile.path;
                return createdFile.path;
            }
        } catch (error) {
            console.error(`Failed to save note ${note.id}:`, error);
        }

        return null;
    }

    // 10. 辅助：检查脏数据
    private hasMetadataChanged(cache: CachedMetadata | null, note: StickyNoteData): boolean {
        if (!cache || !cache.frontmatter) return true;
        const fm = cache.frontmatter;

        // 字符串化对比 ID，防止类型不匹配
        if (String(fm.id) !== String(note.id)) return true;

        if (fm.x !== Math.round(note.x)) return true;
        if (fm.y !== Math.round(note.y)) return true;
        if (fm.rotation !== note.rotation) return true;
        if (fm.color !== note.color) return true;
        if (fm.size !== note.size) return true;
        if (fm.shape !== note.shape) return true;
        if (fm.style !== note.style) return true;
        if (fm.bgStyle !== note.bgStyle) return true;
        if (fm.pinType !== note.pinType) return true;
        if (fm.pinPos !== note.pinPos) return true;

        return false;
    }

    // 11. 辅助：构建文件内容
    private constructFileContent(note: StickyNoteData): string {
        const safeId = String(note.id).replace(/"/g, '\\"');
        const fm = [
            '---',
            `type: sticky-note`,
            `id: "${safeId}"`,
            `x: ${Math.round(note.x)}`,
            `y: ${Math.round(note.y)}`,
            `color: ${note.color}`,
            `size: ${note.size}`,
            `shape: ${note.shape}`,
            `style: ${note.style}`,
            `bgStyle: ${note.bgStyle}`,
            `rotation: ${note.rotation}`,
            `pinType: ${note.pinType}`,
            `pinPos: ${note.pinPos}`,
        ];

        if (note.originalRotation !== undefined) {
            fm.push(`originalRotation: ${note.originalRotation}`);
        }

        fm.push('---');
        fm.push('');
        fm.push(note.content || '');

        return fm.join('\n');
    }
}