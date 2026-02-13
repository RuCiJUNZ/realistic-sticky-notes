// src/notes/managers/BoardConfigManager.ts
import { normalizePath } from 'obsidian';
import { BoardConfig } from '../types';
import StickyNotesPlugin from '../../../main';

export class BoardConfigManager {
    private plugin: StickyNotesPlugin;

    constructor(plugin: StickyNotesPlugin) {
        this.plugin = plugin;
    }

    /**
     * 获取指定白板的配置
     * 如果不存在，则返回默认配置并补录（但不立即保存到磁盘，除非明确调用 save）
     */
    getConfig(folderPath: string): BoardConfig {
        const normalizedPath = normalizePath(folderPath);
        let config = this.plugin.settings.boards[normalizedPath];

        if (!config) {
            config = {
                wallStyle: 'dots',
                isFullWidth: false,
                zoom: 1
            };
            // 补录到内存中
            this.plugin.settings.boards[normalizedPath] = config;
        }
        return config;
    }

    /**
     * 更新并保存白板配置到 data.json
     */
    async updateConfig(folderPath: string, newConfig: Partial<BoardConfig>) {
        const normalizedPath = normalizePath(folderPath);
        const currentConfig = this.getConfig(normalizedPath);

        this.plugin.settings.boards[normalizedPath] = {
            ...currentConfig,
            ...newConfig
        };

        await this.plugin.saveSettings();
    }

    /**
     * 初始化新白板的配置
     */
    async initializeConfig(folderPath: string) {
        const normalizedPath = normalizePath(folderPath);
        this.plugin.settings.boards[normalizedPath] = {
            wallStyle: 'dots',
            isFullWidth: false,
            zoom: 1
        };
        await this.plugin.saveSettings();
    }

    /**
     * 删除配置 (当白板被删除时)
     */
    async deleteConfig(folderPath: string) {
        const normalizedPath = normalizePath(folderPath);
        if (this.plugin.settings.boards[normalizedPath]) {
            delete this.plugin.settings.boards[normalizedPath];
            await this.plugin.saveSettings();
        }
    }
}