'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import LeftSidebar from '@/components/panels/LeftSidebar';
import { useMockRole } from '@/components/auth/RolePreviewSelect';
import { cn, formatRelativeTime } from '@/lib/utils';
import type {
  JobDetail,
  JobStatus,
  JobSummary,
  PipelineDefinition,
  PipelineStepDefinition,
} from '@/types/pipeline';
import {
  CSC_LABELS,
  PRODUCT_LEVEL_LABELS,
  SAR_STAGE_LABELS,
  SAR_STAGE_TO_CSC,
  SAR_STAGE_TO_LEVEL,
} from '@/types/pipeline';
import {
  Activity,
  Antenna,
  AlertTriangle,
  Compass,
  Cpu,
  Crosshair,
  Database,
  FileInput,
  Filter,
  GitBranch,
  HardDrive,
  Image as ImageIcon,
  Layers,
  Map,
  Package,
  ShieldCheck,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';

type NodeMetric = {
  order: number;
  label: string;
  target: string;
  running: number;
  failed: number;
  completed: number;
  pending: number;
  total: number;
  quality: 'normal' | 'running' | 'pending' | 'critical' | 'idle';
};

type PipelineMetric = {
  pipeline: PipelineDefinition;
  jobs: JobDetail[];
  runningJobs: number;
  failedJobs: number;
  completedJobs: number;
  latestJob?: JobDetail;
  nodeMetrics: NodeMetric[];
};

const ACTIVE_JOB_STATUS: JobStatus[] = ['CREATED', 'ASSIGNED'];
const MATRIX_LABEL_COLUMN_WIDTH = 92;
const DASHBOARD_FILTER_STORAGE_PREFIX = 'sdpe.dashboard.pipelineFilter';

const COMPACT_NODE_LABELS = {
  TRIGGER: 'Receive Raw Data',
  FILE_INPUT: 'Import Product',
  JOB_INIT: 'Initialize Job',
  CATALOG: 'Enroll Catalog',
  THUMBNAIL: 'Generate Quick-look',
} as const;
const COMPACT_KIND_LABELS: Partial<Record<PipelineStepDefinition['kind'], string>> = {
  TRIGGER: COMPACT_NODE_LABELS.TRIGGER,
  FILE_INPUT: COMPACT_NODE_LABELS.FILE_INPUT,
  JOB_INIT: COMPACT_NODE_LABELS.JOB_INIT,
  CATALOG: COMPACT_NODE_LABELS.CATALOG,
  THUMBNAIL: COMPACT_NODE_LABELS.THUMBNAIL,
};

export default function HomePage() {
  const service = usePipelineService();
  const pathname = usePathname();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [jobs, setJobs] = useState<JobDetail[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'custom'>('all');
  const [selectedPipelineIds, setSelectedPipelineIds] = useState<string[]>([]);
  const [mockRole] = useMockRole();

  const basePath = pathname.startsWith('/current') ? '/current' : '/plan';
  const currentUsername = mockRole === 'Administrator' ? 'admin' : 'operator-01';
  const filterStorageKey = `${DASHBOARD_FILTER_STORAGE_PREFIX}.${currentUsername}`;

  const loadData = useCallback(async () => {
    const [pipelineRes, jobRes] = await Promise.all([
      service.파이프라인_목록을_조회한다(),
      service.Job_목록을_조회한다({ limit: 80 }),
    ]);

    if (pipelineRes.data) setPipelines(pipelineRes.data);

    const summaries = jobRes.data?.items ?? [];
    const details = await Promise.all(
      summaries.map(async (job) => {
        const detailRes = await service.Job_상세를_조회한다(job.jobId);
        return detailRes.data ?? summaryToDetail(job);
      }),
    );
    setJobs(details);
  }, [service]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 화면 진입 시 서비스 데이터를 조회해 대시보드 상태를 구성한다.
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(filterStorageKey);
    if (!raw) {
      setFilterMode('all');
      setSelectedPipelineIds([]);
      return;
    }
    try {
      const saved = JSON.parse(raw) as { mode?: 'all' | 'custom'; pipelineIds?: string[] };
      setFilterMode(saved.mode === 'custom' ? 'custom' : 'all');
      setSelectedPipelineIds(Array.isArray(saved.pipelineIds) ? saved.pipelineIds.filter((id) => typeof id === 'string') : []);
    } catch {
      setFilterMode('all');
      setSelectedPipelineIds([]);
    }
  }, [filterStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(filterStorageKey, JSON.stringify({ mode: filterMode, pipelineIds: selectedPipelineIds }));
  }, [filterMode, filterStorageKey, selectedPipelineIds]);

  const visiblePipelines = useMemo(() => {
    if (filterMode === 'all') return pipelines;
    const selected = new Set(selectedPipelineIds);
    return pipelines.filter((pipeline) => selected.has(pipeline.id));
  }, [filterMode, pipelines, selectedPipelineIds]);

  const allDashboard = useMemo(() => buildPipelineMetrics(pipelines, jobs), [pipelines, jobs]);
  const dashboard = useMemo(() => buildPipelineMetrics(visiblePipelines, jobs), [visiblePipelines, jobs]);
  const executedPipelines = allDashboard.filter((item) => item.jobs.length > 0);
  const totalRunning = allDashboard.reduce((sum, item) => sum + item.runningJobs, 0);
  const totalFailed = allDashboard.reduce((sum, item) => sum + item.failedJobs, 0);
  const failedNodes = allDashboard.reduce(
    (sum, item) => sum + item.nodeMetrics.reduce((nodeSum, node) => nodeSum + node.failed, 0),
    0,
  );
  const selectedPipelineSet = useMemo(() => new Set(selectedPipelineIds), [selectedPipelineIds]);
  const filterSummary = filterMode === 'all'
    ? `전체 ${pipelines.length}개`
    : `선택 ${visiblePipelines.length}/${pipelines.length}개`;

  const handleFilterModeChange = useCallback((mode: 'all' | 'custom') => {
    setFilterMode(mode);
    if (mode === 'custom' && selectedPipelineIds.length === 0) {
      setSelectedPipelineIds(pipelines.map((pipeline) => pipeline.id));
    }
  }, [pipelines, selectedPipelineIds.length]);

  const handlePipelineFilterToggle = useCallback((pipelineId: string) => {
    setSelectedPipelineIds((prev) => (
      prev.includes(pipelineId)
        ? prev.filter((id) => id !== pipelineId)
        : [...prev, pipelineId]
    ));
  }, []);

  const handleSelectAllPipelines = useCallback(() => {
    setFilterMode('custom');
    setSelectedPipelineIds(pipelines.map((pipeline) => pipeline.id));
  }, [pipelines]);

  const handleClearPipelineSelection = useCallback(() => {
    setFilterMode('custom');
    setSelectedPipelineIds([]);
  }, []);

  return (
    <div className="h-full flex">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        activePage="home"
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="shrink-0 border-b border-border bg-card px-8 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                <ShieldCheck className="h-3.5 w-3.5" />
                Quality Operations
              </div>
              <h1 className="text-xl font-bold text-foreground">대시보드</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                실행된 파이프라인과 노드별 실행 중·실패 현황을 한 화면에서 확인합니다
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiCard label="실행 파이프라인" value={executedPipelines.length} icon={GitBranch} tone="accent" />
              <KpiCard label="실행 중 Job" value={totalRunning} icon={Activity} tone="accent" />
              <KpiCard label="실패 Job" value={totalFailed} icon={XCircle} tone={totalFailed > 0 ? 'danger' : 'muted'} />
              <KpiCard label="노드 실패" value={failedNodes} icon={AlertTriangle} tone={failedNodes > 0 ? 'danger' : 'muted'} />
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto bg-background px-8 py-6">
          <section>
            <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">품질 현황 매트릭스</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {currentUsername} 사용자 필터 기준으로 파이프라인별 노드 상태를 집계합니다
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 xl:items-end">
                <PipelineFilterPanel
                  pipelines={pipelines}
                  filterMode={filterMode}
                  selectedPipelineIds={selectedPipelineSet}
                  filterSummary={filterSummary}
                  username={currentUsername}
                  onModeChange={handleFilterModeChange}
                  onTogglePipeline={handlePipelineFilterToggle}
                  onSelectAll={handleSelectAllPipelines}
                  onClear={handleClearPipelineSelection}
                />
              </div>
            </div>

            {dashboard.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-12 text-center text-xs text-muted-foreground">
                선택된 파이프라인이 없습니다
              </div>
            ) : (
              <div className="space-y-4">
                {dashboard.map((item) => (
                  <PipelineQualityCard key={item.pipeline.id} item={item} basePath={basePath} />
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function buildPipelineMetrics(pipelines: PipelineDefinition[], jobs: JobDetail[]): PipelineMetric[] {
  return pipelines.map((pipeline) => {
    const pipelineJobs = jobs
      .filter((job) => job.pipelineId === pipeline.id)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return {
      pipeline,
      jobs: pipelineJobs,
      runningJobs: pipelineJobs.filter((job) => ACTIVE_JOB_STATUS.includes(job.status)).length,
      failedJobs: pipelineJobs.filter((job) => job.status === 'FAILED').length,
      completedJobs: pipelineJobs.filter((job) => job.status === 'COMPLETED').length,
      latestJob: pipelineJobs[0],
      nodeMetrics: pipeline.steps.map((step) => buildNodeMetric(step, pipelineJobs)),
    };
  });
}

function buildNodeMetric(step: PipelineStepDefinition, jobs: JobDetail[]): NodeMetric {
  const stepRuns = jobs.map((job) => job.steps.find((s) => s.order === step.order)).filter(Boolean);
  const running = stepRuns.filter((s) => s?.status === 'RUNNING').length;
  const failed = stepRuns.filter((s) => s?.status === 'FAILED').length;
  const completed = stepRuns.filter((s) => s?.status === 'COMPLETED').length;
  const pending = stepRuns.filter((s) => s?.status === 'PENDING').length;
  const quality: NodeMetric['quality'] =
    stepRuns.length === 0 ? 'idle' : failed > 0 ? 'critical' : running > 0 ? 'running' : pending > 0 ? 'pending' : 'normal';

  return {
    order: step.order,
    label: getStepLabel(step),
    target: getStepTarget(step),
    running,
    failed,
    completed,
    pending,
    total: stepRuns.length,
    quality,
  };
}

function getStepLabel(step: PipelineStepDefinition): string {
  if (step.kind === 'SAR' && step.sarStage) return SAR_STAGE_LABELS[step.sarStage];
  if (step.kind === 'FILE_INPUT' && step.inputLevel) return `Import ${PRODUCT_LEVEL_LABELS[step.inputLevel]} Product`;
  return COMPACT_KIND_LABELS[step.kind] ?? step.kind;
}

function getStepTarget(step: PipelineStepDefinition): string {
  const csc = step.kind === 'SAR' && step.sarStage
    ? SAR_STAGE_TO_CSC[step.sarStage]
    : step.kind === 'TRIGGER' || step.kind === 'FILE_INPUT'
      ? 'CSC-02'
      : step.kind === 'JOB_INIT'
        ? 'CSC-08'
        : 'CSC-07';
  const level = step.kind === 'SAR' && step.sarStage
    ? PRODUCT_LEVEL_LABELS[SAR_STAGE_TO_LEVEL[step.sarStage]]
    : step.inputLevel
      ? PRODUCT_LEVEL_LABELS[step.inputLevel]
      : '';
  return `${csc} ${level}`.trim();
}

function getNodeIcon(node: NodeMetric): React.ElementType {
  if (node.label === 'Raw' && node.target.startsWith('CSC-02')) return Antenna;
  if (node.label.endsWith('Input')) return FileInput;
  if (node.label === 'Init') return SlidersHorizontal;
  if (node.label === 'Catalog') return Database;
  if (node.label === 'Quicklook') return ImageIcon;
  if (node.label.startsWith('L0')) return HardDrive;
  if (node.label.startsWith('L1A')) return Cpu;
  if (node.label.startsWith('L1B')) return Layers;
  if (node.label.startsWith('L1C')) return Compass;
  if (node.label.startsWith('L2A')) return Map;
  if (node.label.startsWith('L2B')) return Crosshair;
  if (node.label.startsWith('L3')) return Package;
  return HardDrive;
}

function summaryToDetail(job: JobSummary): JobDetail {
  return {
    ...job,
    steps: [],
    acquisitionStart: job.startedAt,
    acquisitionEnd: job.updatedAt,
    receivedAt: job.startedAt,
    satelliteId: '-',
    mode: '-',
    rawDataPath: '',
  };
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone: 'accent' | 'danger' | 'muted';
}) {
  const toneClass = {
    accent: 'text-accent bg-accent/10',
    danger: 'text-destructive bg-destructive/10',
    muted: 'text-muted-foreground bg-muted/40',
  }[tone];

  return (
    <div className="min-w-32 rounded-lg border border-border bg-background/45 px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        <span className={cn('rounded-md p-1', toneClass)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="font-mono text-lg font-bold text-foreground">{value}</div>
        <div className="pb-0.5 text-[9px] font-medium text-muted-foreground/75">전체 기준</div>
      </div>
    </div>
  );
}

function PipelineFilterPanel({
  pipelines,
  filterMode,
  selectedPipelineIds,
  filterSummary,
  username,
  onModeChange,
  onTogglePipeline,
  onSelectAll,
  onClear,
}: {
  pipelines: PipelineDefinition[];
  filterMode: 'all' | 'custom';
  selectedPipelineIds: Set<string>;
  filterSummary: string;
  username: string;
  onModeChange: (mode: 'all' | 'custom') => void;
  onTogglePipeline: (pipelineId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative z-20 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/30"
          aria-expanded={open}
        >
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          Pipeline filter
          <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
            {filterSummary}
          </span>
        </button>
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onModeChange('all')}
            className={cn(
              'rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors',
              filterMode === 'all'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground',
            )}
          >
            전체 보기
          </button>
          <button
            type="button"
            onClick={() => onModeChange('custom')}
            className={cn(
              'rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors',
              filterMode === 'custom'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground',
            )}
          >
            선택 보기
          </button>
        </div>
      </div>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(520px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-foreground">Visible pipelines</div>
              <div className="truncate text-[10px] text-muted-foreground">
                Saved for {username}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={onSelectAll}
                className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
              >
                모두 선택
              </button>
              <button
                type="button"
                onClick={onClear}
                className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
              >
                선택 해제
              </button>
            </div>
          </div>

          <div className={cn(
            'grid max-h-72 gap-1 overflow-y-auto p-2 sm:grid-cols-2',
            filterMode === 'all' && 'opacity-55',
          )}>
            {pipelines.map((pipeline) => {
              const checked = filterMode === 'all' || selectedPipelineIds.has(pipeline.id);
              return (
                <label
                  key={pipeline.id}
                  className={cn(
                    'flex min-w-0 cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 transition-colors',
                    checked
                      ? 'border-accent/40 bg-accent/5'
                      : 'border-border bg-background/35 hover:bg-muted/25',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={filterMode === 'all'}
                    onChange={() => onTogglePipeline(pipeline.id)}
                    className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)] disabled:opacity-50"
                    aria-label={`${pipeline.name} 표시 여부`}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-semibold text-foreground">{pipeline.name}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                      {pipeline.satelliteId} · {pipeline.mode}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineQualityCard({ item, basePath }: { item: PipelineMetric; basePath: string }) {
  const hasFailure = item.failedJobs > 0 || item.nodeMetrics.some((node) => node.failed > 0);
  const runningLabel = `${item.runningJobs} 실행 중`;
  const failureLabel = `${item.failedJobs} 실패`;
  const nodeGridStyle = {
    gridTemplateColumns: `repeat(${Math.max(item.nodeMetrics.length, 1)}, minmax(116px, 1fr))`,
  };
  const matrixGridStyle = {
    gridTemplateColumns: `${MATRIX_LABEL_COLUMN_WIDTH}px repeat(${Math.max(item.nodeMetrics.length, 1)}, minmax(116px, 1fr))`,
  };

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
            <a
              href={`${basePath}/console?pipelineId=${item.pipeline.id}`}
              className="truncate text-sm font-semibold text-foreground hover:text-accent"
            >
              {item.pipeline.name}
            </a>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium',
              hasFailure ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success',
            )}>
              {hasFailure ? '주의' : '정상'}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span>{item.pipeline.satelliteId} · {item.pipeline.mode}</span>
            <span>{item.jobs.length}회 실행</span>
            <span>{runningLabel}</span>
            <span>{failureLabel}</span>
            {item.latestJob && <span>최근 {formatRelativeTime(item.latestJob.updatedAt)}</span>}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[760px] px-4 py-4">
          <div className="grid items-start gap-0" style={matrixGridStyle}>
            <div aria-hidden="true" />
            <div className="grid items-start" style={{ ...nodeGridStyle, gridColumn: '2 / -1' }}>
              {item.nodeMetrics.map((node, index) => (
                <PipelineNodeColumn
                  key={`flow-${node.order}`}
                  node={node}
                  first={index === 0}
                  last={index === item.nodeMetrics.length - 1}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <div className="grid bg-muted/25" style={matrixGridStyle}>
              <div className="border-r border-border px-3 py-2">
                <div className="font-mono text-[10px] font-bold text-foreground">STATUS</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">count</div>
              </div>
              {item.nodeMetrics.map((node) => (
                <div
                  key={`head-${node.order}`}
                  className="border-r border-border px-3 py-2 last:border-r-0"
                >
                  <div className="font-mono text-[10px] font-bold text-foreground">노드 {node.order}</div>
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={node.label}>
                    {node.target}
                  </div>
                </div>
              ))}
            </div>

            <MetricMatrixRow label="Running" tone="accent" values={item.nodeMetrics.map((node) => node.running)} gridStyle={matrixGridStyle} />
            <MetricMatrixRow label="Failed" tone="danger" values={item.nodeMetrics.map((node) => node.failed)} gridStyle={matrixGridStyle} />
            <MetricMatrixRow label="Done" tone="success" values={item.nodeMetrics.map((node) => node.completed)} gridStyle={matrixGridStyle} />
            <MetricMatrixRow label="Pending" tone="muted" values={item.nodeMetrics.map((node) => node.pending)} gridStyle={matrixGridStyle} />
          </div>
        </div>
      </div>
    </article>
  );
}

function PipelineNodeColumn({ node, first, last }: { node: NodeMetric; first: boolean; last: boolean }) {
  const NodeIcon = getNodeIcon(node);
  const statusLabel = {
    normal: '정상',
    running: '진행 중',
    pending: '대기 중',
    critical: '장애',
    idle: '대기',
  }[node.quality];

  return (
    <div className="relative min-h-36 px-2">
      {!first && <div className="absolute left-0 top-8 h-px w-1/2 bg-border" />}
      {!last && <div className="absolute right-0 top-8 h-px w-1/2 bg-border" />}
      <div
        className={cn(
          'node-icon-box relative z-10 mx-auto flex h-16 w-16 items-center justify-center rounded-xl border-2 bg-card shadow-sm',
          node.quality === 'critical'
            ? 'border-destructive'
            : node.quality === 'running'
              ? 'border-accent'
              : node.quality === 'pending'
                ? 'border-muted-foreground/30'
              : node.quality === 'normal'
                ? 'border-accent/70'
                : 'border-muted-foreground/30',
        )}
        style={{
          boxShadow: node.quality === 'critical'
            ? '0 0 16px rgba(239, 68, 68, 0.25)'
            : node.quality === 'running'
              ? '0 0 20px rgba(52, 211, 153, 0.25)'
              : node.quality === 'pending'
                ? 'none'
              : node.quality === 'normal'
                ? '0 0 14px rgba(52, 211, 153, 0.18)'
                : 'none',
        }}
      >
        <NodeIcon className={cn(
          'h-7 w-7',
          node.quality === 'critical'
            ? 'text-destructive'
            : node.quality === 'idle'
              ? 'text-muted-foreground/45'
              : node.quality === 'pending'
                ? 'text-muted-foreground/60'
              : 'text-accent',
        )} />
      </div>
      <div className="mt-2 text-center">
        <div className="line-clamp-2 min-h-8 text-[11px] font-semibold leading-4 text-foreground" title={node.label}>
          {node.label}
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground" title={CSC_LABELS[node.target.split(' ')[0] as keyof typeof CSC_LABELS] ?? node.target}>
          {node.target}
        </div>
        <span className={cn(
          'mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
          node.quality === 'critical'
            ? 'bg-destructive/10 text-destructive'
            : node.quality === 'running'
              ? 'bg-accent/10 text-accent'
              : node.quality === 'pending'
                ? 'bg-muted text-muted-foreground'
              : node.quality === 'normal'
                ? 'bg-success/10 text-success'
                : 'bg-muted text-muted-foreground',
        )}>
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

function MetricMatrixRow({
  label,
  values,
  tone,
  gridStyle,
}: {
  label: string;
  values: number[];
  tone: 'success' | 'accent' | 'danger' | 'muted';
  gridStyle: React.CSSProperties;
}) {
  const textClass = {
    success: 'text-success',
    accent: 'text-accent',
    danger: 'text-destructive',
    muted: 'text-muted-foreground',
  }[tone];

  return (
    <div className="grid border-t border-border" style={gridStyle}>
      <div className="flex min-h-12 items-center border-r border-border px-3 py-2">
        <span className={cn('text-[11px] font-semibold', textClass)}>{label}</span>
      </div>
      {values.map((value, index) => (
        <div key={`${label}-${index}`} className="min-h-12 border-r border-border px-3 py-2 last:border-r-0">
          <div className={cn('font-mono text-lg font-bold', value > 0 ? textClass : 'text-muted-foreground/45')}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

