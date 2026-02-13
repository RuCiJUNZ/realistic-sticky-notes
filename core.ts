// 核心类型定义 (WidgetConfig, Registry)
import { MarkdownRenderChild, App, Component } from 'obsidian';

// ============================================================
// 1. 基础配置项接口
// ============================================================
export interface WidgetConfigItem {
    label: string;
    icon: string;
    config: any | any[];
}

// ============================================================
// 2. 模块定义 (用于 EmptyState 和 右键菜单)
// ============================================================
export interface WidgetModule {
    id: string;
    label: string;
    icon: string;
    // 🟢 修复：改为可选属性，允许模块只包含 views 或只包含 dashboards
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

    // 🟢 新增：尺寸限制 (配合 presets.ts 防止缩成 0)
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;

    // 业务属性
    type: string;     // 组件注册类型 (如 'bc-gtd-kanban')
    title?: string;   // 组件标题
    locked?: boolean; // 是否锁定位置

    // 数据属性
    viewType?: string; // 视图 ID (用于看板等)
    data?: any;       // 静态数据缓存
    queryRules?: any; // 查询规则

    // 运行时注入
    _globalSettings?: any;

    // 允许任意扩展字段
    [key: string]: any;
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
     * @param container 容器 DOM (由 React 创建并由 ref 引用)
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
     * 在这里创建 DOM、挂载 React 组件或初始化 ECharts
     */
    abstract render(): Promise<void>;

    /**
     * 🟢 生命周期钩子：当容器尺寸变化时触发
     * 由 main.tsx 中的 ResizeObserver 调用
     * 用途：ECharts.resize() 或 重新计算布局
     * @param height 像素高度
     * @param width 像素宽度
     */
    onResize(height: number, width: number): void {
        // 默认空实现，子类按需覆盖
    }

    /**
     * 🟢 生命周期钩子：刷新/重载
     * 用于外部强制要求组件重新获取数据 (如点击了全局刷新按钮)
     */
    async refresh(): Promise<void> {
        this.container.empty(); // 清空容器
        await this.render();    // 重新渲染
    }

    /**
     * 🟢 标准销毁钩子
     * 继承自 MarkdownRenderChild，Obsidian 会在卸载时调用
     * 请在这里销毁定时器、移除事件监听、卸载 React 根节点等
     */
    onunload() {
        // 子类覆盖时记得调用 super.onunload() 如果有必要，
        // 但通常 BaseWidget 本身没有要销毁的，所以子类可以直接覆盖。
    }
}

// ============================================================
// 5. 注册机制 (装饰器模式)
// ============================================================
export const WidgetRegistry: Record<string, any> = {};

export function RegisterWidget(type: string) {
    return function (target: any) {
        WidgetRegistry[type] = target;
        // 方便调试：打印注册信息
        // console.log(`BrainCore: Registered widget [${type}]`);
    };
}