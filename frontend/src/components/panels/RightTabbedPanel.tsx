'use client';

import { cn } from '@/lib/utils';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

export type RightTab = 'console' | 'queues' | 'audit';

interface RightTabbedPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  activeTab: RightTab;
  onTabChange: (tab: RightTab) => void;
  /** 외부에서 토글 버튼을 제공할 때 내장 버튼 숨김 (기본: true) */
  showCollapsedToggle?: boolean;
  /** 탭 라벨 오버라이드 (예: { console: '노드 추가' }) */
  tabLabelOverrides?: Partial<Record<RightTab, string>>;
  children: React.ReactNode;
}

const TABS: { id: RightTab; label: string }[] = [
  { id: 'console', label: '콘솔' },
  { id: 'queues', label: '큐' },
  { id: 'audit', label: '감사' },
];

export default function RightTabbedPanel({
  collapsed,
  onToggle,
  activeTab,
  onTabChange,
  showCollapsedToggle = true,
  tabLabelOverrides,
  children,
}: RightTabbedPanelProps) {
  return (
    <>
      {/* Collapsed toggle button — floats on the canvas edge */}
      {collapsed && showCollapsedToggle && (
        <button
          onClick={onToggle}
          className="absolute right-3 top-3 z-30 p-1.5 rounded-md bg-card/80 backdrop-blur-sm border border-border hover:bg-muted/50 transition-colors"
          title="패널 열기"
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
            : activeTab === 'audit'
              ? 'w-[750px] min-w-[750px] opacity-100'
              : 'w-[420px] min-w-[420px] opacity-100',
        )}
      >
        {/* Tabs */}
        <div className="flex items-center border-b border-border flex-shrink-0 h-11">
          <button onClick={onToggle} className="px-2.5 h-full flex items-center border-r border-border hover:bg-muted/30 transition-colors flex-shrink-0" title="패널 닫기">
            <PanelRightClose className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <div className="flex items-center flex-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'flex-1 h-11 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap',
                  activeTab === tab.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tabLabelOverrides?.[tab.id] ?? tab.label}
              </button>
            ))}
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
