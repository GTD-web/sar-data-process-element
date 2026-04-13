'use client';

import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

export type BottomTab = 'jobs' | 'alerts' | 'audit' | 'queues';

interface BottomPanelProps {
  open: boolean;
  activeTab: BottomTab;
  onTabChange: (tab: BottomTab) => void;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
  jobCount?: number;
  alertCount?: number;
}

const TABS: { id: BottomTab; label: string }[] = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'audit', label: '감사 로그' },
  { id: 'queues', label: '큐 상태' },
];

export default function BottomPanel({
  open,
  activeTab,
  onTabChange,
  onToggle,
  onClose,
  children,
  jobCount,
  alertCount,
}: BottomPanelProps) {
  return (
    <div
      className={cn(
        'absolute bottom-0 left-0 right-0 bg-card border-t border-border shadow-2xl transition-all duration-200 z-10 flex flex-col',
        open ? 'h-[45%]' : 'h-9',
      )}
    >
      {/* Tab Bar */}
      <div className="flex items-center gap-0 border-b border-border flex-shrink-0 h-9">
        <div className="flex items-center gap-0 flex-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { onTabChange(tab.id); if (!open) onToggle(); }}
              className={cn(
                'px-3 h-9 text-xs font-medium border-b-2 transition-colors relative',
                activeTab === tab.id && open
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              {tab.id === 'jobs' && jobCount !== undefined && jobCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0 rounded-full text-[10px] bg-blue-500/20 text-blue-400">
                  {jobCount}
                </span>
              )}
              {tab.id === 'alerts' && alertCount !== undefined && alertCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0 rounded-full text-[10px] bg-red-500/20 text-red-400">
                  {alertCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 pr-2">
          <button onClick={onToggle} className="p-1 rounded hover:bg-muted/50 transition-colors">
            {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted/50 transition-colors">
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Content */}
      {open && (
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
}
