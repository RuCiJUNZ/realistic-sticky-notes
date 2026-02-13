// PaperclipIcon.tsx
import React from 'react';

export const PaperclipIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => {
    return (
        <svg
            viewBox="0 0 50 100"
            className={className}
            style={style}
            xmlns="http://www.w3.org/2000/svg"
            // 这里的 drop-shadow 负责整体投影
            filter="drop-shadow(2px 3px 2px rgba(0,0,0,0.3))"
        >
            <defs>
                {/* 定义金属光泽渐变：模拟圆柱体的反光 */}
                <linearGradient id="metal-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#546e7a" />
                    <stop offset="20%" stopColor="#cfd8dc" /> {/* 高光 */}
                    <stop offset="50%" stopColor="#78909c" />
                    <stop offset="80%" stopColor="#b0bec5" /> {/* 次高光 */}
                    <stop offset="100%" stopColor="#455a64" />
                </linearGradient>
            </defs>

            {/* 核心逻辑：
         为了模拟“夹住”的效果，我们需要把回形针画成看起来像是
         只有“露在外面”的那一部分。

         这里的路径是一个经过调整的回形针形状。
      */}
            <path
                d="M 15 70
           L 15 30
           A 10 10 0 1 1 35 30
           L 35 80
           A 10 10 0 1 1 15 80"
                fill="none"
                stroke="url(#metal-gradient)"
                strokeWidth="6"
                strokeLinecap="round"
            />

            {/* 为了更真实，我们可以加一个半透明的黑色遮罩在底部，
        模拟金属丝进入纸张的阴影
      */}
        </svg>
    );
};