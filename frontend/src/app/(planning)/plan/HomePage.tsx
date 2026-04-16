'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import LeftSidebar from '@/components/panels/LeftSidebar';
import { cn, formatDuration, formatRelativeTime } from '@/lib/utils';
import type {
  PipelineDefinition,
  DashboardStats,
  JobSummary,
  QueueHealth,
} from '@/types/pipeline';
import {
  Activity, CheckCircle, XCircle, AlertTriangle, Clock,
  GitBranch, Plus, MoreVertical, Copy, Archive,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------
function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ElementType; color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn('w-3.5 h-3.5', color ?? 'text-muted-foreground')} />
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-mono font-bold text-foreground">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dropdown Menu
// ---------------------------------------------------------------------------
function PipelineDropdown({ pipelineId, onDuplicate, onArchive }: {
  pipelineId: string;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className="p-1 rounded-md hover:bg-muted/50 transition-colors"
      >
        <MoreVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-card border border-border rounded-lg shadow-xl z-50 py-1">
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted/30 transition-colors"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDuplicate(pipelineId); setOpen(false); }}
          >
            <Copy className="w-3 h-3 text-muted-foreground" />
            복제
          </button>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted/30 transition-colors"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onArchive(pipelineId); setOpen(false); }}
          >
            <Archive className="w-3 h-3 text-muted-foreground" />
            아카이브
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function HomePage() {
  const service = usePipelineService();
  const pathname = usePathname();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [queues, setQueues] = useState<QueueHealth[]>([]);
  const [activeTab, setActiveTab] = useState<'pipelines' | 'jobs' | 'queues'>('pipelines');

  const consolePath = pathname.startsWith('/current') ? '/current/console' : '/plan/console';
  const jobsPath = pathname.startsWith('/current') ? '/current/jobs' : '/plan/jobs';
  const queuesPath = pathname.startsWith('/current') ? '/current/queues' : '/plan/queues';

  const loadData = useCallback(async () => {
    const [statsRes, plRes, jobsRes, queuesRes] = await Promise.all([
      service.대시보드_통계를_조회한다(),
      service.파이프라인_목록을_조회한다(),
      service.Job_목록을_조회한다({ limit: 20 }),
      service.큐_상태를_조회한다(),
    ]);
    if (statsRes.data) setStats(statsRes.data);
    if (plRes.data) setPipelines(plRes.data);
    if (jobsRes.data) setJobs(jobsRes.data.items);
    if (queuesRes.data) setQueues(queuesRes.data);
  }, [service]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 의존성이 변경될 때 비동기 데이터를 fetch하여 상태를 갱신하는 정규 패턴
    loadData();
  }, [loadData]);

  const handleDuplicate = useCallback(async (id: string) => {
    const res = await service.파이프라인을_복제한다(id);
    if (res.success && res.data) {
      setPipelines((prev) => [...prev, res.data!]);
    }
  }, [service]);

  const handleArchive = useCallback(async (id: string) => {
    const res = await service.파이프라인을_아카이브한다(id, true);
    if (res.success) {
      setPipelines((prev) => prev.filter((p) => p.id !== id));
    }
  }, [service]);

  const failureRate = stats
    ? stats.completedLast24h + stats.failedLast24h > 0
      ? Math.round((stats.failedLast24h / (stats.completedLast24h + stats.failedLast24h)) * 100)
      : 0
    : 0;

  const healthyQueues = queues.filter((q) => q.healthy).length;
  const totalQueues = queues.length;

  return (
    <div className="h-full flex">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        activePage="home"
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-4 border-b border-border bg-card shrink-0">
          <div>
            <h1 className="text-lg font-bold text-foreground">오버뷰</h1>
            <p className="text-xs text-muted-foreground mt-0.5">파이프라인과 작업 실행 현황을 확인합니다</p>
          </div>
          <a
            href={`${consolePath}?create=true`}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:brightness-110 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            새 파이프라인
          </a>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-8 py-6 space-y-6">
            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                <StatCard label="진행 중 작업" value={stats.inflightJobs} icon={Activity} color="text-accent" />
                <StatCard label="완료 (24h)" value={stats.completedLast24h} icon={CheckCircle} color="text-success" />
                <StatCard label="실패 (24h)" value={stats.failedLast24h} icon={XCircle} color="text-destructive" />
                <StatCard label="실패율" value={`${failureRate}%`} icon={AlertTriangle} color={failureRate > 10 ? 'text-destructive' : 'text-muted-foreground'} />
                <StatCard label="평균 처리 시간" value={formatDuration(stats.avgProcessingTimeMs)} icon={Clock} />
              </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-border">
              <TabButton active={activeTab === 'pipelines'} onClick={() => setActiveTab('pipelines')}>
                파이프라인
              </TabButton>
              <TabButton active={activeTab === 'jobs'} onClick={() => setActiveTab('jobs')}>
                실행 작업
              </TabButton>
              <TabButton active={activeTab === 'queues'} onClick={() => setActiveTab('queues')}>
                큐
              </TabButton>
            </div>

            {/* Pipelines tab */}
            {activeTab === 'pipelines' && (
              <div className="space-y-0">
                {pipelines.length === 0 ? (
                  <EmptyState text="등록된 파이프라인이 없습니다" />
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                    {pipelines.map((pl) => (
                      <div key={pl.id} className="flex items-center hover:bg-muted/30 transition-colors">
                        <a
                          href={`${consolePath}?pipelineId=${pl.id}`}
                          className="flex-1 flex items-center justify-between px-4 py-3 min-w-0"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <GitBranch className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-xs font-semibold text-foreground truncate">{pl.name}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                              <span>수정: {formatRelativeTime(pl.updatedAt)}</span>
                              <span className="text-border">|</span>
                              <span>생성: {new Date(pl.createdAt).toLocaleDateString('ko-KR')}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {pl.satelliteId} · {pl.mode}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {pl.steps.length} steps
                            </span>
                          </div>
                        </a>
                        <div className="pr-3 flex-shrink-0">
                          <PipelineDropdown
                            pipelineId={pl.id}
                            onDuplicate={handleDuplicate}
                            onArchive={handleArchive}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-end pt-3 text-[10px] text-muted-foreground">
                  Total {pipelines.length}
                </div>
              </div>
            )}

            {/* Jobs tab */}
            {activeTab === 'jobs' && (
              <div className="space-y-0">
                {jobs.length === 0 ? (
                  <EmptyState text="실행 기록이 없습니다" />
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                    {jobs.map((job) => (
                      <a
                        key={job.jobId}
                        href={`${jobsPath}?jobId=${job.jobId}`}
                        className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-semibold text-foreground">{job.jobId}</span>
                            <JobStatusBadge status={job.status} />
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                            <span>{job.sceneId}</span>
                            <span className="text-border">|</span>
                            <span>{formatRelativeTime(job.updatedAt)}</span>
                          </div>
                        </div>
                        {job.retryCount > 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/15 text-warning font-mono">
                            retry {job.retryCount}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-end pt-3 text-[10px] text-muted-foreground">
                  Total {jobs.length}
                </div>
              </div>
            )}

            {/* Queues tab */}
            {activeTab === 'queues' && (
              <div className="space-y-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">
                    {healthyQueues}/{totalQueues} healthy
                  </span>
                  <a href={queuesPath} className="text-xs text-accent hover:underline">
                    상세 모니터링 보기 →
                  </a>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {queues.map((q) => (
                    <div key={q.queue} className="bg-card border border-border rounded-lg px-3 py-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-mono font-medium text-foreground">
                          {q.queue.replace('sdpe.', '')}
                        </span>
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                          q.healthy ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
                        )}>
                          {q.healthy ? 'Healthy' : 'Unhealthy'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground" title="큐 적체량 — 대기 중인 메시지 수">Depth(적체량) <span className="font-mono font-bold text-foreground">{q.depth}</span></span>
                        <span className="text-muted-foreground">Consumers <span className="font-mono font-bold text-foreground">{q.consumers}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3.5 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
        active ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    CREATED: 'bg-muted text-muted-foreground',
    ASSIGNED: 'bg-accent/15 text-accent',
    COMPLETED: 'bg-success/15 text-success',
    FAILED: 'bg-destructive/15 text-destructive',
    CANCELED: 'bg-muted text-muted-foreground',
  };
  const labels: Record<string, string> = {
    CREATED: 'PENDING', ASSIGNED: 'RUNNING', COMPLETED: 'DONE', FAILED: 'FAILED', CANCELED: 'CANCELED',
  };
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', styles[status])}>
      {labels[status] ?? status}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="py-10 text-center text-xs text-muted-foreground">{text}</div>;
}
