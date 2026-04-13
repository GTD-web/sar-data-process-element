'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePipelineService } from '@/services/usePipelineService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { JobStatusBadge, AlertKindBadge } from '@/components/ui/StatusBadge';
import { formatDuration } from '@/lib/utils';
import type { DashboardStats, QueueHealth, Alert, JobSummary } from '@/types/pipeline';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

export default function DashboardPage() {
  const service = usePipelineService();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [queues, setQueues] = useState<QueueHealth[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [recentJobs, setRecentJobs] = useState<JobSummary[]>([]);

  useEffect(() => {
    service.대시보드_통계를_조회한다().then((r) => r.data && setStats(r.data));
    service.큐_상태를_조회한다().then((r) => r.data && setQueues(r.data));
    service.Alert_목록을_조회한다({ acknowledged: false }).then((r) => r.data && setAlerts(r.data.slice(0, 5)));
    service.Job_목록을_조회한다({ limit: 8 }).then((r) => r.data && setRecentJobs(r.data.items));
  }, [service]);

  if (!stats) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">대시보드</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Activity} label="진행 중 Jobs" value={stats.inflightJobs} color="text-blue-400" />
        <StatCard icon={CheckCircle} label="완료 (24h)" value={stats.completedLast24h} color="text-emerald-400" />
        <StatCard icon={XCircle} label="실패 (24h)" value={stats.failedLast24h} color="text-red-400" />
        <StatCard icon={Clock} label="평균 처리 시간" value={formatDuration(stats.avgProcessingTimeMs)} color="text-amber-400" />
        <StatCard icon={AlertTriangle} label="미확인 Alert" value={stats.unacknowledgedAlerts} color="text-orange-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Queue Depth */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>큐 상태</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {queues.map((q) => (
              <QueueBar key={q.queue} queue={q} maxDepth={Math.max(...queues.map((x) => x.depth), 1)} />
            ))}
          </CardContent>
        </Card>

        {/* Recent Jobs */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>최근 Jobs</CardTitle>
            <Link href="/jobs" className="text-xs text-accent hover:underline flex items-center gap-1">
              전체 보기 <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recentJobs.map((job) => (
                <Link
                  key={job.jobId}
                  href={`/jobs/${job.jobId}`}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-foreground truncate">{job.jobId}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{job.sceneId}</div>
                  </div>
                  <JobStatusBadge status={job.status} retryCount={job.retryCount} />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Unacknowledged Alerts */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>미확인 Alerts</CardTitle>
            <Link href="/alerts" className="text-xs text-accent hover:underline flex items-center gap-1">
              전체 보기 <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {alerts.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                미확인 Alert이 없습니다
              </div>
            ) : (
              <div className="divide-y divide-border">
                {alerts.map((alert) => (
                  <div key={alert.id} className="px-4 py-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <AlertKindBadge kind={alert.kind} />
                      <span className="text-[11px] text-muted-foreground font-mono">{alert.jobId}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        <div className={`p-2 rounded-lg bg-muted/50 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold text-foreground">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function QueueBar({ queue, maxDepth }: { queue: QueueHealth; maxDepth: number }) {
  const pct = Math.round((queue.depth / maxDepth) * 100);
  const shortName = queue.queue.replace('sdpe.', '');
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground truncate">{shortName}</span>
        <span className="font-mono text-foreground">{queue.depth}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${queue.healthy ? 'bg-accent' : 'bg-warning'}`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-6 w-24 bg-muted rounded animate-pulse" />
      <div className="grid grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-card border border-border rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-64 bg-card border border-border rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  );
}
