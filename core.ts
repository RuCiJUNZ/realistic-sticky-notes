import { MarkdownRenderChild, App } from 'obsidian';

// ============================================================
// 1. 基础配置项接口
// ============================================================
export interface WidgetConfigItem {
    label: string;
    icon: string;
    // 🟢 修复：用 Record<string, unknown> 代替 any
    // 这表示 config 是一个对象，或者对象数组
    config: Record<string, unknown> | Record<string, unknown>[];
}

// ============================================================
// 2. 模块定义 (用于 EmptyState 和 右键菜单)
// ============================================================
export interface WidgetModule {
    id: string;
    label: string;
    icon: string;
    dashboards?: WidgetConfigItem[]; // 完整版布局预设
    views?: WidgetConfigItem[];      // 单个原子组件预设
}

// ============================================================
// 3. 组件配置接口 (与 RGL 和 Presets 对齐)
// ============================================================
export interface WidgetConfig {
    // RGL 核心属性
    i: string;        // 唯一 ID (React Key)
    x: number;
    y: number;
    w: number;
    h: number;

    // 尺寸限制
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;

    // 业务属性
    type: string;     // 组件注册类型
    title?: string;   // 组件标题
    locked?: boolean; // 是否锁定位置

    // 数据属性 (🟢 修复：全部将 any 改为 unknown 或 Record)
    viewType?: string;
    data?: unknown;             // 静态数据缓存，使用时需断言类型
    queryRules?: unknown;       // 查询规则
    _globalSettings?: Record<string, unknown>; // 运行时注入的设置

    // 允许任意扩展字段 (🟢 修复：索引签名必须是 unknown)
    [key: string]: unknown;
}

// ============================================================
// 4. 组件基类 (核心桥梁)
// ============================================================
export abstract class BaseWidget extends MarkdownRenderChild {
    app: App;
    config: WidgetConfig;
    container: HTMLElement;

    /**
     * @param app Obsidian App 实例
     * @param container 容器 DOM
     * @param config 组件配置数据
     */
    constructor(app: App, container: HTMLElement, config: WidgetConfig) {
        super(container);
        this.app = app;
        this.container = container;
        this.config = config;
    }

    /**
     * 🟢 必须实现：核心渲染逻辑
     */
    abstract render(): Promise<void>;

    /**
         * 🟢 生命周期钩子：当容器尺寸变化时触发
         */
    onResize(_height: number, _width: number): void {
        // 默认空实现，子类可重写
    }
    /**
     * 🟢 生命周期钩子：刷新/重载
     */
    async refresh(): Promise<void> {
        this.container.empty(); // 清空容器
        await this.render();    // 重新渲染
    }

    /**
     * 🟢 标准销毁钩子
     */
    onunload() {
        // 子类覆盖时记得调用 super.onunload()
    }
}

// ============================================================
// 5. 注册机制 (装饰器模式)
// ============================================================

// 🟢 新增：定义构造函数类型，避免在 Registry 中使用 any
export type WidgetConstructor = new (app: App, container: HTMLElement, config: WidgetConfig) => BaseWidget;

export const WidgetRegistry: Record<string, WidgetConstructor> = {};

export function RegisterWidget(type: string) {
    // 🟢 修复：target 类型改为具体的构造函数类型
    return function (target: WidgetConstructor) {
        WidgetRegistry[type] = target;
        // console.log(`BrainCore: Registered widget [${type}]`);
    };
}