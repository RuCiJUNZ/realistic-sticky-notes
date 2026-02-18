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
        // 🟢 Fix: Avoid direct .style assignment. Use 'attr' or CSS classes.
        // 'text-muted' is a standard Obsidian theme class for helper text.
        const infoDiv = containerEl.createDiv({
            cls: 'text-muted',
            attr: {
                style: 'margin-top: 20px; font-size: 0.9em; line-height: 1.5;'
            }
        });

        infoDiv.createEl('p', { text: '💡 Quick tips', attr: { style: 'margin-bottom: 0.5em; font-weight: bold;' } });

        const ul = infoDiv.createEl('ul', { attr: { style: 'padding-inline-start: 20px; margin: 0;' } });

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
        // 🟢 Fix: Avoid direct .style assignment.
        const supportDiv = containerEl.createDiv({
            attr: {
                style: 'text-align: center; margin-top: 40px;'
            }
        });

        const link = supportDiv.createEl('a', {
            href: "https://ko-fi.com/sumus"
        });

        link.createEl('img', {
            attr: {
                src: "https://storage.ko-fi.com/cdn/kofi2.png?v=3",
                alt: "Buy me a coffee",
                // Combine styles into the style string
                style: 'height: 36px; border: 0px;'
            }
        });
    }
}