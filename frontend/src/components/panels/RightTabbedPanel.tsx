'use client';

import { cn } from '@/lib/utils';
import { PanelRightOpen, X } from 'lucide-react';

interface RightTabbedPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  /** 외부에서 토글 버튼을 제공할 때 내장 버튼 숨김 (기본: true) */
  showCollapsedToggle?: boolean;
  /** 패널 제목 오버라이드 (기본: '콘솔') */
  title?: string;
  children: React.ReactNode;
}

export default function RightTabbedPanel({
  collapsed,
  onToggle,
  showCollapsedToggle = true,
  title = 'Console',
  children,
}: RightTabbedPanelProps) {
  return (
    <>
      {/* Collapsed toggle button — floats on the canvas edge */}
      {collapsed && showCollapsedToggle && (
        <button
          onClick={onToggle}
          className="absolute right-3 top-3 z-30 p-1.5 rounded-md bg-card/80 backdrop-blur-sm border border-border hover:bg-muted/50 transition-colors"
          title="Open panel"
        >
          <PanelRightOpen className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

      {/* Panel */}
      <div
        className={cn(
          'h-full bg-card border-l border-border flex flex-col flex-shrink-0 z-20 transition-all duration-300 ease-in-out',
          collapsed
            ? 'w-0 min-w-0 border-l-0 opacity-0 overflow-hidden'
            : 'w-[420px] min-w-[420px] opacity-100',
        )}
      >
        {/* Header */}
        <div className="flex items-center border-b border-border flex-shrink-0 h-11">
          <button onClick={onToggle} className="px-2.5 h-full flex items-center border-r border-border hover:bg-muted/30 transition-colors flex-shrink-0" title="Close">
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <div className="flex items-center flex-1 px-3">
            <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </div>
    </>
  );
}
