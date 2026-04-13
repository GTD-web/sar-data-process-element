'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { usePipelineService } from '@/services/usePipelineService';
import { Bell, Circle, User } from 'lucide-react';
import type { QueueHealth } from '@/types/pipeline';

export default function Header() {
  const service = usePipelineService();
  const [queues, setQueues] = useState<QueueHealth[]>([]);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    service.큐_상태를_조회한다().then((res) => {
      if (res.data) setQueues(res.data);
    });
    service.Alert_목록을_조회한다({ acknowledged: false }).then((res) => {
      if (res.data) setAlertCount(res.data.length);
    });
  }, [service]);

  const allHealthy = queues.length > 0 && queues.every((q) => q.healthy);

  return (
    <header className="h-14 flex-shrink-0 bg-card border-b border-border flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs">
          <Circle
            className={cn(
              'w-2.5 h-2.5 fill-current',
              allHealthy ? 'text-success' : 'text-warning',
            )}
          />
          <span className="text-muted-foreground">
            {allHealthy ? 'All Systems Healthy' : 'Degraded'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Alert badge */}
        <button className="relative p-1.5 rounded-md hover:bg-muted/50 transition-colors">
          <Bell className="w-4.5 h-4.5 text-muted-foreground" />
          {alertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-[10px] text-white flex items-center justify-center font-medium">
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </button>

        {/* User */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="w-4 h-4" />
          <span>operator-01</span>
        </div>
      </div>
    </header>
  );
}
