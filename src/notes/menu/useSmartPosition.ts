// src/notes/hooks/useSmartPosition.ts
import { useLayoutEffect, useState } from 'react';
import { Platform } from 'obsidian';

export const useSmartPosition = (x: number, y: number, width: number, height: number, visible: boolean) => {
    const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });

    useLayoutEffect(() => {
        if (!visible) return;

        const isMobile = Platform.isMobile;

        if (isMobile) {
            setStyle({
                position: 'fixed', left: 0, bottom: 0, width: '100%',
                borderRadius: '20px 20px 0 0', zIndex: 9999,
                animation: 'bc-slide-up 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
            });
            return;
        }

        // 桌面端智能计算
        let finalX = x;
        let finalY = y;
        const padding = 12;

        if (x + width > window.innerWidth) finalX = window.innerWidth - width - padding;
        if (y + height > window.innerHeight) finalY = window.innerHeight - height - padding;

        // 确保不超出顶部
        finalY = Math.max(padding, finalY);

        setStyle({
            position: 'fixed',
            left: finalX,
            top: finalY,
            width: width,
            zIndex: 9999,
            opacity: 1,
            transform: 'scale(1)',
            transformOrigin: `${x > window.innerWidth / 2 ? 'right' : 'left'} ${y > window.innerHeight / 2 ? 'bottom' : 'top'}`,
            animation: 'bc-pop-in 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
        });
    }, [x, y, visible, width, height]);

    return style;
};