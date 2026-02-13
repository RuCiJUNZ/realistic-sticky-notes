// styles.ts

export const injectStyles = () => {
    const id = 'bc-whiteboard-styles-v5-final-split';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.innerHTML = `
        /* --- 核心：移动端交互修复 --- */
        .bc-wb-container {
            width: 100%; height: 100%; position: relative; overflow: hidden;
            background-color: var(--background-primary);
            cursor: grab;

            /* 1. 禁用浏览器默认手势 (缩放、平移)，交给 @use-gesture 处理 */
            touch-action: none !important;

            /* 2. 禁止用户选中文本 (解决 iOS 长按弹出系统菜单的核心) */
            -webkit-user-select: none !important;
            user-select: none !important;

            /* 3. 禁止 iOS 长按链接/图片呼出菜单 */
            -webkit-touch-callout: none !important;

            /* 4. 适配刘海屏和底部黑条 (Safe Area) */
            padding-bottom: env(safe-area-inset-bottom);
            padding-left: env(safe-area-inset-left);
            padding-right: env(safe-area-inset-right);

            transition: background-image 0.2s, background-color 0.2s;
        }

        .bc-wb-container:active { cursor: grabbing; }

        /* 便利贴容器同样需要禁止默认行为 */
        .bc-wb-note {
            position: absolute; padding: 10px;
            display: flex; flex-direction: column;
            cursor: move;

            /* 继承父级的防触控设置 */
            touch-action: none !important;
            user-select: none !important;
            -webkit-user-select: none !important;
            -webkit-touch-callout: none !important;

            transition: box-shadow 0.2s, transform 0.2s;
        }

        /* 仅在编辑模式下，允许用户输入和选择文本 */
        .bc-wb-note.editing textarea {
            user-select: text !important;
            -webkit-user-select: text !important;
            /* 允许默认操作以便移动光标 */
            touch-action: manipulation !important;
            cursor: text;
        }

        /* --- 背景墙样式 --- */
        .bc-wall-dots { background-image: radial-gradient(var(--background-modifier-border) 1.5px, transparent 1.5px); background-size: 24px 24px; }
        .bc-wall-grid { background-image: linear-gradient(var(--background-modifier-border) 1px, transparent 1px), linear-gradient(90deg, var(--background-modifier-border) 1px, transparent 1px); background-size: 40px 40px; }
        .bc-wall-lines { background-image: linear-gradient(var(--background-modifier-border) 1px, transparent 1px); background-size: 100% 30px; }
        .bc-wall-mesh { background-color: #2c3e50; background-image: linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px); background-size: 20px 20px; }
        .bc-wall-plain { background-image: none; }
/* --- 背景墙样式：高清干净版暖色软木 --- */
.bc-wall-soft {
    /* 1. 保留你喜欢的温暖底色 */
    background-color: #d2a679;

    /* 2. 纹理重构：使用柔和的有机噪点代替圆点 */
    background-image:
        /* 第一层：极微弱的白色细屑 (增加木质纤维感，不显脏) */
        radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.15) 1px, transparent 0),
        /* 第二层：关键纹理！使用动态生成的微噪点，模拟真实的压制软木质感 */
        url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.06'/%3E%3C/svg%3E");

    /* 3. 固定平铺尺寸，防止大面积黑白块 */
    background-size: 30px 30px, auto;

    /* 4. 添加一个非常淡的暖色光晕，让中心区域看起来干净通透 */
    box-shadow: inset 0 0 120px rgba(255, 215, 150, 0.2);
}

/* --- 暗色模式：保留温暖感的深色软木 --- */
.theme-dark .bc-wall-soft {
    /* 深色模式下也保持那种“木质”的暖调，而不是纯灰 */
    background-color: #3d3228;

    background-image:
        radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.05) 1px, transparent 0),
        url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.1'/%3E%3C/svg%3E");

    background-size: 30px 30px, auto;
}
        /* --- 样式细节 --- */
        .bc-wb-note:hover { z-index: 100 !important; }
        .bc-wb-note.editing { z-index: 1000 !important; transform: rotate(0deg) !important; box-shadow: 0 0 0 2px var(--interactive-accent) !important; }
        .bc-wb-editor, .bc-wb-note div { line-height: 24px !important; }
        .bc-bg-solid { }
        .bc-bg-lined { background-image: linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px); background-size: 100% 24px; background-position: 0 10px; }
        .bc-bg-grid { background-image: linear-gradient(rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.08) 1px, transparent 1px); background-size: 24px 24px; background-position: 10px 10px; }
        .bc-bg-dotted { background-image: radial-gradient(rgba(0,0,0,0.15) 1.5px, transparent 1.5px); background-size: 24px 24px; background-position: 10px 10px; }

        .bc-wb-note.style-realistic { box-shadow: 2px 4px 10px rgba(0,0,0,0.15); border-bottom-right-radius: 40px 5px; font-family: 'Comic Sans MS', 'Ink Free', sans-serif; }
        .bc-wb-note.style-realistic:hover { box-shadow: 5px 8px 15px rgba(0,0,0,0.2); }
        .bc-wb-note.style-geometric { box-shadow: 0 2px 8px rgba(0,0,0,0.15); border: none; border-radius: 2px; font-family: var(--font-interface); box-sizing: border-box; }
        .bc-wb-note.style-geometric:hover { box-shadow: 0 8px 16px rgba(0,0,0,0.2); z-index: 500 !important; }

        .bc-wb-editor { width: 100%; height: 100%; background: transparent; border: none; outline: none; resize: none; font-size: 14px; color: inherit; font-family: inherit; overflow: hidden; }

        /* --- Pins 样式 --- */
      /* --- Pins 样式 --- */
        .bc-pin-wrapper { position: absolute; top: -20px; width: 40px; height: 40px; z-index: 20; pointer-events: none; display: flex; justify-content: center; align-items: center; }

        /* ⭐ 修改 1: 调整回形针容器位置 */
        /* 根据你的图片长宽比，可能需要微调 top 的值，让它看起来夹在边缘 */
        .bc-pin-wrapper.is-clip { top: -15px; z-index: 25; }

        .bc-pin-pos-left { left: -6px; }
        .bc-pin-pos-center { left: 50%; transform: translateX(-50%); }
        .bc-pin-pos-right { right: -6px; }

        /* 其他 CSS 样式保持不变 (circle, tape, pushpin) */
        .bc-pin-circle { width: 20px; height: 20px; border-radius: 50%; background-color: rgba(235, 60, 60, 0.85); box-shadow: 0 1px 3px rgba(0,0,0,0.2); border: 1px solid rgba(200, 50, 50, 0.5); }
        .bc-pin-tape { width: 55px; height: 16px; background-color: rgba(255, 255, 255, 0.45); background-image: linear-gradient(105deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0) 100%); box-shadow: 0 1px 2px rgba(0,0,0,0.1); transform: rotate(-2deg); border-left: 2px dotted rgba(255,255,255,0.7); border-right: 2px dotted rgba(255,255,255,0.7); border-top: 1px solid rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.1); }
        .bc-pin-pushpin { width: 16px; height: 16px; border-radius: 50%; position: relative; z-index: 25; border: none; background: radial-gradient(circle at 30% 30%, #ffffff 0%, #ff8a80 15%, #d32f2f 40%, #9a0007 85%, #6d0000 100%); box-shadow: 2px 3px 6px rgba(0,0,0,0.35); }
        .bc-pin-pushpin::after { content: ''; position: absolute; top: 50%; left: 50%; width: 4px; height: 4px; background: rgba(0,0,0,0.5); border-radius: 50%; transform: translate(-50%, 80%); z-index: -1; filter: blur(1px); }

        /* ⭐ 修改 2: 新增图片的样式 */
        .bc-pin-img-clip {
            width: 24px; /* 根据你的图片大小调整宽度 */
            height: auto;
            transform: rotate(-5deg); /* 微微倾斜更自然 */
            /* 给 PNG 图片本身添加投影，增加真实感 */
            filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.25));
        }

        /* ❌ 删除旧的 .bc-pin-clip 和 .bc-pin-clip::after 代码 */

        /* --- 菜单样式修正 (Portal Overlay) --- */
     .bc-ctx-overlay {
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            z-index: 9999;
            background-color: transparent; /* ⭐ 修改这里：从 rgba(...) 改为 transparent */
        }
        .bc-ctx-menu {
            position: fixed; /* 改为 fixed，相对于视口定位 */
            width: 240px; background: var(--background-primary);
            border: 1px solid var(--background-modifier-border); box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            border-radius: 6px; padding: 8px; z-index: 10000; font-size: 12px;
            display: flex; flex-direction: column; gap: 8px;
            max-height: 80vh; overflow-y: auto;
        }

        /* 菜单内部样式 */
        .bc-ctx-section { display: flex; flex-direction: column; gap: 4px; }
        .bc-ctx-title { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 2px; border-bottom: 1px solid var(--background-modifier-border); margin-bottom: 4px; }
        .bc-ctx-grid { display: grid; gap: 4px; }
        .bc-ctx-btn { background: var(--background-secondary); border: 1px solid transparent; border-radius: 6px; height: 32px; display: flex; justify-content: center; align-items: center; cursor: pointer; color: var(--text-muted); transition: all 0.1s; }
        .bc-ctx-btn:hover { background: var(--background-modifier-hover); color: var(--text-normal); }
        .bc-ctx-btn.active { background: var(--interactive-accent); color: var(--text-on-accent); }
        .bc-ctx-btn.active .bc-ctx-color-swatch { border-color: #fff; box-shadow: 0 0 0 1px #fff; }
        .bc-ctx-color-swatch { width: 16px; height: 16px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.1); }
        .bc-ctx-delete { margin-top: 4px; background: var(--background-modifier-error); color: var(--text-on-accent); }
        .bc-ctx-btn svg { width: 18px; height: 18px; stroke-width: 2px; }

        /* 控制栏 */
        .bc-wb-controls { position: absolute; top: 16px; right: 16px; display: flex; gap: 8px; z-index: 50; }
        .bc-control-btn { width: 36px; height: 36px; background-color: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 8px; display: flex; justify-content: center; align-items: center; cursor: pointer; color: var(--text-muted); transition: all 0.2s ease; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .bc-control-btn:hover { background-color: var(--interactive-hover); color: var(--text-normal); transform: translateY(-1px); }
        .bc-control-btn.active { background-color: var(--interactive-accent); color: var(--text-on-accent); }
        .bc-control-btn svg { width: 20px; height: 20px; stroke-width: 2px; }
    `;
    document.head.appendChild(style);
};