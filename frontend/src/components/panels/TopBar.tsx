'use client';

import { cn } from '@/lib/utils';
import type { PipelineDefinition, QueueHealth } from '@/types/pipeline';
import { Activity, Circle } from 'lucide-react';

interface TopBarProps {
  pipeline: PipelineDefinition | null;
  queues: QueueHealth[];
}

export default function TopBar({ pipeline, queues }: TopBarProps) {
  const allHealthy = queues.length > 0 && queues.every((q) => q.healthy);

  return (
    <div className="h-10 bg-card/80 backdrop-blur-sm border-b border-border flex items-center justify-between px-4 flex-shrink-0 z-30">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-accent" />
        <span className="text-xs font-semibold text-foreground tracking-tight">SDPE Pipeline Console</span>
        {pipeline && (
          <>
            <span className="text-muted-foreground text-[11px]">/</span>
            <span className="text-[11px] text-foreground font-medium">{pipeline.name}</span>
            <span className="text-[10px] text-muted-foreground">
              {pipeline.satelliteId} · {pipeline.mode} · {pipeline.steps.length}단계
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[11px]">
        <Circle className={cn('w-2 h-2 fill-current', allHealthy ? 'text-success' : 'text-warning')} />
        <span className="text-muted-foreground">{allHealthy ? 'All Systems Healthy' : 'Degraded'}</span>
      </div>
    </div>
  );
}
