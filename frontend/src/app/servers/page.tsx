'use client';

import { useEffect, useState } from 'react';
import { usePipelineService } from '@/services/usePipelineService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatDuration } from '@/lib/utils';
import type { QueueHealth } from '@/types/pipeline';
import { Activity, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

export default function ServersPage() {
  const service = usePipelineService();
  const [queues, setQueues] = useState<QueueHealth[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await service.큐_상태를_조회한다();
    if (res.data) setQueues(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const healthy = queues.filter((q) => q.healthy).length;
  const unhealthy = queues.filter((q) => !q.healthy).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">서버 / 큐 헬스</h1>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/50 text-muted-foreground text-xs hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="p-2 rounded-lg bg-muted/50 text-blue-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">전체 큐</div>
              <div className="text-lg font-semibold">{queues.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="p-2 rounded-lg bg-muted/50 text-emerald-400">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">정상</div>
              <div className="text-lg font-semibold text-emerald-400">{healthy}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="p-2 rounded-lg bg-muted/50 text-warning">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">비정상</div>
              <div className="text-lg font-semibold text-warning">{unhealthy}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Queue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading
          ? Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-36 bg-card border border-border rounded-lg animate-pulse" />
            ))
          : queues.map((q) => <QueueCard key={q.queue} queue={q} />)}
      </div>
    </div>
  );
}

function QueueCard({ queue }: { queue: QueueHealth }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-2.5">
        <CardTitle className="font-mono text-xs">{queue.queue.replace('sdpe.', '')}</CardTitle>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
            queue.healthy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}
        >
          {queue.healthy ? 'Healthy' : 'Unhealthy'}
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-semibold font-mono">{queue.depth}</div>
            <div className="text-[10px] text-muted-foreground">Depth</div>
          </div>
          <div>
            <div className="text-lg font-semibold font-mono">{queue.consumers}</div>
            <div className="text-[10px] text-muted-foreground">Consumers</div>
          </div>
          <div>
            <div className="text-lg font-semibold font-mono">
              {queue.oldestMessageAge > 0 ? formatDuration(queue.oldestMessageAge * 1000) : '—'}
            </div>
            <div className="text-[10px] text-muted-foreground">Oldest</div>
          </div>
        </div>

        {/* Depth bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${queue.depth > 10 ? 'bg-warning' : 'bg-accent'}`}
            style={{ width: `${Math.min((queue.depth / 20) * 100, 100)}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
