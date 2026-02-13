// src/notes/managers/LegacyMigrationManager.ts
import { App, normalizePath, Notice, TFile, TFolder } from 'obsidian';
import { StickyNoteData } from '../types';
import StickyNotesPlugin from '../../../main';
import type { WhiteboardFileManager } from './WhiteboardFileManager';

export class LegacyMigrationManager {
    private app: App;
    private plugin: StickyNotesPlugin;
    private readonly LEGACY_FOLDER = "Whiteboards";

    constructor(app: App, plugin: StickyNotesPlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    /**
     * 执行迁移逻辑
     * @param basePath 白板根目录
     * @param fileManager 传入 FileManager 实例以复用 saveNote 逻辑
     */
    async checkAndMigrate(basePath: string, fileManager: WhiteboardFileManager) {
        // 1. 尝试找到旧的 Legacy 文件夹 (BrainCore/Whiteboards)
        const legacyPath = normalizePath(`${basePath}/${this.LEGACY_FOLDER}`);
        let targetFolder = this.app.vault.getAbstractFileByPath(basePath);

        // 如果存在 Whiteboards 文件夹，优先扫描它
        if (await this.app.vault.adapter.exists(legacyPath)) {
            targetFolder = this.app.vault.getAbstractFileByPath(legacyPath);
            console.log("[StickyNotes] Found legacy folder, scanning for migrations...");
        }

        if (!(targetFolder instanceof TFolder)) return;

        // 2. 扫描 JSON 文件 (强制断言为 TFile[])
        const jsonFiles = targetFolder.children.filter(f => f instanceof TFile && f.extension === 'json') as TFile[];

        for (const file of jsonFiles) {
            // 跳过 data.json 和已迁移的文件
            if (file.name === 'data.json') continue;
            if (this.plugin.settings.migratedFiles.includes(file.name)) continue;

            console.log(`[StickyNotes] Migrating ${file.name}...`);
            try {
                const content = await this.app.vault.read(file);
                const parsed = JSON.parse(content);

                // 兼容逻辑：旧版可能是数组，可能是对象
                const notes = Array.isArray(parsed) ? parsed : parsed.notes;
                const wallStyle = (!Array.isArray(parsed) && parsed.wallStyle) ? parsed.wallStyle : 'dots';

                if (!notes) continue;

                // 3. 执行迁移
                const boardName = file.basename;

                // 3.1 创建新文件夹
                const newBoardPath = normalizePath(`${basePath}/${boardName}`);
                if (!(await this.app.vault.adapter.exists(newBoardPath))) {
                    await this.app.vault.createFolder(newBoardPath);
                }

                // 3.2 保存配置 (调用 fileManager 的 configManager)
                // [修改点]：移除了 isFullWidth 字段，仅保存 wallStyle
                await fileManager.configManager.updateConfig(newBoardPath, { wallStyle });

                // 3.3 保存所有笔记
                for (const note of notes) {
                    const noteData: StickyNoteData = {
                        ...note,
                        type: 'sticky-note',
                        content: note.content || '',
                        filepath: '' // 留空触发新建
                    };
                    // 复用 FileManager 的核心保存逻辑
                    await fileManager.saveNote(boardName, noteData);
                }

                // 4. 收尾：记录迁移状态
                this.plugin.settings.migratedFiles.push(file.name);
                await this.plugin.saveSettings();

                // 备份旧文件
                await this.app.vault.rename(file, `${file.path}.migrated`);
                new Notice(`旧白板 "${boardName}" 已迁移成功！`);

            } catch (e) {
                console.error(`Migration failed for ${file.name}`, e);
            }
        }
    }
}