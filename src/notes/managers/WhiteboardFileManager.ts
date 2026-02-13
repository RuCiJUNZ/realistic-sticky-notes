// src/notes/WhiteboardFileManager.ts
import { App, normalizePath, Notice, TFile, TFolder, CachedMetadata } from 'obsidian';
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

    async ensureBaseFolder() {
        const path = this.getBasePath();
        if (!(await this.app.vault.adapter.exists(path))) {
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
                if (child instanceof TFolder && child.name !== "Whiteboards") {
                    boards.push(child.name);
                }
            }
        }
        return boards;
    }

    async createBoard(name: string): Promise<boolean> {
        await this.ensureBaseFolder();
        const safeName = name.replace(/[\\/:*?"<>|]/g, "_");
        const folderPath = normalizePath(`${this.getBasePath()}/${safeName}`);

        if (await this.app.vault.adapter.exists(folderPath)) {
            new Notice(`白板 "${safeName}" 已存在！`);
            return false;
        }

        await this.app.vault.createFolder(folderPath);
        await this.configManager.initializeConfig(folderPath);
        return true;
    }

    async deleteBoard(boardName: string): Promise<boolean> {
        const folderPath = normalizePath(`${this.getBasePath()}/${boardName}`);
        const folder = this.app.vault.getAbstractFileByPath(folderPath);

        if (!folder) return false;

        try {
            await this.app.vault.trash(folder, true);
            return true;
        } catch (error) {
            console.error(`Failed to delete board: ${boardName}`, error);
            new Notice(`删除失败: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * 🚀 优化：并行加载
     * 使用 Promise.all 并发读取文件
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
     * 1. 分批处理 (Chunking) 以避免 IO 阻塞
     * 2. 清理 UI 中不存在的孤儿文件
     */
    async saveBoard(boardName: string, data: WhiteboardData) {
        const folderPath = normalizePath(`${this.getBasePath()}/${boardName}`);

        // 1. 保存配置
        await this.configManager.updateConfig(folderPath, {
            wallStyle: data.wallStyle,
            isFullWidth: data.isFullWidth
        });

        const folder = this.app.vault.getAbstractFileByPath(folderPath);

        // 获取当前磁盘上的文件列表
        let existingFilesMap = new Set<string>();
        if (folder instanceof TFolder) {
            folder.children.forEach(f => {
                if (f instanceof TFile && f.extension === 'md') existingFilesMap.add(f.path);
            });
        }

        const activeFilePaths = new Set<string>();

        // 2. 并行保存所有笔记 (分批次处理)
        const notes = data.notes;
        const CHUNK_SIZE = 50; // 每批处理 50 个文件，防止卡顿

        for (let i = 0; i < notes.length; i += CHUNK_SIZE) {
            const chunk = notes.slice(i, i + CHUNK_SIZE);
            const chunkPromises = chunk.map(async (note) => {
                const path = await this.saveNote(boardName, note);
                if (path) activeFilePaths.add(path);
            });
            await Promise.all(chunkPromises);
        }

        // 3. 清理孤儿文件 (UI 中不存在，但磁盘上存在的文件)
        const deletePromises: Promise<void>[] = [];
        for (const existingPath of existingFilesMap) {
            if (!activeFilePaths.has(existingPath)) {
                const file = this.app.vault.getAbstractFileByPath(existingPath);
                if (file instanceof TFile) {
                    const cache = this.app.metadataCache.getFileCache(file);
                    if (cache?.frontmatter?.type === 'sticky-note') {
                        deletePromises.push(
                            this.app.vault.trash(file, true)
                                .then(() => console.log(`[StickyNotes] Deleted orphan: ${existingPath}`))
                        );
                    }
                }
            }
        }
        await Promise.all(deletePromises);
    }

    private async parseNoteFile(file: TFile): Promise<StickyNoteData | null> {
        // 优先读取缓存的元数据，极其快速
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
     * 在调用耗时的 vault.read() 之前，先对比 metadataCache。
     * 对于"批量旋转"场景，如果 Frontmatter 变了，我们就不需要读取旧文件，直接覆盖写入即可。
     */
    async saveNote(boardName: string, note: StickyNoteData): Promise<string | null> {
        const folderPath = normalizePath(`${this.getBasePath()}/${boardName}`);

        // 确保文件夹存在 (通常已存在，检查开销很小)
        if (!(await this.app.vault.adapter.exists(folderPath))) {
            await this.app.vault.createFolder(folderPath);
        }

        // 确定文件路径
        let filePath = note.filepath;
        let file: TFile | null = null;
        let isNewFile = false;

        // 如果没有路径或路径不存在，视为新文件
        if (!filePath || !(await this.app.vault.adapter.exists(filePath))) {
            const fileName = `Note ${note.id}.md`;
            filePath = normalizePath(`${folderPath}/${fileName}`);
            // 再次检查生成的名字是否存在 (防御性编程)
            if (await this.app.vault.adapter.exists(filePath)) {
                file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
            } else {
                isNewFile = true;
            }
        } else {
            file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
        }

        // 构建新的文件内容字符串 (Frontmatter + Body)
        const newFileContent = this.constructFileContent(note);

        if (isNewFile) {
            // 新建文件
            const createdFile = await this.app.vault.create(filePath, newFileContent);
            note.filepath = createdFile.path;
            return createdFile.path;
        } else if (file) {
            // 🔥 性能优化逻辑开始

            // 1. 获取缓存的 Frontmatter (内存操作，极快)
            const cache = this.app.metadataCache.getFileCache(file);

            // 2. 检查 Frontmatter 是否有实质性变化
            // 如果缓存不存在，或者关键属性不匹配，视为"脏"数据
            const isMetadataDirty = this.hasMetadataChanged(cache, note);

            if (isMetadataDirty) {
                // ✅ 优化点：如果元数据(rotation/x/y)变了，我们明确知道需要写入。
                // 此时直接覆盖写入，跳过 vault.read() 的步骤！
                await this.app.vault.modify(file, newFileContent);
            } else {
                // 🛑 如果元数据看起来一样（没动位置），则可能是正文内容变了。
                // 或者是完全没变的笔记。
                // 只有在这种不确定的情况下，我们才去读取文件进行深度对比。
                const currentContent = await this.app.vault.read(file);
                if (currentContent !== newFileContent) {
                    await this.app.vault.modify(file, newFileContent);
                }
            }

            note.filepath = file.path;
            return file.path;
        }

        return null;
    }

    /**
     * 辅助方法：检查 Note 数据与缓存是否不一致
     * 返回 true 表示一定要写入
     */
    private hasMetadataChanged(cache: CachedMetadata | null, note: StickyNoteData): boolean {
        if (!cache || !cache.frontmatter) return true; // 无缓存，强制更新

        const fm = cache.frontmatter;

        // ⚠️ 注意：constructFileContent 中使用了 Math.round，这里对比也必须对齐
        if (fm.id !== note.id) return true;
        if (fm.x !== Math.round(note.x)) return true;
        if (fm.y !== Math.round(note.y)) return true;

        // Rotation 对比
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

    /**
     * 辅助方法：手动构建 Frontmatter + Content 字符串
     * 比 processFrontMatter 快，且只触发一次写入
     */
    private constructFileContent(note: StickyNoteData): string {
        // 手动构建 YAML 字符串
        const fm = [
            '---',
            `type: sticky-note`,
            `id: "${note.id}"`, // 使用引号防止特殊字符破坏 YAML
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
        fm.push(''); // 空行分隔
        fm.push(note.content || ''); // 正文

        return fm.join('\n');
    }
}