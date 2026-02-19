import {
    Plugin,
    MarkdownView,
    setIcon,
    debounce,
    Notice,
    WorkspaceLeaf,
    TFile,
    MarkdownPostProcessorContext
    // 🟢 修复 1: 移除了未使用的 'Platform'
} from 'obsidian';
import { BrainCoreSettings, DEFAULT_SETTINGS, BrainCoreSettingTab } from './settings';
import { ReactHost } from './src/views/react-host';
import { CODE_BLOCK_TAG } from './src/notes/constants';
import { WelcomeView, WELCOME_VIEW_TYPE } from './src/welcome-view';
import './src/notes/index';

export default class BrainCorePlugin extends Plugin {
    settings: BrainCoreSettings;
    public static instance: BrainCorePlugin;

    // Use WeakMap to associate Views with their buttons without preventing garbage collection
    private widthToggleBtns: WeakMap<MarkdownView, HTMLElement> = new WeakMap();

    async onload() {
        BrainCorePlugin.instance = this;

        await this.loadSettings();
        this.addSettingTab(new BrainCoreSettingTab(this.app, this));

        this.registerView(WELCOME_VIEW_TYPE, (leaf) => new WelcomeView(leaf));

        // ============================================================
        // ⭐ 2. Register Code Block Processor
        // ============================================================
        this.registerMarkdownCodeBlockProcessor(CODE_BLOCK_TAG, (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
            ctx.addChild(new ReactHost(el, source.trim(), this, ctx));
        });

        // ============================================================
        // ⭐ 3. Register Commands
        // ============================================================
        this.addCommand({
            id: 'insert-sticky-notes-board',
            name: 'Insert sticky notes',
            editorCallback: (editor) => {
                editor.replaceSelection(`\`\`\`${CODE_BLOCK_TAG}\nNew board\n\`\`\``);
            }
        });

        this.addCommand({
            id: 'open-welcome-page',
            name: 'Open welcome page',
            callback: () => { void this.activateWelcomeView(); }
        });

        // 🟢 修复 2: 显式处理 onLayoutReady 中的 Promise，避免悬挂的异步调用
        this.app.workspace.onLayoutReady(() => {
            void (async () => {
                if (!this.settings.hasShownWelcome) {
                    await this.activateWelcomeView();
                    this.settings.hasShownWelcome = true;
                    await this.saveSettings();
                }
            })();
        });

        // ============================================================
        // ⭐ Optimize Full-Width Detection
        // ============================================================
        const debouncedCheck = debounce(this.checkPageWidth.bind(this), 100, true);

        // 1. Check on active leaf change
        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
            if (leaf) void debouncedCheck(leaf);
        }));

        // 2. Check on layout change
        this.registerEvent(this.app.workspace.on('layout-change', () => {
            const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
            if (activeLeaf) {
                void debouncedCheck(activeLeaf);
            }
        }));

        // 3. Check on metadata change (Frontmatter updates)
        this.registerEvent(this.app.metadataCache.on('changed', (file) => {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            // Ensure strictly checking against TFile
            if (activeView && activeView.file instanceof TFile && activeView.file.path === file.path) {
                void debouncedCheck(activeView.leaf);
            }
        }));
    }

    async activateWelcomeView() {
        const { workspace } = this.app;
        const leaves = workspace.getLeavesOfType(WELCOME_VIEW_TYPE);

        if (leaves.length > 0) {
            workspace.revealLeaf(leaves[0]);
        } else {
            const leaf = workspace.getLeaf('tab');
            await leaf.setViewState({ type: WELCOME_VIEW_TYPE, active: true });
            workspace.revealLeaf(leaf);
        }
    }

    onunload() {
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView && leaf.view.containerEl) {
                // Safe cleanup using Obsidian API
                leaf.view.containerEl.removeClass('brain-core-full-width');
            }
        });
    }

    // ============================================================
    // ⭐ Full-Width Logic (Refactored for Review)
    // ============================================================

    async checkPageWidth(leaf: WorkspaceLeaf | null): Promise<void> {
        // 1. Basic validation
        if (!leaf || !(leaf.view instanceof MarkdownView)) return;

        const view = leaf.view;
        const file = view.file;

        // Strict TFile check
        if (!file || !(file instanceof TFile)) return;

        // 2. Performance: Pre-check via MetadataCache
        const cache = this.app.metadataCache.getFileCache(file);

        // Safe optional chaining for sections
        const hasCodeSection = cache?.sections?.some(sec => sec.type === 'code');
        let hasStickyNote = false;

        // IO Operation only if necessary
        if (hasCodeSection) {
            try {
                const content = await this.app.vault.cachedRead(file);
                hasStickyNote = content.includes(`\`\`\`${CODE_BLOCK_TAG}`);
            } catch (e) {
                console.warn('BrainCore: Failed to read file content', e);
                hasStickyNote = false;
            }
        }

        // 3. Read Frontmatter
        const frontmatter = cache?.frontmatter;
        const userForceStandard = frontmatter && frontmatter['bc-width'] === 'standard';

        // Get or create button
        let btn = this.widthToggleBtns.get(view);

        // 4. Style Application
        const shouldBeFullWidth = hasStickyNote && !userForceStandard;

        if (shouldBeFullWidth) {
            // ---> Apply Full Width
            if (!view.containerEl.hasClass('brain-core-full-width')) {
                view.containerEl.addClass('brain-core-full-width');
            }

            if (!btn) btn = this.createToggleBtn(view);

            if (btn) {
                btn.toggle(true); // Show button
                this.updateIconState(btn, true);
            }

        } else {
            // ---> Revert to Standard Width
            view.containerEl.removeClass('brain-core-full-width');

            if (hasStickyNote && userForceStandard) {
                // Case B: Has sticky note but forced standard -> Show button to allow expansion
                if (!btn) btn = this.createToggleBtn(view);
                if (btn) {
                    btn.toggle(true); // Show button
                    this.updateIconState(btn, false);
                }
            } else {
                // Case C: No sticky note -> Hide button
                if (btn) {
                    btn.toggle(false); // Hide button
                }
            }
        }
    }

    createToggleBtn(view: MarkdownView): HTMLElement | undefined {
        if (this.widthToggleBtns.has(view)) {
            return this.widthToggleBtns.get(view);
        }

        // addAction returns HTMLElement
        const btn = view.addAction('minimize', 'Switch to full width', () => {
            void this.toggleWidth(view);
        });

        if (btn) {
            this.widthToggleBtns.set(view, btn);
            btn.toggle(false); // Default hidden
        }
        return btn;
    }

    async toggleWidth(view: MarkdownView) {
        const file = view.file;
        if (!file || !(file instanceof TFile)) return;

        const isCurrentlyFull = view.containerEl.hasClass('brain-core-full-width');

        try {
            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                if (isCurrentlyFull) {
                    // Current: Full -> User wants Standard
                    frontmatter['bc-width'] = 'standard';
                } else {
                    // Current: Standard -> User wants Full (Default)
                    delete frontmatter['bc-width'];
                }
            });
        } catch (error) {
            console.error('BrainCore: Failed to toggle width via frontmatter:', error);
            // 🟢 修复 3: 使用 Sentence case，且按照 Obsidian 官方建议去除插件前缀和句号
            new Notice('Unable to update file properties');
        }
    }

    updateIconState(btn: HTMLElement, isFull: boolean) {
        setIcon(btn, isFull ? 'minimize' : 'maximize');
        btn.setAttribute('aria-label', isFull ? 'Restore standard width' : 'Switch to full width');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}