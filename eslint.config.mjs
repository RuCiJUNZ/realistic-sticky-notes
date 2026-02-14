// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import tseslint from "typescript-eslint";
// 1. 引入插件
import obsidianmd from "eslint-plugin-obsidianmd";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default [
    {
        files: ["**/*.ts", "**/*.tsx"],

        // 2. 关键步骤：手动注册插件
        plugins: {
            "obsidianmd": obsidianmd,
            "@typescript-eslint": tseslint.plugin,
        },

        languageOptions: {
            parser: tsparser,
            ecmaVersion: 2020,
            sourceType: "module",
            parserOptions: {
                project: "./tsconfig.json",
                tsconfigRootDir: __dirname,
            },
        },

        // 3. 关键步骤：手动提取规则
        // 我们不依赖 extends，而是直接把插件里的 recommended.rules 展开在这里
        rules: {
            // 展开 Obsidian 插件的默认规则
            ...obsidianmd.configs.recommended.rules,

            // 你的自定义覆盖
            "@typescript-eslint/no-explicit-any": "off",
            "obsidianmd/no-static-styles-assignment": "off",
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": "warn"
        },
    },

    // 4. 全局忽略
    {
        ignores: ["main.js", "node_modules/*", "dist/*", "coverage/*", "esbuild.config.mjs"]
    }
];