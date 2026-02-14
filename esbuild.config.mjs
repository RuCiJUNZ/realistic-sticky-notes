import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { sassPlugin } from "esbuild-sass-plugin";
import { exec } from "child_process"; // 🟢 新增：引入执行命令的模块

const banner =
    `/**
 * Realistic Sticky Notes
 * Copyright (c) 2026 sumus (素木生)
 * Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0)
 * https://github.com/RuCiJUNZ/
 */`;

const prod = (process.argv[2] === "production");

// 🟢 新增：定义一个 ESLint 自动修复插件
const eslintPlugin = {
    name: "eslint-autofix",
    setup(build) {
        build.onEnd((result) => {
            // 如果 esbuild 编译本身就失败了，就不跑 eslint 了，免得刷屏
            if (result.errors.length > 0) return;

            console.log("🧹 Running ESLint autofix...");
            // 执行修复命令 (针对当前目录下的所有文件)
            exec("npx eslint . --fix", (err, stdout, stderr) => {
                if (stdout) console.log(stdout); // 输出 ESLint 的提示
                if (stderr) console.error(stderr); // 输出错误
                if (!err) {
                    console.log("✨ ESLint autofix complete!");
                }
            });
        });
    },
};

const context = await esbuild.context({
    banner: {
        js: banner,
    },
    entryPoints: {
        main: "main.tsx",
        styles: "src/styles/main.scss",
    },
    bundle: true,
    external: [
        "obsidian",
        "electron",
        "@codemirror/autocomplete",
        "@codemirror/collab",
        "@codemirror/commands",
        "@codemirror/language",
        "@codemirror/lint",
        "@codemirror/search",
        "@codemirror/state",
        "@codemirror/view",
        ...builtins
    ],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: false,
    treeShaking: true,
    minify: prod,

    plugins: [
        sassPlugin(),
        eslintPlugin, // 🟢 关键：把我们刚才写的插件加到这里
    ],

    outdir: ".",
});

if (prod) {
    await context.rebuild();
    process.exit(0);
} else {
    await context.watch();
}