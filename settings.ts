import { App, PluginSettingTab, Setting } from 'obsidian';
// 🟢 Fix: 使用 'import type' 避免循环依赖导致的运行时问题
import type BrainCorePlugin from './main';
import { BoardConfig } from './src/notes/types';

// 1. Settings Interface
export interface BrainCoreSettings {
    basePath: string;
    hasShownWelcome: boolean;
    // Store configuration for each whiteboard
    boards: Record<string, BoardConfig>;
    // Track which legacy files have been migrated
    migratedFiles: string[];
}

// 2. Default Settings
export const DEFAULT_SETTINGS: BrainCoreSettings = {
    basePath: 'BrainCore',
    hasShownWelcome: false,
    boards: {},        // Initialize as empty object
    migratedFiles: []  // Initialize as empty array
};

// 3. Settings Tab
export class BrainCoreSettingTab extends PluginSettingTab {
    plugin: BrainCorePlugin;

    constructor(app: App, plugin: BrainCorePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        // 🔴 Fix: Setting 类没有 setHeading() 方法
        // 使用标准的 HTML 标题
        containerEl.createEl('h2', { text: 'Sticky notes' });

        // --- General Settings ---
        new Setting(containerEl)
            .setName('Data storage path')
            .setDesc('The folder path where BrainCore data and assets will be stored.')
            .addText(text => text
                .setPlaceholder('BrainCore')
                .setValue(this.plugin.settings.basePath)
                .onChange(async (value) => {
                    this.plugin.settings.basePath = value;
                    await this.plugin.saveSettings();
                }));

        // --- Info & Tips ---
        // 🟢 Fix: 避免使用 attr: { style: ... }。
        // 使用 .createDiv 后直接操作 style 属性，更加类型安全且符合 CSP。
        const infoDiv = containerEl.createDiv({ cls: 'text-muted' });
        infoDiv.style.marginTop = '20px';
        infoDiv.style.fontSize = '0.9em';
        infoDiv.style.lineHeight = '1.5';

        // Tips Header
        const tipsHeader = infoDiv.createEl('p', { text: '💡 Quick tips' });
        tipsHeader.style.marginBottom = '0.5em';
        tipsHeader.style.fontWeight = 'bold';

        // Tips List
        const ul = infoDiv.createEl('ul');
        ul.style.paddingInlineStart = '20px';
        ul.style.margin = '0';

        const li1 = ul.createEl('li');
        li1.setText('Sticky notes are saved in markdown files within: ');
        li1.createEl('code', { text: `${this.plugin.settings.basePath}/` });

        const li2 = ul.createEl('li');
        li2.setText('You can create a new board via the ');
        // Obsidian UI standard: "Command palette" (Sentence case)
        li2.createEl('b', { text: 'Command palette' });
        li2.createSpan({ text: ' by searching for "Insert sticky notes".' });

        ul.createEl('li', { text: 'Double-click on the canvas to add a new note instantly.' });

        // --- Support Link ---
        const supportDiv = containerEl.createDiv();
        supportDiv.style.textAlign = 'center';
        supportDiv.style.marginTop = '40px';

        const link = supportDiv.createEl('a', {
            href: "https://ko-fi.com/sumus"
        });

        const img = link.createEl('img', {
            attr: {
                src: "https://storage.ko-fi.com/cdn/kofi2.png?v=3",
                alt: "Buy me a coffee"
            }
        });
        // 直接设置图片样式
        img.style.height = '36px';
        img.style.border = '0px';
    }
}