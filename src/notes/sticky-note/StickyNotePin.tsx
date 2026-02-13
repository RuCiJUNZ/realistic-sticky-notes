// src/notes/components/StickyNotePin.tsx
import React from 'react';
// 注意：根据你的目录结构，这里可能需要调整 import 路径
// 假设当前在 src/notes/components/，原本图片在 src/assets/images
import { REACT_LOGO_BASE64 } from '../../assets/images';

interface StickyNotePinProps {
    type?: string;
    pos?: string;
}

export const StickyNotePin: React.FC<StickyNotePinProps> = React.memo(({ type, pos }) => {
    // 1. 如果没有类型或为 none，直接不渲染
    if (!type || type === 'none') return null;

    // 2. 计算样式类
    const posClass = `bc-pin-pos-${pos || 'center'}`;
    const wrapperExtraClass = type === 'clip' ? 'is-clip' : '';

    // 3. 特殊处理：回形针 (Clip)
    if (type === 'clip') {
        return (
            <div className={`bc-pin-wrapper ${posClass} ${wrapperExtraClass}`}>
                <img
                    src={REACT_LOGO_BASE64}
                    className="bc-pin-img-clip"
                    alt="clip"
                    draggable={false}
                    // 样式硬编码建议后续提取到 CSS 文件中
                    style={{
                        width: 24,
                        transform: 'rotate(-5deg)',
                        filter: 'drop-shadow(2px 2px 2px rgba(0,0,0,0.25))'
                    }}
                />
            </div>
        );
    }

    // 4. 处理普通样式：圆钉、胶带、大头针
    let pinClass = '';
    switch (type) {
        case 'circle': pinClass = 'bc-pin-circle'; break;
        case 'tape': pinClass = 'bc-pin-tape'; break;
        case 'pin': pinClass = 'bc-pin-pushpin'; break;
        default: pinClass = ''; // 默认无
    }

    if (!pinClass) return null;

    return (
        <div className={`bc-pin-wrapper ${posClass} ${wrapperExtraClass}`}>
            <div className={pinClass}></div>
        </div>
    );
});

StickyNotePin.displayName = 'StickyNotePin';