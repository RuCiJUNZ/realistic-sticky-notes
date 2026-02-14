import { ItemView, WorkspaceLeaf, App } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';

export const WELCOME_VIEW_TYPE = 'brain-core-welcome';

// ============================================================
// Icons (Minimalist Set)
// ============================================================
const Icons = {
    Logo: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
        </svg>
    ),
    Plus: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
    ),
    ArrowRight: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
        </svg>
    )
};

// ============================================================
// React Component
// ============================================================
const WelcomePage: React.FC<{ app: App, onClose: () => void }> = ({ app, onClose }) => {

    // 修改 1: 移除外层的 async，改用内部异步闭包
    // 这样 handleCreate 本身返回 void，满足 onClick 的类型要求
    const handleCreate = () => {
        (async () => {
            const fileName = `Sticky board ${Date.now()}.md`;
            const content = `# My sticky notes\n\nDouble-click anywhere to add a note.\n\n\`\`\`sticky-note\nNew Board\n\`\`\``;

            try {
                const file = await app.vault.create(fileName, content);

                // 打开新文件
                await app.workspace.getLeaf(true).openFile(file);

                // ✅ 修改 2: 成功后调用 onClose 关闭欢迎页
                onClose();
            } catch (e) {
                console.error("Failed to create file", e);
                // 建议: 添加一个 Notice 提示用户失败
                // new Notice("创建失败");
            }
        })();
    };
    return (
        <div className="bc-container">
            <div className="bc-content">

                {/* 1. Logo Section */}
                <div className="bc-logo-ring">
                    <Icons.Logo />
                </div>

                {/* 2. Title Section */}
                {/* 🟢 Fix: Sentence case ("Sticky notes") */}
                <h1 className="bc-title">Sticky notes</h1>
                <p className="bc-subtitle">
                    Infinite canvas for your thoughts in Obsidian.
                </p>

                {/* 3. Action Section */}
                <div className="bc-actions">
                    {/* ✅ 修改 3: 现在可以直接传递 handleCreate 了，因为它不再返回 Promise */}
                    <button className="bc-btn-primary" onClick={handleCreate}>
                        <Icons.Plus />
                        <span>Create new board</span>
                    </button>

                    <div className="bc-footer-text">
                        <small>Double-click canvas to add notes • Right-click for options</small>
                    </div>
                </div>

            </div>

            <style>{`
                /* Container Layout */
                .bc-container {
                    height: 100%;
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background-color: var(--background-primary);
                    font-family: var(--font-interface);
                    animation: fadeIn 0.5s ease-out;
                }

                .bc-content {
                    text-align: center;
                    max-width: 400px;
                    width: 100%;
                    padding: 40px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                /* Logo Styling */
                .bc-logo-ring {
                    width: 96px;
                    height: 96px;
                    background: var(--background-secondary);
                    border-radius: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 32px;
                    color: var(--interactive-accent);
                    box-shadow: 0 0 0 1px var(--background-modifier-border),
                                0 8px 24px -6px rgba(0,0,0,0.1);
                    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                .bc-logo-ring:hover {
                    transform: scale(1.05) rotate(-3deg);
                    color: var(--interactive-accent-hover);
                }

                .bc-logo-ring svg {
                    width: 48px;
                    height: 48px;
                }

                /* Typography */
                .bc-title {
                    font-size: 2.5em;
                    font-weight: 800;
                    margin: 0 0 12px 0;
                    letter-spacing: -0.02em;
                    color: var(--text-normal);
                }

                .bc-subtitle {
                    font-size: 1.1em;
                    color: var(--text-muted);
                    margin: 0 0 40px 0;
                    line-height: 1.5;
                }

                /* Button Styling */
                .bc-actions {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 16px;
                }

                .bc-btn-primary {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    width: 100%;
                    padding: 14px 24px;
                    font-size: 1em;
                    font-weight: 600;
                    border-radius: 12px;
                    border: none;
                    cursor: pointer;
                    background-color: var(--interactive-accent);
                    color: var(--text-on-accent);
                    transition: all 0.2s ease;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }

                .bc-btn-primary:hover {
                    opacity: 0.9;
                    transform: translateY(-2px);
                    box-shadow: 0 6px 16px rgba(0,0,0,0.15);
                }

                .bc-btn-primary svg {
                    width: 18px;
                    height: 18px;
                }

                .bc-footer-text {
                    color: var(--text-faint);
                    font-size: 0.8em;
                }

                /* Animations */
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

// ============================================================
// Obsidian View Wrapper
// ============================================================
export class WelcomeView extends ItemView {
    root: Root | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() { return WELCOME_VIEW_TYPE; }
    getDisplayText() { return "Sticky notes"; }
    getIcon() { return "sticky-note"; }

    // ✅ Fix: Removed 'async' because there are no 'await' calls
    onOpen(): Promise<void> {
        const container = this.contentEl;
        container.empty();

        this.root = createRoot(container);

        this.root.render(
            <WelcomePage
                app={this.app}
                // When the component calls onClose, detach the leaf (close the tab)
                onClose={() => { this.leaf.detach(); }}
            />
        );

        return Promise.resolve();
    }

    // ✅ Fix: Removed 'async'
    onClose(): Promise<void> {
        this.root?.unmount();
        return Promise.resolve();
    }
}