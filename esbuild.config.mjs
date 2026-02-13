import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { sassPlugin } from "esbuild-sass-plugin";
const banner =
    `/**
 * Realistic Sticky Notes
 * Copyright (c) 2026 sumus (素木生)
 * Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0)
 * https://github.com/RuCiJUNZ/
 */`;

const prod = (process.argv[2] === "production");

const context = await esbuild.context({
    banner: {
        js: banner,
    },
    // 🟢 两个入口：左边是输出文件名，右边是源文件
    entryPoints: {
        main: "main.tsx",
        styles: "src/styles/main.scss", // 👈 修改这里，指向正确的路径
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
        ...builtins],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: false, // 关闭 Source Map 避免 4万行代码
    treeShaking: true,
    minify: prod, // 生产环境压缩

    // 🟢 插件配置
    plugins: [
        sassPlugin(),
    ],

    // 🟢 关键修改：使用 outdir 而不是 outfile
    outdir: ".",
});

if (prod) {
    await context.rebuild();
    process.exit(0);
} else {
    await context.watch();
}