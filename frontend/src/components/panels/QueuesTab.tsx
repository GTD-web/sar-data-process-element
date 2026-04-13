'use client';

import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils';
import type { QueueHealth } from '@/types/pipeline';

interface QueuesTabProps {
  queues: QueueHealth[];
}

export default function QueuesTab({ queues }: QueuesTabProps) {
  return (
    <div className="p-3 space-y-2">
      {queues.map((q) => (
        <div key={q.queue} className="bg-muted/30 rounded-lg px-3 py-2.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono text-foreground">{q.queue.replace('sdpe.', '')}</span>
            <span className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium',
              q.healthy ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
            )}>
              {q.healthy ? 'Healthy' : 'Unhealthy'}
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <div>
              <span className="text-muted-foreground">Depth </span>
              <span className="font-mono font-semibold text-foreground">{q.depth}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Consumers </span>
              <span className="font-mono font-semibold text-foreground">{q.consumers}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Oldest </span>
              <span className="font-mono font-semibold text-foreground">
                {q.oldestMessageAge > 0 ? formatDuration(q.oldestMessageAge * 1000) : '—'}
              </span>
            </div>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden mt-2">
            <div
              className={cn('h-full rounded-full', q.depth > 10 ? 'bg-warning' : 'bg-accent')}
              style={{ width: `${Math.min((q.depth / 20) * 100, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
