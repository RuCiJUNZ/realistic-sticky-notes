import { App, PluginSettingTab, Setting } from 'obsidian';
import BrainCorePlugin from './main';
import { BoardConfig } from './src/notes/types';

// 1. Settings Interface
export interface BrainCoreSettings {
    basePath: string;
    hasShownWelcome: boolean;
    // Store configuration for each whiteboard (e.g., background style)
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
}

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

        // Heading: Sentence case
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
        const infoDiv = containerEl.createDiv();
        // 🟢 Fix: Use native style instead of setCssProps
        infoDiv.style.color = 'var(--text-muted)';
        infoDiv.style.marginTop = '20px';
        infoDiv.style.fontSize = '0.9em';
        infoDiv.style.lineHeight = '1.5';

        infoDiv.createEl('p', { text: '💡 Quick tips' });
        const ul = infoDiv.createEl('ul');

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
        // 🟢 Fix: Use native style
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

        // 🟢 Fix: Use native style
        img.style.height = '36px';
        img.style.border = '0px';
    }
}