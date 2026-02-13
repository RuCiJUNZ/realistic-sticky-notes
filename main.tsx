import { Plugin, TFile, WorkspaceLeaf, MarkdownView, setIcon, debounce, Notice } from 'obsidian';
import { BrainCoreSettings, DEFAULT_SETTINGS, BrainCoreSettingTab } from './settings';
import { ReactHost } from './src/views/react-host';
import { CODE_BLOCK_TAG } from './src/notes/constants';
import { WelcomeView, WELCOME_VIEW_TYPE } from './src/welcome-view';
import './src/notes/index';

export default class BrainCorePlugin extends Plugin {
    settings: BrainCoreSettings;
    public static instance: BrainCorePlugin;
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
            name: 'Insert Sticky Notes',
            editorCallback: (editor) => {
                editor.replaceSelection(`\`\`\`${CODE_BLOCK_TAG}\nNew Board\n\`\`\``);
            }
        });

        this.addCommand({
            id: 'open-welcome-page',
            name: 'Open Welcome Page',
            callback: () => this.activateWelcomeView()
        });

        this.app.workspace.onLayoutReady(async () => {
            if (!this.settings.hasShownWelcome) {
                await this.activateWelcomeView();
                this.settings.hasShownWelcome = true;
                await this.saveSettings();
            }
        });

        // ============================================================
        // ⭐ 优化全宽检测事件监听 (修复版)
        // ============================================================
        // 这里的 debounce 第三个参数改为 false，防止首次立即执行拿到错误状态
        const debouncedCheck = debounce(this.checkPageWidth.bind(this), 100, false);

        // 1. 切换标签页时检测
        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
            if (leaf) debouncedCheck(leaf);
        }));

        // 2. 布局变化时检测
        this.registerEvent(this.app.workspace.on('layout-change', () => {
            // ⭐ 关键修复：只获取当前活动的 Markdown 视图，绝对不让它自动创建新 Tab
            const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
            if (activeLeaf) {
                debouncedCheck(activeLeaf);
            }
        }));

        // 3. ⭐ 关键：当 YAML (Frontmatter) 发生变化时，立即重新检测并更新样式
        this.registerEvent(this.app.metadataCache.on('changed', (file) => {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            // 确保文件匹配且视图存在
            if (activeView && activeView.file === file) {
                debouncedCheck(activeView.leaf);
            }
        }));
    }

    async activateWelcomeView() {
        const { workspace } = this.app;

        // 先检查是否已经存在欢迎页
        const leaves = workspace.getLeavesOfType(WELCOME_VIEW_TYPE);

        if (leaves.length > 0) {
            // 如果存在，直接激活第一个
            workspace.revealLeaf(leaves[0]);
        } else {
            // 如果不存在，在一个新标签页中打开
            // getLeaf('tab') 是安全的 API，明确用于打开新标签页
            const leaf = workspace.getLeaf('tab');
            await leaf.setViewState({ type: WELCOME_VIEW_TYPE, active: true });
            workspace.revealLeaf(leaf);
        }
    }

    async onunload() {
        // 清理逻辑 (通常不需要手动清理 View，Obsidian 会处理)
    }

    // ============================================================
    // ⭐ 全宽模式核心逻辑 (YAML 持久化版)
    // ============================================================

    async checkPageWidth(leaf: WorkspaceLeaf | null) {
        // 1. 基础校验：必须是 MarkdownView
        if (!leaf || !(leaf.view instanceof MarkdownView)) return;

        const view = leaf.view as MarkdownView;
        const file = view.file;
        if (!file) return;

        // 2. 读取 YAML 缓存
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        // 3. 检测逻辑
        // 检测内容中是否有 sticky-note 代码块
        let hasStickyNote = false;
        try {
            const content = await this.app.vault.cachedRead(file);
            hasStickyNote = content.includes(`\`\`\`${CODE_BLOCK_TAG}`);
        } catch (e) {
            // 读取文件失败 (可能文件被删除或不可读)，默认无 sticky note
            hasStickyNote = false;
        }

        // 检测用户是否强制设置了标准宽 (bc-width: standard)
        const userForceStandard = frontmatter && frontmatter['bc-width'] === 'standard';

        let btn = this.widthToggleBtns.get(view);

        // 4. 样式应用逻辑
        // 情况 A: 有便利贴 且 用户没强制设为标准宽 -> 全宽
        if (hasStickyNote && !userForceStandard) {
            if (!view.containerEl.classList.contains('brain-core-full-width')) {
                view.containerEl.addClass('brain-core-full-width');
            }

            // 显示按钮
            if (!btn) btn = this.createToggleBtn(view);
            if (btn) {
                btn.style.display = '';
                this.updateIconState(btn, true); // true = 当前是全宽
            }

        }
        // 情况 B: 有便利贴 但 用户强制设为标准宽 -> 标准宽
        else if (hasStickyNote && userForceStandard) {
            view.containerEl.removeClass('brain-core-full-width');

            // 显示按钮
            if (!btn) btn = this.createToggleBtn(view);
            if (btn) {
                btn.style.display = '';
                this.updateIconState(btn, false); // false = 当前是标准宽
            }
        }
        // 情况 C: 没便利贴 -> 清理
        else {
            view.containerEl.removeClass('brain-core-full-width');
            if (btn) btn.style.display = 'none';
        }
    }

    // 辅助：创建按钮
    createToggleBtn(view: MarkdownView) {
        // addAction 有时可能返回 undefined (极少数情况)
        const btn = view.addAction('minimize', '切换全宽', () => this.toggleWidth(view));
        if (btn) {
            this.widthToggleBtns.set(view, btn);
        }
        return btn;
    }

    // ⭐ 核心交互：写入 YAML
    async toggleWidth(view: MarkdownView) {
        const file = view.file;
        if (!file) return;

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
            // 修改 Frontmatter 后，this.app.metadataCache.on('changed') 会触发 checkPageWidth
        } catch (error) {
            console.error('Failed to toggle width via frontmatter:', error);
            new Notice('无法更新文件属性，请检查控制台。');
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