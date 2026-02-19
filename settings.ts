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

        // 🟢 修复 1: 使用官方 Setting API 来生成标准化的标题
        new Setting(containerEl)
            .setName('Sticky notes')
            .setHeading();

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
        const infoDiv = containerEl.createDiv({ cls: 'text-muted' });
        // 🟢 修复 2: 统一使用 setCssStyles 代替直接操作 .style
        infoDiv.setCssStyles({
            marginTop: '20px',
            fontSize: '0.9em',
            lineHeight: '1.5'
        });

        // 🟢 Fix: Removed the emoji. The linter's regex expects the string to start with [A-Z].
        const tipsHeader = infoDiv.createEl('p', { text: 'Quick tips' });
        tipsHeader.setCssStyles({
            marginBottom: '0.5em',
            fontWeight: 'bold'
        });

        // Tips List
        const ul = infoDiv.createEl('ul');
        ul.setCssStyles({
            paddingInlineStart: '20px',
            margin: '0'
        });

        const li1 = ul.createEl('li');
        li1.setText('Sticky notes are saved in markdown files within: ');
        li1.createEl('code', { text: `${this.plugin.settings.basePath}/` });

        const li2 = ul.createEl('li');
        // 🟢 Fix: Lowercased 'command palette' as it's mid-sentence.
        li2.setText('You can create a new board via the ');
        li2.createEl('b', { text: 'command palette' });
        li2.createSpan({ text: ' by searching for "Insert sticky notes".' });

        ul.createEl('li', { text: 'Double-click on the canvas to add a new note instantly.' });

        // --- Support Link ---
        const supportDiv = containerEl.createDiv();
        supportDiv.setCssStyles({
            textAlign: 'center',
            marginTop: '40px'
        });

        const link = supportDiv.createEl('a', {
            href: "https://ko-fi.com/sumus"
        });

        const img = link.createEl('img', {
            attr: {
                src: "https://storage.ko-fi.com/cdn/kofi2.png?v=3",
                // 🟢 Fix: Ensure standard sentence case for alt text too
                alt: "Buy me a coffee"
            }
        });

        // 🟢 修复 3: 图片样式也改用 setCssStyles
        img.setCssStyles({
            height: '36px',
            border: '0px'
        });
    }
}