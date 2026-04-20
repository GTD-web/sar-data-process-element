'use client';

import { useEffect, useState } from 'react';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import LeftSidebar from '@/components/panels/LeftSidebar';
import QueueDetailPanel from '@/components/panels/QueueDetailPanel';
import type { QueueHealth, QueueDepthPoint } from '@/types/pipeline';
import { cn } from '@/lib/utils';
import { Activity, Skull, AlertTriangle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Mini Sparkline (list card용)
// ---------------------------------------------------------------------------
function Sparkline({ data }: { data: QueueDepthPoint[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data.map((d) => d.depth), 1);
  const w = 60;
  const h = 20;
  const pad = 1;

  const points = data
    .map((d, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = h - pad - (d.depth / max) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Queue List Item (compact)
// ---------------------------------------------------------------------------
function QueueListItem({ q, selected, onSelect }: { q: QueueHealth; selected: boolean; onSelect: () => void }) {
  const shortName = q.queue.replace('sdpe.', '');
  const hasDead = q.deadLetters.length > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left rounded-lg px-3 py-2.5 transition-all',
        selected ? 'bg-accent/10 ring-1 ring-accent/40' : 'hover:bg-muted/40',
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono font-medium text-foreground">{shortName}</span>
        <div className="flex items-center gap-1.5">
          {hasDead && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[9px] font-medium bg-destructive/15 text-destructive">
              <Skull className="w-2.5 h-2.5" />
              {q.deadLetters.length}
            </span>
          )}
          <span className={cn('w-2 h-2 rounded-full', q.healthy ? 'bg-success' : 'bg-destructive')} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span title="Depth — 큐 적체량 (대기 중인 메시지 수)">
            D:<span className="font-mono font-semibold text-foreground ml-0.5">{q.depth}</span>
          </span>
          <span title="Consumers — 처리 워커 수">
            C:<span className="font-mono font-semibold text-foreground ml-0.5">{q.consumers}</span>
          </span>
        </div>
        <Sparkline data={q.depthHistory} />
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function QueueDashboardPage() {
  const service = usePipelineService();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [queues, setQueues] = useState<QueueHealth[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const qRes = await service.큐_상태를_조회한다();
      if (qRes.data) {
        setQueues(qRes.data);
        if (qRes.data.length > 0) setSelectedQueue(qRes.data[0]!.queue);
      }
    })();
  }, [service]);

  const selectedQ = queues.find((q) => q.queue === selectedQueue) ?? null;
  const totalDepth = queues.reduce((sum, q) => sum + q.depth, 0);
  const totalDead = queues.reduce((sum, q) => sum + q.deadLetters.length, 0);
  const unhealthyCount = queues.filter((q) => !q.healthy).length;

  return (
    <div className="h-full flex">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        activePage="queues"
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Queue list with summary */}
        <div className="w-1/3 min-w-60 max-w-90 border-r border-border flex flex-col overflow-hidden">
          {/* Summary stats */}
          <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border shrink-0 text-[11px]">
            <div className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">대기</span>
              <span className="font-mono font-bold text-foreground">{totalDepth}</span>
            </div>
            {totalDead > 0 && (
              <div className="flex items-center gap-1">
                <Skull className="w-3 h-3 text-destructive" />
                <span className="font-mono font-bold text-destructive">{totalDead}</span>
              </div>
            )}
            {unhealthyCount > 0 && (
              <div className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-warning" />
                <span className="font-mono font-bold text-warning">{unhealthyCount}</span>
              </div>
            )}
          </div>
          {/* Queue items */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {queues.map((q) => (
              <QueueListItem
                key={q.queue}
                q={q}
                selected={selectedQueue === q.queue}
                onSelect={() => setSelectedQueue(q.queue)}
              />
            ))}
          </div>
        </div>

        {/* Right: Detail */}
        <div className="flex-1 overflow-hidden">
          {selectedQ ? (
            <QueueDetailPanel queue={selectedQ} onClose={() => setSelectedQueue(null)} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">큐를 선택하세요</div>
          )}
        </div>
      </div>
    </div>
  );
}
