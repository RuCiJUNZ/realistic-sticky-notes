// src/notes/utils/dom.ts
import React from 'react';

/**
 * 通用的阻止冒泡函数
 */
export const stopPropagation = (e: React.SyntheticEvent | React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.stopPropagation();
};

/**
 * 适用于输入框的事件阻断集合
 * 直接解构到组件上： {...inputStopPropagationProps}
 */
export const inputStopPropagationProps = {
    onMouseDown: stopPropagation,
    onMouseUp: stopPropagation,
    onClick: stopPropagation,
    onDoubleClick: stopPropagation,
    onPointerDown: stopPropagation,
    onTouchStart: stopPropagation,
};