'use client';

import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type RightTab = 'console' | 'jobs' | 'alerts' | 'queues' | 'audit';

interface RightTabbedPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  activeTab: RightTab;
  onTabChange: (tab: RightTab) => void;
  alertCount: number;
  jobCount: number;
  children: React.ReactNode;
}

const TABS: { id: RightTab; label: string }[] = [
  { id: 'console', label: '콘솔' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'queues', label: '큐' },
  { id: 'audit', label: '감사' },
];

export default function RightTabbedPanel({
  collapsed,
  onToggle,
  activeTab,
  onTabChange,
  alertCount,
  jobCount,
  children,
}: RightTabbedPanelProps) {
  return (
    <div
      className={cn(
        'h-full bg-card border-l border-border flex flex-col transition-all duration-200 flex-shrink-0 z-20 relative',
        collapsed ? 'w-0 border-l-0 overflow-hidden' : 'w-[420px] min-w-[420px]',
      )}
    >
      {!collapsed && (
        <>
          {/* Tabs */}
          <div className="flex items-center border-b border-border flex-shrink-0 h-10">
            <button onClick={onToggle} className="px-2 h-full flex items-center border-r border-border hover:bg-muted/30 transition-colors flex-shrink-0">
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            </button>
            <div className="flex items-center flex-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    'flex-1 h-10 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap',
                    activeTab === tab.id
                      ? 'border-accent text-accent'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                  {tab.id === 'alerts' && alertCount > 0 && (
                    <span className="ml-1 px-1 rounded-full text-[9px] bg-red-500/20 text-red-400">{alertCount}</span>
                  )}
                  {tab.id === 'jobs' && jobCount > 0 && (
                    <span className="ml-1 px-1 rounded-full text-[9px] bg-blue-500/20 text-blue-400">{jobCount}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {children}
          </div>
        </>
      )}

      {/* Collapsed toggle */}
      {collapsed && (
        <button
          onClick={onToggle}
          className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-12 bg-card border border-border rounded-l-md flex items-center justify-center hover:bg-muted/50 transition-colors z-30"
        >
          <ChevronLeft className="w-3 h-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
