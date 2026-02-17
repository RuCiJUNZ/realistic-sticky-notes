// src/notes/WhiteboardFileManager.ts
import { App, normalizePath, Notice, TFile, TFolder, type CachedMetadata } from 'obsidian';
import { StickyNoteData, BoardConfig, WhiteboardData } from '../types';
import StickyNotesPlugin from '../../../main';
import { BoardConfigManager } from './BoardConfigManager';
import { LegacyMigrationManager } from './LegacyMigrationManager';

export class WhiteboardFileManager {
    private app: App;
    private plugin: StickyNotesPlugin;
    public configManager: BoardConfigManager;
    private migrationManager: LegacyMigrationManager;

    constructor(app: App, plugin: StickyNotesPlugin) {
        this.app = app;
        this.plugin = plugin;
        this.configManager = new BoardConfigManager(plugin);
        this.migrationManager = new LegacyMigrationManager(app, plugin);
    }

    private getBasePath(): string {
        return normalizePath(this.plugin.settings.basePath || 'StickyNotes');
    }

    // 🟢 优化：使用 Vault API 替代 Adapter API
    async ensureBaseFolder() {
        const path = this.getBasePath();
        const folder = this.app.vault.getAbstractFileByPath(path);
        if (!folder) {
            await this.app.vault.createFolder(path);
        }
    }

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

    async createBoard(name: string): Promise<boolean> {
        await this.ensureBaseFolder();
        // 简单的文件名清洗
        const safeName = name.replace(/[\\/:*?"<>|]/g, "_");
        const folderPath = normalizePath(`${this.getBasePath()}/${safeName}`);

        const existingFolder = this.app.vault.getAbstractFileByPath(folderPath);
        if (existingFolder) {
            // 🟢 修复：英文提示
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

    async deleteBoard(boardName: string): Promise<boolean> {
        const folderPath = normalizePath(`${this.getBasePath()}/${boardName}`);
        const folder = this.app.vault.getAbstractFileByPath(folderPath);

        if (!folder) return false;

        try {
            await this.app.vault.trash(folder, true); // true = System trash (safer)
            return true;
        } catch (error) {
            console.error(`Failed to delete board: ${boardName}`, error);
            // 🟢 修复：英文提示
            new Notice("Failed to delete board.");
            return false;
        }
    }

    /**
     * 🚀 优化：并行加载
     */
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

    async checkAndMigrate() {
        await this.migrationManager.checkAndMigrate(this.getBasePath(), this);
    }

    /**
     * 🚀 优化：并发控制 + 脏数据清理
     */
    async saveBoard(boardName: string, data: WhiteboardData) {
        const folderPath = normalizePath(`${this.getBasePath()}/${boardName}`);

        // 1. 保存配置
        await this.configManager.updateConfig(folderPath, {
            wallStyle: data.wallStyle,
            isFullWidth: data.isFullWidth
        });

        const folder = this.app.vault.getAbstractFileByPath(folderPath);

        // 获取当前磁盘上的文件列表 (用于检测孤儿文件)
        let existingFilesMap = new Set<string>();
        if (folder instanceof TFolder) {
            folder.children.forEach(f => {
                if (f instanceof TFile && f.extension === 'md') existingFilesMap.add(f.path);
            });
        }

        const activeFilePaths = new Set<string>();

        // 2. 并行保存所有笔记 (分批次处理)
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

        // 3. 清理孤儿文件 (UI上已经删除，但本地文件还在的)
        const deletePromises: Promise<void>[] = [];

        for (const existingPath of existingFilesMap) {
            if (!activeFilePaths.has(existingPath)) {
                const file = this.app.vault.getAbstractFileByPath(existingPath);

                if (file instanceof TFile) {
                    // 安全检查：只删除确实是 sticky-note 类型的文件，防止误删用户存放的其他文件
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
     * 🚀 核心优化：Cache-First Dirty Check
     */
    async saveNote(boardName: string, note: StickyNoteData): Promise<string | null> {
        const folderPath = normalizePath(`${this.getBasePath()}/${boardName}`);

        // 🟢 优化：使用 getAbstractFileByPath 检查文件夹
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            await this.app.vault.createFolder(folderPath);
        }

        // 确定文件路径
        let filePath = note.filepath;
        let file: TFile | null = null;
        let isNewFile = false;

        let abstractFile = filePath ? this.app.vault.getAbstractFileByPath(filePath) : null;

        if (!filePath || !(abstractFile instanceof TFile)) {
            // 这种情况通常是新创建的笔记，或者文件名丢失
            const fileName = `Note ${note.id}.md`;
            filePath = normalizePath(`${folderPath}/${fileName}`);

            const generatedAbstractFile = this.app.vault.getAbstractFileByPath(filePath);

            if (generatedAbstractFile instanceof TFile) {
                file = generatedAbstractFile;
                isNewFile = false;
            } else {
                isNewFile = true;
            }
        } else {
            file = abstractFile;
            isNewFile = false;
        }

        // 构建内容
        const newFileContent = this.constructFileContent(note);

        try {
            if (isNewFile) {
                const createdFile = await this.app.vault.create(filePath, newFileContent);
                note.filepath = createdFile.path;
                return createdFile.path;
            } else if (file) {
                // 🔥 性能优化
                const cache = this.app.metadataCache.getFileCache(file);
                const isMetadataDirty = this.hasMetadataChanged(cache, note);

                if (isMetadataDirty) {
                    // 如果元数据变了，直接覆盖 (Overwrite)
                    await this.app.vault.modify(file, newFileContent);
                } else {
                    // 如果元数据没变，才去读取全文对比正文
                    const currentContent = await this.app.vault.read(file);
                    if (currentContent !== newFileContent) {
                        await this.app.vault.modify(file, newFileContent);
                    }
                }

                note.filepath = file.path;
                return file.path;
            }
        } catch (error) {
            console.error(`Failed to save note ${note.id}:`, error);
        }

        return null;
    }

    /**
       * 辅助方法：检查 Note 数据与缓存是否不一致
       * @param cache - 从 import type { CachedMetadata } 导入
       * @param note - 笔记数据
       */
    private hasMetadataChanged(cache: CachedMetadata | null, note: StickyNoteData): boolean {
        // 1. 无缓存或无 frontmatter，视为脏数据，必须更新
        if (!cache || !cache.frontmatter) return true;

        const fm = cache.frontmatter;

        // ⚠️ 注意：constructFileContent 中使用了 Math.round，这里对比也必须对齐

        // 🟢 优化：ID 对比转为 String，防止 YAML 解析将数字 ID 读为 number 导致不匹配
        if (String(fm.id) !== String(note.id)) return true;

        // 坐标对比 (取整)
        if (fm.x !== Math.round(note.x)) return true;
        if (fm.y !== Math.round(note.y)) return true;

        // Rotation 对比
        if (fm.rotation !== note.rotation) return true;

        // 其他属性对比
        if (fm.color !== note.color) return true;
        if (fm.size !== note.size) return true;
        if (fm.shape !== note.shape) return true;
        if (fm.style !== note.style) return true;
        if (fm.bgStyle !== note.bgStyle) return true;
        if (fm.pinType !== note.pinType) return true;
        if (fm.pinPos !== note.pinPos) return true;

        return false;
    }
    /**
     * 辅助方法：手动构建 Frontmatter
     */
    private constructFileContent(note: StickyNoteData): string {
        // 简单转义引号，防止 YAML 格式破裂
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