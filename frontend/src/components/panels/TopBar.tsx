'use client';

import { cn } from '@/lib/utils';
import type { QueueHealth } from '@/types/pipeline';
import { Circle } from 'lucide-react';

interface TopBarProps {
  queues: QueueHealth[];
}

export default function TopBar({ queues }: TopBarProps) {
  const allHealthy = queues.length > 0 && queues.every((q) => q.healthy);

  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/80 backdrop-blur-sm border border-border text-[11px]">
      <Circle className={cn('w-2 h-2 fill-current', allHealthy ? 'text-success' : 'text-warning')} />
      <span className="text-muted-foreground">{allHealthy ? 'Healthy' : 'Degraded'}</span>
    </div>
  );
}
