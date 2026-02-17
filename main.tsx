import {
    Plugin,
    MarkdownView,
    setIcon,
    debounce,
    Notice,
    WorkspaceLeaf,
    TFile,
    Platform
} from 'obsidian';
import { BrainCoreSettings, DEFAULT_SETTINGS, BrainCoreSettingTab } from './settings';
import { ReactHost } from './src/views/react-host';
import { CODE_BLOCK_TAG } from './src/notes/constants';
import { WelcomeView, WELCOME_VIEW_TYPE } from './src/welcome-view';
import './src/notes/index';

export default class BrainCorePlugin extends Plugin {
    settings: BrainCoreSettings;
    public static instance: BrainCorePlugin;
    // 使用 WeakMap 防止内存泄漏，键为 View，值为按钮元素
    private widthToggleBtns: WeakMap<MarkdownView, HTMLElement> = new WeakMap();

    async onload() {
        BrainCorePlugin.instance = this;

        await this.loadSettings();
        this.addSettingTab(new BrainCoreSettingTab(this.app, this));

        this.registerView(WELCOME_VIEW_TYPE, (leaf) => new WelcomeView(leaf));

        // ============================================================
        // ⭐ 2. 注册代码块渲染器
        // ============================================================
        this.registerMarkdownCodeBlockProcessor(CODE_BLOCK_TAG, (source, el, ctx) => {
            ctx.addChild(new ReactHost(el, source.trim(), this, ctx));
        });

        // ============================================================
        // ⭐ 3. 修改插入命令
        // ============================================================
        this.addCommand({
            id: 'insert-sticky-notes-board',
            name: 'Insert sticky notes',
            editorCallback: (editor) => {
                editor.replaceSelection(`\`\`\`${CODE_BLOCK_TAG}\nNew Board\n\`\`\``);
            }
        });

        this.addCommand({
            id: 'open-welcome-page',
            name: 'Open welcome page',
            callback: () => { void this.activateWelcomeView(); }
        });

        this.app.workspace.onLayoutReady(async () => {
            if (!this.settings.hasShownWelcome) {
                await this.activateWelcomeView();
                this.settings.hasShownWelcome = true;
                await this.saveSettings();
            }
        });

        // ============================================================
        // ⭐ 优化全宽检测事件监听
        // ============================================================
        // debounce 防止频繁触发
        const debouncedCheck = debounce(this.checkPageWidth.bind(this), 100, true);

        // 1. 切换标签页时检测
        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
            if (leaf) void debouncedCheck(leaf);
        }));

        // 2. 布局变化时检测
        this.registerEvent(this.app.workspace.on('layout-change', () => {
            const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
            if (activeLeaf) {
                void debouncedCheck(activeLeaf);
            }
        }));

        // 3. 监听元数据变化 (Frontmatter 修改会触发此事件)
        this.registerEvent(this.app.metadataCache.on('changed', (file) => {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.file === file) {
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
        // 插件卸载时，Obsidian 会自动清理通过 registerEvent 注册的事件
        // 但如果修改了 DOM 样式 (如 addClass)，最好在这里移除，虽非强制但推荐
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView && leaf.view.containerEl) {
                leaf.view.containerEl.removeClass('brain-core-full-width');
            }
        });
    }

    // ============================================================
    // ⭐ 全宽模式核心逻辑 (修复与优化版)
    // ============================================================

    async checkPageWidth(leaf: WorkspaceLeaf | null) {
        // 1. 基础校验：必须是 MarkdownView 且有文件
        if (!leaf || !(leaf.view instanceof MarkdownView)) return;

        const view = leaf.view;
        const file = view.file;
        if (!file || !(file instanceof TFile)) return;

        // 2. 性能优化：先通过 MetadataCache 预判
        const cache = this.app.metadataCache.getFileCache(file);

        // 如果 Cache 中连 'code' 类型的 section 都没有，那肯定没有便利贴，直接跳过耗时的读取
        const hasCodeSection = cache?.sections?.some(sec => sec.type === 'code');

        let hasStickyNote = false;

        // 只有当存在代码块时，才读取文件内容进行精确匹配
        if (hasCodeSection) {
            try {
                const content = await this.app.vault.cachedRead(file);
                // 严格匹配代码块标记
                hasStickyNote = content.includes(`\`\`\`${CODE_BLOCK_TAG}`);
            } catch (e) {
                console.warn('BrainCore: Failed to read file content', e);
                hasStickyNote = false;
            }
        }

        // 3. 读取 Frontmatter 配置
        const frontmatter = cache?.frontmatter;
        // 检测用户是否强制设置了标准宽 (bc-width: standard)
        const userForceStandard = frontmatter && frontmatter['bc-width'] === 'standard';

        // 获取或创建按钮
        let btn = this.widthToggleBtns.get(view);

        // 4. 样式应用逻辑
        const shouldBeFullWidth = hasStickyNote && !userForceStandard;

        if (shouldBeFullWidth) {
            // ---> 应用全宽
            if (!view.containerEl.classList.contains('brain-core-full-width')) {
                view.containerEl.addClass('brain-core-full-width');
            }

            // 确保按钮存在
            if (!btn) btn = this.createToggleBtn(view);

            // 显示按钮并更新图标
            if (btn) {
                // 🟢 修复：用原生 DOM 操作替代 setCssProps
                btn.style.display = '';
                this.updateIconState(btn, true);
            }

        } else {
            // ---> 恢复标准宽 (两种情况：没有便利贴，或者用户强制标准宽)
            view.containerEl.removeClass('brain-core-full-width');

            if (hasStickyNote && userForceStandard) {
                // 情况 B: 有便利贴但用户强制缩小 -> 移除全宽样式，但保留按钮让用户能切回去
                if (!btn) btn = this.createToggleBtn(view);
                if (btn) {
                    btn.style.display = '';
                    this.updateIconState(btn, false);
                }
            } else {
                // 情况 C: 根本没有便利贴 -> 移除样式，隐藏按钮
                if (btn) {
                    btn.style.display = 'none';
                }
            }
        }
    }

    // 辅助：创建按钮
    createToggleBtn(view: MarkdownView): HTMLElement | undefined {
        // 只有在按钮不存在时才创建
        if (this.widthToggleBtns.has(view)) {
            return this.widthToggleBtns.get(view);
        }

        const btn = view.addAction('minimize', '切换全宽', () => {
            void this.toggleWidth(view);
        });

        if (btn) {
            this.widthToggleBtns.set(view, btn);
            // 默认先隐藏，由 checkPageWidth 决定显示
            btn.style.display = 'none';
        }
        return btn;
    }

    // ⭐ 核心交互：写入 YAML
    async toggleWidth(view: MarkdownView) {
        const file = view.file;
        if (!file || !(file instanceof TFile)) return;

        const isCurrentlyFull = view.containerEl.classList.contains('brain-core-full-width');

        try {
            // 使用 processFrontMatter 安全修改，不影响其他属性
            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                if (isCurrentlyFull) {
                    // 当前是全宽 -> 用户想变窄 -> 写入 standard
                    frontmatter['bc-width'] = 'standard';
                } else {
                    // 当前是窄 -> 用户想变全宽 -> 删除该字段 (恢复默认)
                    delete frontmatter['bc-width'];
                }
            });
            // 注意：修改 Frontmatter 后，this.app.metadataCache.on('changed') 会自动触发 checkPageWidth
        } catch (error) {
            console.error('BrainCore: Failed to toggle width via frontmatter:', error);
            new Notice('BrainCore: 无法更新文件属性。');
        }
    }

    // 更新图标 UI
    updateIconState(btn: HTMLElement, isFull: boolean) {
        // isFull=true (当前全宽) -> 显示“收缩”图标
        // isFull=false (当前标准) -> 显示“展开”图标
        setIcon(btn, isFull ? 'minimize' : 'maximize');
        btn.setAttribute('aria-label', isFull ? '恢复标准栏宽' : '切换至全宽模式');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}