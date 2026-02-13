// src/notes/components/WhiteboardControls.tsx

import React, { memo, useState, useEffect, useRef } from 'react';

// =============================================================================
// 1. 图标定义
// =============================================================================

type IconComponentType = React.ComponentType<React.SVGProps<SVGElement>>;

const Icons: Record<string, IconComponentType> = {
    ChevronDown: () => (
        <path
            d="M6 9l6 6 6-6"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    ),
    Plus: () => <path d="M12 5v14M5 12h14" />,
    Check: () => <polyline points="20 6 9 17 4 12" />,
    X: () => <path d="M18 6L6 18M6 6l12 12" />,
    // 新增 Trash 图标
    Trash: () => (
        <React.Fragment>
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </React.Fragment>
    ),
    ZoomFit: () => (
        <React.Fragment>
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
        </React.Fragment>
    ),
    Background: () => (
        <React.Fragment>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
        </React.Fragment>
    ),
    Straighten: () => (
        <React.Fragment>
            <path d="M23 4v6h-6" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </React.Fragment>
    ),
    Center: () => (
        <React.Fragment>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
        </React.Fragment>
    ),
    // 状态 A：当前是斜的 (StraightenOff)
    // 图标含义：代表当前白板处于“灵动/随机”模式，显示一个歪掉的便利贴
    StraightenOff: () => (
        <rect
            x="6" y="5" width="12" height="14" rx="1.5"
            transform="rotate(-15 12 12)"
            strokeWidth="2"
        />
    ),

    // 状态 B：当前是正的 (StraightenOn)
    // 图标含义：代表当前白板处于“扶正/整齐”模式，显示一个绝对水平的便利贴
    StraightenOn: () => (
        <rect
            x="6" y="5" width="12" height="14" rx="1.5"
            strokeWidth="2"
        />
    ),
};

const Icon = ({ path: SvgPath, size = 18 }: { path: IconComponentType, size?: number }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} style={{ display: 'block' }}>
        <SvgPath />
    </svg>
);

// =============================================================================
// 2. WhiteboardControls 组件
// =============================================================================

interface CombinedControlsProps {
    fileList: string[];
    currentFile: string;
    onSwitchBoard: (name: string) => void;
    onCreateBoard: (name: string) => void;
    // 新增：删除回调
    onDeleteBoard: (name: string) => void;

    onZoomToFit: () => void;
    onToggleWall: () => void;
    onStraighten: () => void;
    onCenter: () => void;
    isStraightened: boolean;
}

export const WhiteboardHeader = () => null;

export const WhiteboardControls = memo((props: CombinedControlsProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newBoardName, setNewBoardName] = useState("");
    const wrapperRef = useRef<HTMLDivElement>(null);

    // 点击外部自动收起
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setIsCreating(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleCreateSubmit = () => {
        if (newBoardName.trim()) {
            props.onCreateBoard(newBoardName.trim());
            setIsCreating(false);
            setNewBoardName("");
        }
    };

    const HANDLE_HEIGHT = 20;
    const wrapperStyle: React.CSSProperties = {
        transform: isOpen ? 'translateY(0)' : `translateY(calc(-100% + ${HANDLE_HEIGHT}px))`
    };

    return (
        <div ref={wrapperRef} className="bc-controls-wrapper" style={wrapperStyle}>

            <div className="bc-toolbar">
                {/* 左侧：文件操作 */}
                <div className="bc-toolbar-left">
                    {!isCreating ? (
                        <>
                            <div className="bc-select-wrapper">
                                <select
                                    className="bc-select"
                                    value={props.currentFile}
                                    onChange={(e) => props.onSwitchBoard(e.target.value)}
                                >
                                    {props.fileList
                                        // 👇 新增这一行：如果名字是 'Assets'，就过滤掉（不显示）
                                        .filter(name => name !== 'Assets')
                                        // 👇 如果想过滤以 Assets 开头的所有文件，可以用这个：
                                        // .filter(name => !name.startsWith('Assets'))
                                        .map(name => (
                                            <option key={name} value={name}>{name}</option>
                                        ))
                                    }
                                </select>
                                <div className="bc-select-arrow">
                                    <Icon path={Icons.ChevronDown} size={14} />
                                </div>
                            </div>

                            <ControlButton
                                icon={Icons.Plus}
                                onClick={() => setIsCreating(true)}
                                title="Create New Board"
                            />

                            {/* 新增：删除按钮 (仅在不是默认且列表不为空时显示，或者是让用户决定逻辑) */}
                            {/* 避免删除最后一个或 default，具体逻辑可以在 Dashboard 处理，这里只负责触发 */}
                            <ControlButton
                                icon={Icons.Trash}
                                onClick={() => props.onDeleteBoard(props.currentFile)}
                                title="Delete Current Board"
                                isDanger={true}
                            />
                        </>
                    ) : (
                        // 新建模式
                        <>
                            <input
                                type="text"
                                className="bc-input-new"
                                placeholder="Board Name..."
                                value={newBoardName}
                                onChange={e => setNewBoardName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreateSubmit()}
                                autoFocus
                            />
                            <ControlButton icon={Icons.Check} onClick={handleCreateSubmit} highlight title="Confirm" />
                            <ControlButton icon={Icons.X} onClick={() => setIsCreating(false)} title="Cancel" />
                        </>
                    )}
                </div>

                <div className="bc-divider" />

                {/* 右侧：视图控制 */}
                <div className="bc-toolbar-right">
                    <ControlButton icon={Icons.ZoomFit} onClick={props.onZoomToFit} title="Fit View" />
                    <ControlButton icon={Icons.Background} onClick={props.onToggleWall} title="Toggle Wall" />

                    {/* ⭐ 修改点：根据状态切换图标 */}
                    <ControlButton
                        icon={props.isStraightened ? Icons.StraightenOn : Icons.StraightenOff}
                        onClick={props.onStraighten}
                        active={props.isStraightened}
                        title={props.isStraightened ? "Restore Random Rotation" : "Straighten All Notes"}
                    />

                    <ControlButton icon={Icons.Center} onClick={props.onCenter} title="Center View" />
                </div>
            </div>

            {/* 把手 */}
            <div
                className="bc-handle"
                onClick={() => setIsOpen(!isOpen)}
                title={isOpen ? "Close Toolbar" : "Open Toolbar"}
            >
                <div className="bc-handle-icon" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    <Icon path={Icons.ChevronDown} size={14} />
                </div>
            </div>

        </div>
    );
});

const ControlButton = ({ icon, onClick, active = false, highlight = false, isDanger = false, title }: any) => {
    let className = "bc-icon-btn";
    if (active) className += " is-active";
    if (highlight) className += " is-highlight";
    if (isDanger) className += " is-danger"; // 对应 CSS 中的红色样式

    return (
        <div
            className={className}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            title={title}
        >
            <Icon path={icon} size={16} />
        </div>
    );
};