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

        containerEl.createEl('h2', { text: 'Sticky Notes' });

        // --- General Settings ---
        new Setting(containerEl)
            .setName('Data Storage Path')
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
        infoDiv.style.color = 'var(--text-muted)';
        infoDiv.style.marginTop = '20px';
        infoDiv.style.fontSize = '0.9em';
        infoDiv.style.lineHeight = '1.5';

        infoDiv.innerHTML = `
            <p>💡 <b>Quick Tips:</b></p>
            <ul>
                <li>Sticky notes are saved in markdown files within: <code>${this.plugin.settings.basePath}/</code></li>
                <li>You can create a new board via the <b>Command Palette</b> by searching for "Insert Sticky Notes".</li>
                <li>Double-click on the canvas to add a new note instantly.</li>
            </ul>
        `;

        // --- 方案四：官方胶囊风 ---
        const supportDiv = containerEl.createDiv();
        supportDiv.style.textAlign = 'center';
        supportDiv.style.marginTop = '40px';

        supportDiv.innerHTML = `
            <a href="https://ko-fi.com/sumus" target="_blank">
                <img src="https://storage.ko-fi.com/cdn/kofi2.png?v=3"
                     alt="Buy Me a Coffee"
                     style="height: 36px; border: 0px;">
            </a>
        `;
    }
}