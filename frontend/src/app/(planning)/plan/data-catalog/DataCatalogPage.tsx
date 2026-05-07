'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ElementType } from 'react';
import { usePathname } from 'next/navigation';
import LeftSidebar from '@/components/panels/LeftSidebar';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import { toast } from '@/components/ui/Toast';
import { cn, formatDuration, formatKST, formatRelativeTime } from '@/lib/utils';
import { PRODUCT_LEVEL_LABELS, SAR_STAGE_TO_CSC, SAR_STAGE_TO_LEVEL } from '@/types/pipeline';
import type {
  Hdf5FileSummary,
  JobSummary,
  PipelineDefinition,
  PipelineStep,
  Product,
  ProductLevel,
  RawDataSummary,
} from '@/types/pipeline';
import CanvasGraph from '@/components/graph/CanvasGraph';
import {
  Antenna,
  Binary,
  CheckCircle2,
  ChevronDown,
  Clock,
  Database,
  Download,
  Eye,
  FileJson,
  Filter,
  HardDrive,
  Image as ImageIcon,
  Layers,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Ruler,
  Search,
  Upload,
  X,
  XCircle,
} from 'lucide-react';

type InspectorTab = 'raw' | 'result';
type InspectorSelection =
  | { type: 'raw' }
  | { type: 'hdf5'; fileId?: string }
  | { type: 'product'; productId?: string }
  | { type: 'job'; jobId?: string };

type UploadQueueItem = {
  id: string;
  fileName: string;
  status: 'uploading' | 'uploaded' | 'failed';
  message: string;
};

interface LineageItem {
  raw: RawDataSummary;
  hdf5Files: Hdf5FileSummary[];
  products: Product[];
  jobs: JobSummary[];
}

function createUploadQueueId(file: File, index: number): string {
  return globalThis.crypto?.randomUUID?.() ?? `${file.name}-${file.size}-${Date.now()}-${index}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex >= 3 ? 1 : 0)} ${units[unitIndex]}`;
}

function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

function ProductStatusBadge({ status }: { status: Product['status'] }) {
  const tone = {
    COMPLETED: 'bg-success/15 text-success',
    PROCESSING: 'bg-accent/15 text-accent',
    FAILED: 'bg-destructive/15 text-destructive',
  }[status];
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', tone)}>{status}</span>;
}

function JobStatusBadge({ status }: { status: JobSummary['status'] }) {
  const tone = {
    CREATED: 'bg-muted text-muted-foreground',
    ASSIGNED: 'bg-accent/15 text-accent',
    COMPLETED: 'bg-success/15 text-success',
    FAILED: 'bg-destructive/15 text-destructive',
    CANCELED: 'bg-muted text-muted-foreground',
  }[status];
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', tone)}>{status}</span>;
}

function StatBlock({ label, value, icon: Icon }: { label: string; value: string | number; icon: ElementType }) {
  return (
    <div className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function toPreviewSteps(pipeline: PipelineDefinition, statusByOrder: Map<number, PipelineStep['status']>): PipelineStep[] {
  return pipeline.steps.map((step) => ({
    order: step.order,
    kind: step.kind,
    sarStage: step.sarStage,
    inputLevel: step.inputLevel,
    parentOrder: step.parentOrder,
    targetCsc:
      step.kind === 'SAR' && step.sarStage
        ? SAR_STAGE_TO_CSC[step.sarStage]
        : step.kind === 'JOB_INIT'
          ? 'CSC-08'
          : step.kind === 'CATALOG' || step.kind === 'THUMBNAIL'
            ? 'CSC-07'
            : 'CSC-02',
    productLevel:
      step.kind === 'SAR' && step.sarStage
        ? SAR_STAGE_TO_LEVEL[step.sarStage]
        : step.inputLevel ?? 'LEVEL_0',
    status: statusByOrder.get(step.order) ?? 'PENDING',
    enabledTasks: step.enabledTasks,
  }));
}

function buildLineage(
  rawData: RawDataSummary[],
  hdf5Files: Hdf5FileSummary[],
  products: Product[],
  jobs: JobSummary[],
): LineageItem[] {
  const hdf5ByRaw = new Map<string, Hdf5FileSummary[]>();
  const productsByRaw = new Map<string, Product[]>();
  const jobsById = new Map(jobs.map((job) => [job.jobId, job]));

  for (const file of hdf5Files) {
    const list = hdf5ByRaw.get(file.rawDataId) ?? [];
    list.push(file);
    hdf5ByRaw.set(file.rawDataId, list);
  }
  for (const product of products) {
    const list = productsByRaw.get(product.rawDataId) ?? [];
    list.push(product);
    productsByRaw.set(product.rawDataId, list);
  }

  return rawData.map((raw) => {
    const rawProducts = productsByRaw.get(raw.id) ?? [];
    const rawJobs = rawProducts
      .map((product) => jobsById.get(product.jobId))
      .filter((job): job is JobSummary => Boolean(job));
    return {
      raw,
      hdf5Files: hdf5ByRaw.get(raw.id) ?? [],
      products: rawProducts,
      jobs: Array.from(new Map(rawJobs.map((job) => [job.jobId, job])).values()),
    };
  });
}

function RawDataList({
  items,
  selectedRawId,
  onSelect,
}: {
  items: LineageItem[];
  selectedRawId: string | null;
  onSelect: (rawId: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {items.map((item) => {
        return (
          <button
            key={item.raw.id}
            type="button"
            onClick={() => onSelect(item.raw.id)}
            className={cn(
              'w-full border-b border-border px-3 py-3 text-left transition-colors',
              selectedRawId === item.raw.id ? 'bg-accent/10' : 'hover:bg-muted/25',
            )}
          >
            <div className="block w-full font-mono text-[11px] font-semibold leading-snug text-foreground [overflow-wrap:anywhere] [word-break:break-all]">
              {item.raw.title}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
              <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0 text-accent" />
                <span className="truncate">{formatLatLon(item.raw.latitude, item.raw.longitude)}</span>
              </span>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {formatFileSize(item.raw.fileSizeBytes)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span className="truncate">
                {item.raw.satelliteId} · {item.raw.mode} · {item.raw.polarization}
              </span>
              <span className="shrink-0 text-muted-foreground/80">
                Received {formatRelativeTime(item.raw.receivedAt)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

const LEVEL_ORDERED: ProductLevel[] = ['LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];
const LEVEL_TO_IDX: Record<ProductLevel, number> = { LEVEL_0: 0, LEVEL_1: 1, LEVEL_2: 2, LEVEL_3: 3 };

const RUN_COLOR_FROM_RAW = '#04B58B';
const RUN_COLOR_PARTIAL = '#2B7FFF';
function colorForRun(run: LineageRun): string {
  return run.isPartial ? RUN_COLOR_PARTIAL : RUN_COLOR_FROM_RAW;
}

type RunStatus = 'running' | 'completed' | 'failed';

interface LineageRun {
  job: JobSummary;
  pipeline: PipelineDefinition | undefined;
  pipelineName: string;
  products: Product[];
  productByLevel: Map<ProductLevel, Product>;
  /** highest level idx the pipeline targets (-1 if unknown) */
  pipelineTargetIdx: number;
  /** highest level idx among produced products (-1 if no products yet) */
  lastProducedIdx: number;
  /** highest level idx the lane should reach visually */
  terminalIdx: number;
  /**
   * Lowest level idx the run actually owns (produces). For partial-reprocess
   * pipelines this equals the first SAR-stage level (e.g. L2 for "Start from L1").
   * For full pipelines this is 0 (L0). -1 if pipeline has no SAR steps.
   */
  startProducedIdx: number;
  /**
   * If this run is partial-reprocess, the level idx of the FILE_INPUT step
   * (the level the run consumes as input). -1 for full pipelines.
   */
  inputLevelIdx: number;
  status: RunStatus;
  isDone: boolean;
  isPartial: boolean;
}

function buildLineageRuns(item: LineageItem, pipelines: PipelineDefinition[]): LineageRun[] {
  const pipelinesById = new Map(pipelines.map((p) => [p.id, p]));
  const productsByJob = new Map<string, Product[]>();
  for (const product of item.products) {
    const list = productsByJob.get(product.jobId) ?? [];
    list.push(product);
    productsByJob.set(product.jobId, list);
  }
  return [...item.jobs]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((job): LineageRun => {
      const pipeline = pipelinesById.get(job.pipelineId);
      const products = productsByJob.get(job.jobId) ?? [];
      const productByLevel = new Map<ProductLevel, Product>();
      for (const p of products) productByLevel.set(p.level, p);

      let pipelineTargetIdx = -1;
      let startProducedIdx = -1;
      let inputLevelIdx = -1;
      let isPartial = false;
      if (pipeline) {
        for (const step of pipeline.steps) {
          if (step.kind === 'SAR' && step.sarStage) {
            const idx = LEVEL_TO_IDX[SAR_STAGE_TO_LEVEL[step.sarStage]];
            if (idx > pipelineTargetIdx) pipelineTargetIdx = idx;
            if (startProducedIdx === -1 || idx < startProducedIdx) startProducedIdx = idx;
          } else if (step.kind === 'FILE_INPUT') {
            isPartial = true;
            if (step.inputLevel) inputLevelIdx = LEVEL_TO_IDX[step.inputLevel];
            if (pipelineTargetIdx < 0) pipelineTargetIdx = inputLevelIdx;
          } else if (step.kind === 'JOB_INIT') {
            if (pipelineTargetIdx < 0) pipelineTargetIdx = 0;
          }
        }
      }

      const lastProducedIdx = products.length === 0
        ? -1
        : products.reduce((max, p) => Math.max(max, LEVEL_TO_IDX[p.level]), -1);

      const isDone =
        job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELED';

      // Done runs stop at last produced level (no ghost continuation).
      // In-progress runs extend to the pipeline target so we can show the dashed remainder.
      const terminalIdx = isDone
        ? Math.max(lastProducedIdx, 0)
        : Math.max(lastProducedIdx, pipelineTargetIdx, 0);

      let status: RunStatus;
      if (job.status === 'FAILED' || products.some((p) => p.status === 'FAILED')) {
        status = 'failed';
      } else if (!isDone || products.some((p) => p.status === 'PROCESSING')) {
        status = 'running';
      } else {
        status = 'completed';
      }

      return {
        job,
        pipeline,
        pipelineName: pipeline?.name ?? job.pipelineId,
        products,
        productByLevel,
        pipelineTargetIdx,
        lastProducedIdx,
        terminalIdx,
        startProducedIdx,
        inputLevelIdx,
        status,
        isDone,
        isPartial,
      };
    });
}

function activeJobIdFromSelection(selection: InspectorSelection, item: LineageItem): string | undefined {
  if (selection.type === 'job') return selection.jobId;
  if (selection.type === 'product') return item.products.find((p) => p.id === selection.productId)?.jobId;
  if (selection.type === 'hdf5') return item.products.find((p) => p.level === 'LEVEL_0')?.jobId;
  return undefined;
}

type LineageStatusFilter = 'all' | RunStatus;
type LineageLevelFilter = 'all' | ProductLevel;

function LineageView({
  item,
  selection,
  pipelines,
  onSelect,
  activePipelineId,
  onPipelineClick,
}: {
  item: LineageItem;
  selection: InspectorSelection;
  pipelines: PipelineDefinition[];
  onSelect: (selection: InspectorSelection) => void;
  activePipelineId: string | null;
  onPipelineClick: (pipelineId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LineageStatusFilter>('all');
  const [levelFilter, setLevelFilter] = useState<LineageLevelFilter>('all');

  const allRuns = useMemo(() => buildLineageRuns(item, pipelines), [item, pipelines]);
  const activeJobId = activeJobIdFromSelection(selection, item);

  const filteredRuns = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRuns.filter((run) => {
      if (statusFilter !== 'all' && run.status !== statusFilter) return false;
      if (levelFilter !== 'all' && !run.productByLevel.has(levelFilter)) return false;
      if (q) {
        const haystack =
          `${run.pipelineName} ${run.job.jobId} ${run.products.map((p) => p.id).join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allRuns, query, statusFilter, levelFilter]);

  const completedCount = allRuns.reduce(
    (n, r) => n + r.products.filter((p) => p.status === 'COMPLETED').length,
    0,
  );
  const runningCount = allRuns.reduce(
    (n, r) => n + r.products.filter((p) => p.status === 'PROCESSING').length,
    0,
  );
  const failedCount = allRuns.reduce(
    (n, r) => n + r.products.filter((p) => p.status === 'FAILED').length,
    0,
  );
  const expectedStations = allRuns.reduce((n, r) => n + Math.max(0, r.terminalIdx + 1), 0);
  const pendingCount = Math.max(0, expectedStations - completedCount - runningCount - failedCount);

  return (
    <div>
      <LineageFilterStrip
        query={query}
        onQueryChange={setQuery}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        levelFilter={levelFilter}
        onLevelChange={setLevelFilter}
        totalRuns={allRuns.length}
        visibleRuns={filteredRuns.length}
      />

      {filteredRuns.length === 0 && allRuns.length > 0 ? (
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border bg-card text-[12px] text-muted-foreground">
          No runs match the filters.
        </div>
      ) : (
        <RunsTable
          runs={filteredRuns}
          activeJobId={activeJobId}
          onSelect={onSelect}
          activePipelineId={activePipelineId}
          onPipelineClick={onPipelineClick}
          totals={{
            runs: allRuns.length,
            completed: completedCount,
            running: runningCount,
            pending: pendingCount,
            failed: failedCount,
          }}
        />
      )}
    </div>
  );
}

function LineageFilterStrip({
  query,
  onQueryChange,
  statusFilter,
  onStatusChange,
  levelFilter,
  onLevelChange,
  totalRuns,
  visibleRuns,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: LineageStatusFilter;
  onStatusChange: (value: LineageStatusFilter) => void;
  levelFilter: LineageLevelFilter;
  onLevelChange: (value: LineageLevelFilter) => void;
  totalRuns: number;
  visibleRuns: number;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search Pipeline / Job / Product"
          className="h-8 w-60 rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none focus:border-accent"
        />
      </div>
      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as LineageStatusFilter)}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-accent"
      >
        <option value="all">Status · All</option>
        <option value="running">Running</option>
        <option value="completed">Completed</option>
        <option value="failed">Failed</option>
      </select>
      <select
        value={levelFilter}
        onChange={(e) => onLevelChange(e.target.value as LineageLevelFilter)}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-accent"
      >
        <option value="all">Reached level · All</option>
        {LEVEL_ORDERED.map((level) => (
          <option key={level} value={level}>
            Reached {PRODUCT_LEVEL_LABELS[level]}
          </option>
        ))}
      </select>
      <div className="ml-auto text-[11px] text-muted-foreground">
        {visibleRuns === totalRuns ? `${totalRuns} runs` : `${visibleRuns} / ${totalRuns} runs`}
      </div>
    </div>
  );
}

interface RunsTableTotals {
  runs: number;
  completed: number;
  running: number;
  pending: number;
  failed: number;
}

const INFINITE_SCROLL_BATCH = 30;

function RunsTable({
  runs,
  activeJobId,
  onSelect,
  totals,
  activePipelineId,
  onPipelineClick,
}: {
  runs: LineageRun[];
  activeJobId: string | undefined;
  onSelect: (selection: InspectorSelection) => void;
  totals: RunsTableTotals;
  activePipelineId: string | null;
  onPipelineClick: (pipelineId: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(INFINITE_SCROLL_BATCH);
  const sentinelRef = useRef<HTMLTableRowElement>(null);

  // 필터/데이터 변경 시 처음 배치부터 다시 렌더한다.
  useEffect(() => {
    setVisibleCount(INFINITE_SCROLL_BATCH);
  }, [runs]);

  // 매트릭스 컨테이너가 스크롤되며 sentinel 이 viewport 에 들어오면 다음 배치 로드.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    if (visibleCount >= runs.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(c + INFINITE_SCROLL_BATCH, runs.length));
        }
      },
      { rootMargin: '0px 0px 200px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [runs.length, visibleCount]);

  const visibleRuns = runs.slice(0, visibleCount);
  const hasMore = visibleCount < runs.length;

  // 부분 재처리 노선의 입력 도너(이전 JOB) 매핑.
  // 입력 레벨에서 COMPLETED 산출물을 가진 다른 실행 중 가장 최근 것을 도너로 본다.
  const donorByJobId = useMemo(() => {
    const map = new Map<string, { jobId: string; pipelineName: string; product: Product }>();
    runs.forEach((run) => {
      if (!run.isPartial || run.inputLevelIdx < 0) return;
      const inputLevel = LEVEL_ORDERED[run.inputLevelIdx];
      let best: { run: LineageRun; product: Product } | null = null;
      for (const cand of runs) {
        if (cand.job.jobId === run.job.jobId) continue;
        const p = cand.productByLevel.get(inputLevel);
        if (!p || p.status !== 'COMPLETED') continue;
        if (!best || new Date(p.createdAt).getTime() > new Date(best.product.createdAt).getTime()) {
          best = { run: cand, product: p };
        }
      }
      if (best) {
        map.set(run.job.jobId, {
          jobId: best.run.job.jobId,
          pipelineName: best.run.pipelineName,
          product: best.product,
        });
      }
    });
    return map;
  }, [runs]);

  return (
    <div className="rounded-md border border-border bg-card">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead className="text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <tr>
            <th className="sticky top-0 z-10 border-b border-border bg-muted/95 px-3 py-2 font-medium backdrop-blur">Run</th>
            <th className="sticky top-0 z-10 border-b border-border bg-muted/95 px-3 py-2 font-medium backdrop-blur">Pipeline</th>
            <th className="sticky top-0 z-10 border-b border-border bg-muted/95 px-3 py-2 text-center font-medium backdrop-blur">L0</th>
            <th className="sticky top-0 z-10 border-b border-border bg-muted/95 px-3 py-2 text-center font-medium backdrop-blur">L1</th>
            <th className="sticky top-0 z-10 border-b border-border bg-muted/95 px-3 py-2 text-center font-medium backdrop-blur">L2</th>
            <th className="sticky top-0 z-10 border-b border-border bg-muted/95 px-3 py-2 text-center font-medium backdrop-blur">L3</th>
            <th className="sticky top-0 z-10 border-b border-border bg-muted/95 px-3 py-2 font-medium backdrop-blur">Start</th>
            <th className="sticky top-0 z-10 border-b border-border bg-muted/95 px-3 py-2 font-medium backdrop-blur">Reach</th>
            <th className="sticky top-0 z-10 border-b border-border bg-muted/95 px-3 py-2 font-medium backdrop-blur">Target</th>
            <th className="sticky top-0 z-10 border-b border-border bg-muted/95 px-3 py-2 font-medium backdrop-blur">Started</th>
            <th className="sticky top-0 z-10 border-b border-border bg-muted/95 px-3 py-2 font-medium backdrop-blur">Status</th>
          </tr>
        </thead>
        <tbody>
          {visibleRuns.map((run) => {
            const color = colorForRun(run);
            const isActive = activeJobId === run.job.jobId;
            return (
              <tr
                key={run.job.jobId}
                onClick={() => onSelect({ type: 'job', jobId: run.job.jobId })}
                className={cn(
                  'cursor-pointer border-t border-border transition-colors hover:bg-muted/25',
                  isActive && 'bg-accent/10',
                )}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: run.status === 'failed' ? '#EB5757' : color }}
                    />
                    <span className="font-mono text-[11px] font-semibold text-foreground">
                      {run.job.jobId}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPipelineClick(run.job.pipelineId);
                    }}
                    className={cn(
                      'rounded px-1.5 py-0.5 text-left text-foreground transition-colors hover:text-accent',
                      run.job.pipelineId === activePipelineId ? 'font-bold' : 'font-medium',
                    )}
                    title="Show this pipeline in the diagram"
                  >
                    {run.pipelineName}
                  </button>
                </td>
                {LEVEL_ORDERED.map((level) => {
                  const levelIdx = LEVEL_TO_IDX[level];
                  const product = run.productByLevel.get(level);
                  const laneFirstIdx = run.isPartial && run.inputLevelIdx >= 0 ? run.inputLevelIdx : 0;
                  const inRange = levelIdx >= laneFirstIdx && levelIdx <= run.terminalIdx;
                  const isInput =
                    run.isPartial &&
                    levelIdx === run.inputLevelIdx &&
                    !product;
                  const donor = isInput ? donorByJobId.get(run.job.jobId) : undefined;
                  const cellClickTarget = product ?? donor?.product;
                  return (
                    <td
                      key={level}
                      className={cn(
                        'px-3 py-2 text-center',
                        cellClickTarget && 'group cursor-pointer',
                      )}
                      onClick={
                        cellClickTarget
                          ? (e) => {
                              e.stopPropagation();
                              onSelect({ type: 'product', productId: cellClickTarget.id });
                            }
                          : undefined
                      }
                    >
                      <RunCellDot
                        product={product}
                        inRange={inRange}
                        isInput={isInput}
                        color={color}
                        donor={donor}
                        levelLabel={PRODUCT_LEVEL_LABELS[level]}
                      />
                    </td>
                  );
                })}
                <td className="px-3 py-2 font-mono text-[11px]">
                  {run.isPartial && run.inputLevelIdx >= 0 ? (
                    <span
                      className="inline-flex items-center rounded border border-dashed px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ color, borderColor: color, opacity: 0.85 }}
                      title="Partial reprocess input level"
                    >
                      {PRODUCT_LEVEL_LABELS[LEVEL_ORDERED[run.inputLevelIdx]]}
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                      title="Full pipeline from raw data"
                    >
                      RAW
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-foreground">
                  {run.lastProducedIdx >= 0
                    ? PRODUCT_LEVEL_LABELS[LEVEL_ORDERED[run.lastProducedIdx]]
                    : '—'}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  {run.pipelineTargetIdx >= 0
                    ? PRODUCT_LEVEL_LABELS[LEVEL_ORDERED[run.pipelineTargetIdx]]
                    : '—'}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground" title={run.job.startedAt}>
                  {run.job.startedAt}
                </td>
                <td className="px-3 py-2">
                  <RunStatusBadge status={run.status} />
                </td>
              </tr>
            );
          })}
          {hasMore && (
            <tr ref={sentinelRef} aria-hidden>
              <td colSpan={11} className="px-3 py-3 text-center text-[10px] text-muted-foreground">
                Loading more runs...
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={11} className="sticky bottom-0 z-10 border-t-2 border-border bg-muted/95 px-3 py-2 backdrop-blur">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <FooterStat num={totals.runs} label="runs" />
                <FooterStat num={totals.completed} label="completed" tone="text-success" />
                <FooterStat num={totals.running} label="running" tone="text-accent" />
                <FooterStat num={totals.pending} label="pending" />
                {totals.failed > 0 && (
                  <FooterStat num={totals.failed} label="failed" tone="text-destructive" />
                )}
                <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                  Showing {visibleRuns.length} / {runs.length}
                </span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function FooterStat({ num, label, tone }: { num: number; label: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className={cn('text-xs font-bold tabular-nums leading-none text-foreground', tone)}>
        {num}
      </span>
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

function RunStatusBadge({ status }: { status: RunStatus }) {
  const tone = {
    running: 'bg-accent/15 text-accent',
    completed: 'bg-success/15 text-success',
    failed: 'bg-destructive/15 text-destructive',
  }[status];
  const label = { running: 'RUNNING', completed: 'COMPLETED', failed: 'FAILED' }[status];
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', tone)}>{label}</span>
  );
}

function RunCellDot({
  product,
  inRange,
  isInput,
  color,
  donor,
  levelLabel,
}: {
  product: Product | undefined;
  inRange: boolean;
  isInput?: boolean;
  color: string;
  donor?: { jobId: string; pipelineName: string; product: Product };
  levelLabel?: string;
}) {
  if (!inRange) {
    return <span className="text-[10px] text-muted-foreground/40">·</span>;
  }
  if (isInput) {
    const tooltip = donor
      ? `Reuses ${levelLabel ?? ''} result from ${donor.jobId} (${donor.pipelineName})\n→ ${donor.product.id}`
      : 'Input from a previous run';
    return (
      <span
        className="mx-auto inline-block cursor-help rounded px-1 py-0.5 text-[8px] font-bold tracking-wider transition-shadow duration-300 ease-out group-hover:[box-shadow:0_0_8px_2px_currentColor]"
        style={{ color, border: `1px dashed ${color}`, opacity: 0.7 }}
        title={tooltip}
      >
        IN
      </span>
    );
  }
  if (!product) {
    return (
      <span
        className="mx-auto inline-block h-3.5 w-3.5 rounded-full border border-dashed transition-shadow duration-300 ease-out group-hover:[box-shadow:0_0_8px_2px_hsl(var(--muted-foreground)/0.5)]"
        style={{ borderColor: 'hsl(var(--muted-foreground) / 0.6)' }}
        title="Not generated"
      />
    );
  }
  if (product.status === 'PROCESSING') {
    return (
      <span
        className="mx-auto inline-block h-3.5 w-3.5 animate-pulse rounded-full transition-shadow duration-300 ease-out group-hover:[box-shadow:0_0_8px_2px_currentColor]"
        style={{ background: color, color, opacity: 0.85 }}
        title="Processing"
      />
    );
  }
  if (product.status === 'FAILED') {
    return (
      <span
        className="mx-auto inline-block h-3.5 w-3.5 rounded-full transition-shadow duration-300 ease-out group-hover:[box-shadow:0_0_8px_2px_currentColor]"
        style={{ background: '#EB5757', color: '#EB5757' }}
        title="Failed"
      />
    );
  }
  return (
    <span
      className="mx-auto inline-block h-3.5 w-3.5 rounded-full transition-shadow duration-300 ease-out group-hover:[box-shadow:0_0_8px_2px_currentColor]"
      style={{ background: color, color }}
      title="Completed"
    />
  );
}

function Hdf5Inspector({
  files,
  selectedFileId,
  l0Products,
  onJumpToProduct,
}: {
  files: Hdf5FileSummary[];
  selectedFileId?: string;
  l0Products?: Product[];
  onJumpToProduct?: (productId: string) => void;
}) {
  const file = files.find((item) => item.id === selectedFileId) ?? files[0] ?? null;
  const node = file?.nodes[0] ?? null;
  const attrs = file && node ? file.attributes[node.path] ?? [] : [];

  if (!file) {
    return <EmptyInspector title="No HDF5" description="No HDF5 files are linked to the selected Raw Data." />;
  }

  const linkedProduct = l0Products?.[0];

  return (
    <div className="min-h-0 overflow-y-auto">
      <InspectorHeader icon={Database} title={file.fileName} subtitle={`Level-0 product · ${file.nodes.length} nodes / ${formatFileSize(file.fileSizeBytes)}`} />
      {linkedProduct && onJumpToProduct && (
        <div className="border-b border-border px-4 py-3">
          <button
            type="button"
            onClick={() => onJumpToProduct(linkedProduct.id)}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-left text-xs text-accent transition-colors hover:bg-accent/10"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Package className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">View as L0 Product — {linkedProduct.id}</span>
            </span>
            <ProductStatusBadge status={linkedProduct.status} />
          </button>
        </div>
      )}
      <section className="border-b border-border px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Root Groups</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {file.rootGroups.map((group) => (
            <span key={group} className="rounded bg-muted px-2 py-1 text-[11px] text-foreground">{group}</span>
          ))}
        </div>
      </section>
      <section className="border-b border-border px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">First Node</div>
        <div className="mt-2 rounded-md border border-border bg-background px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Binary className="h-3.5 w-3.5 text-accent" />
            {node?.path ?? '-'}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {node?.type ?? '-'} / {attrs.length} attributes
          </div>
        </div>
      </section>
      <section className="px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Attributes</div>
        <div className="mt-2 overflow-hidden rounded-md border border-border">
          <table className="w-full text-[11px]">
            <tbody>
              {attrs.slice(0, 8).map((attr) => (
                <tr key={attr.name} className="border-b border-border last:border-b-0">
                  <td className="px-2 py-1.5 text-muted-foreground">{attr.name}</td>
                  <td className="px-2 py-1.5 font-mono text-foreground">{String(attr.value)}</td>
                </tr>
              ))}
              {attrs.length === 0 && (
                <tr>
                  <td className="px-2 py-5 text-center text-muted-foreground">No attributes to display.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function QualityBadge({ pass }: { pass: boolean }) {
  return pass ? (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-success">
      <CheckCircle2 className="h-3 w-3" />
      Pass
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-destructive">
      <XCircle className="h-3 w-3" />
      Fail
    </span>
  );
}

function MetaItem({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {href ? (
        <a href={href} className="text-sm font-medium text-accent hover:underline">
          {value}
        </a>
      ) : (
        <div className="text-sm font-medium text-foreground">{value}</div>
      )}
    </div>
  );
}

function ProductDetailPanel({
  products,
  selectedProductId,
  hdf5Files,
  onDownload,
  onReprocess,
  onJumpToHdf5,
}: {
  products: Product[];
  selectedProductId?: string;
  hdf5Files?: Hdf5FileSummary[];
  onDownload: (product: Product) => void;
  onReprocess: (product: Product) => void;
  onJumpToHdf5?: (fileId: string) => void;
}) {
  const product = products.find((item) => item.id === selectedProductId) ?? products[0] ?? null;
  const pathname = usePathname();
  const base = pathname.startsWith('/current') ? '/current' : '/plan';

  if (!product) {
    return <EmptyInspector title="No Product" description="No product has been generated for the selected stage." />;
  }

  const linkedHdf5 = product.level === 'LEVEL_0' ? hdf5Files?.[0] : undefined;

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{product.id}</div>
          <div className="truncate text-xs text-muted-foreground">{product.rawDataName ?? product.sceneId}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <ProductStatusBadge status={product.status} />
          <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-xs text-accent">
            {PRODUCT_LEVEL_LABELS[product.level]}
          </span>
          {product.level === 'LEVEL_0' && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              HDF5
            </span>
          )}
        </div>

        {linkedHdf5 && onJumpToHdf5 && (
          <button
            type="button"
            onClick={() => onJumpToHdf5(linkedHdf5.id)}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-left text-xs text-accent transition-colors hover:bg-accent/10"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Database className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">View HDF5 schema — {linkedHdf5.fileName}</span>
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">{linkedHdf5.nodes.length} nodes</span>
          </button>
        )}

        <div className="flex aspect-square items-center justify-center rounded-lg border border-border bg-background p-3">
          {product.thumbnailUrl ? (
            <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              <span className="text-xs">Quick-look Thumbnail</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/50">No preview</span>
          )}
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Metadata</h4>
          <div className="grid grid-cols-2 gap-2">
            <MetaItem label="Satellite" value={product.satelliteId} />
            <MetaItem label="Mode" value={product.mode} />
            <MetaItem label="Polarization" value={product.polarization} />
            <MetaItem label="Job ID" value={product.jobId} href={`${base}/jobs?jobId=${product.jobId}`} />
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <MapPin className="h-3 w-3" />
            Spatial Extent
          </h4>
          <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
            W: {product.spatialExtent.west.toFixed(4)} / S: {product.spatialExtent.south.toFixed(4)}
            <br />
            E: {product.spatialExtent.east.toFixed(4)} / N: {product.spatialExtent.north.toFixed(4)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <h4 className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
              <Clock className="h-3 w-3" />
              Acquisition Time
            </h4>
            <div className="text-xs text-foreground">{formatKST(product.acquisitionStart)}</div>
            <div className="text-xs text-muted-foreground">~ {formatKST(product.acquisitionEnd)}</div>
          </div>
          <div className="space-y-1">
            <h4 className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
              <Ruler className="h-3 w-3" />
              Resolution
            </h4>
            <div className="text-xs text-foreground">
              Range: {product.resolutionRange.toFixed(1)}m
              <br />
              Azimuth: {product.resolutionAzimuth.toFixed(1)}m
            </div>
          </div>
        </div>

        <MetaItem label="Processing Time" value={formatDuration(product.processingTimeMs)} />

        {product.quality && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Eye className="h-3 w-3" />
              Quality Validation (REQ-FUNC-023)
            </h4>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-background text-muted-foreground">
                    <th className="px-3 py-1.5 text-left font-medium">Metric</th>
                    <th className="px-3 py-1.5 text-right font-medium">Value</th>
                    <th className="px-3 py-1.5 text-center font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-foreground">NESZ</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">
                      {product.quality.nesz.value.toFixed(1)} {product.quality.nesz.unit}
                    </td>
                    <td className="px-3 py-1.5 text-center"><QualityBadge pass={product.quality.nesz.pass} /></td>
                  </tr>
                  <tr className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-foreground">PSLR</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">
                      {product.quality.pslr.value.toFixed(1)} {product.quality.pslr.unit}
                    </td>
                    <td className="px-3 py-1.5 text-center"><QualityBadge pass={product.quality.pslr.pass} /></td>
                  </tr>
                  <tr className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-foreground">Geometric Accuracy</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">
                      {product.quality.geometricAccuracy.value.toFixed(1)} {product.quality.geometricAccuracy.unit}
                    </td>
                    <td className="px-3 py-1.5 text-center"><QualityBadge pass={product.quality.geometricAccuracy.pass} /></td>
                  </tr>
                  <tr className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-foreground">Radiometric Calibration</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">-</td>
                    <td className="px-3 py-1.5 text-center"><QualityBadge pass={product.quality.radiometricCalibration.pass} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
        <button
          onClick={() => onDownload(product)}
          disabled={product.status !== 'COMPLETED'}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            product.status === 'COMPLETED'
              ? 'bg-accent text-background hover:bg-accent/90'
              : 'cursor-not-allowed bg-muted text-muted-foreground',
          )}
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
        <button
          onClick={() => onReprocess(product)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/30"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reprocess
        </button>
      </div>
    </div>
  );
}

function RawInspector({ raw }: { raw: RawDataSummary }) {
  return (
    <div className="min-h-0 overflow-y-auto">
      <InspectorHeader icon={Antenna} title={raw.title} subtitle={`CCSDS · ${raw.rawDataPath}`} />
      <div className="grid grid-cols-2 border-b border-border">
        <StatBlock label="Satellite" value={raw.satelliteId} icon={Antenna} />
        <StatBlock label="Mode" value={raw.mode} icon={Filter} />
        <StatBlock label="Polarization" value={raw.polarization} icon={Layers} />
        <StatBlock label="Size" value={formatFileSize(raw.fileSizeBytes)} icon={HardDrive} />
      </div>
      <section className="border-b border-border px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Acquisition</div>
        <div className="mt-2 text-xs text-foreground">{formatKST(raw.capturedAt)}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">Received: {formatKST(raw.receivedAt)}</div>
      </section>
      <section className="px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Location</div>
        <div className="mt-2 font-mono text-xs text-foreground">
          {raw.latitude.toFixed(5)}, {raw.longitude.toFixed(5)}
        </div>
      </section>
    </div>
  );
}

function ResultOverview({
  item,
  onSelect,
}: {
  item: LineageItem;
  onSelect: (selection: InspectorSelection) => void;
}) {
  const sortedProducts = [...item.products].sort((a, b) => a.level.localeCompare(b.level));
  return (
    <div className="min-h-0 overflow-y-auto">
      <section className="border-b border-border px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <Database className="h-3 w-3" />
          Level-0 (HDF5)
        </div>
        {item.hdf5Files.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
            HDF5 has not been produced yet.
          </div>
        ) : (
          <div className="space-y-1">
            {item.hdf5Files.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => onSelect({ type: 'hdf5', fileId: file.id })}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:border-accent/45 hover:bg-accent/5"
              >
                <span className="min-w-0 truncate text-foreground">{file.fileName}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {file.nodes.length} nodes · {formatFileSize(file.fileSizeBytes)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="border-b border-border px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <Package className="h-3 w-3" />
          Products ({sortedProducts.length})
        </div>
        {sortedProducts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
            No products generated yet.
          </div>
        ) : (
          <div className="space-y-1">
            {sortedProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => onSelect({ type: 'product', productId: product.id })}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:border-accent/45 hover:bg-accent/5"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="rounded bg-accent/10 px-1.5 py-px font-mono text-[10px] text-accent">
                    {PRODUCT_LEVEL_LABELS[product.level]}
                  </span>
                  <span className="truncate text-foreground">{product.id}</span>
                </span>
                <ProductStatusBadge status={product.status} />
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <FileJson className="h-3 w-3" />
          Jobs ({item.jobs.length})
        </div>
        {item.jobs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
            No jobs triggered yet.
          </div>
        ) : (
          <div className="space-y-1">
            {item.jobs.map((job) => (
              <button
                key={job.jobId}
                type="button"
                onClick={() => onSelect({ type: 'job', jobId: job.jobId })}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:border-accent/45 hover:bg-accent/5"
              >
                <span className="min-w-0 truncate font-mono text-foreground">{job.jobId}</span>
                <JobStatusBadge status={job.status} />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function JobInspector({ jobs, selectedJobId }: { jobs: JobSummary[]; selectedJobId?: string }) {
  const job = jobs.find((item) => item.jobId === selectedJobId) ?? jobs[0] ?? null;
  if (!job) return <EmptyInspector title="No Job" description="No processing job is linked to the selected Raw Data." />;
  return (
    <div className="min-h-0 overflow-y-auto">
      <InspectorHeader icon={FileJson} title={job.jobId} subtitle={job.pipelineId} />
      <div className="border-b border-border px-4 py-3">
        <JobStatusBadge status={job.status} />
      </div>
      <div className="grid grid-cols-2 border-b border-border">
        <StatBlock label="Current Level" value={job.currentLevel ? PRODUCT_LEVEL_LABELS[job.currentLevel] : '-'} icon={Layers} />
        <StatBlock label="Retries" value={job.retryCount} icon={Clock} />
      </div>
      <section className="px-4 py-3 text-xs text-foreground">
        <div>Started: {formatKST(job.startedAt)}</div>
        <div className="mt-1 text-muted-foreground">Updated: {formatKST(job.updatedAt)}</div>
      </section>
    </div>
  );
}

function InspectorHeader({ icon: Icon, title, subtitle }: { icon: ElementType; title: string; subtitle: string }) {
  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-accent" />
        <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground">{subtitle}</div>
    </div>
  );
}

function EmptyInspector({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <XCircle className="h-8 w-8 text-muted-foreground/55" />
      <div className="mt-3 text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function Inspector({
  item,
  tab,
  selection,
  onSelect,
  onDownloadProduct,
  onReprocessProduct,
}: {
  item: LineageItem;
  tab: InspectorTab;
  selection: InspectorSelection;
  onSelect: (selection: InspectorSelection) => void;
  onDownloadProduct: (product: Product) => void;
  onReprocessProduct: (product: Product) => void;
}) {
  if (tab === 'raw') {
    return <RawInspector raw={item.raw} />;
  }

  const l0Products = item.products.filter((p) => p.level === 'LEVEL_0');
  const jumpToHdf5 = (fileId: string) => onSelect({ type: 'hdf5', fileId });
  const jumpToProduct = (productId: string) => onSelect({ type: 'product', productId });

  if (selection.type === 'hdf5') {
    return (
      <Hdf5Inspector
        files={item.hdf5Files}
        selectedFileId={selection.fileId}
        l0Products={l0Products}
        onJumpToProduct={jumpToProduct}
      />
    );
  }
  if (selection.type === 'product') {
    return (
      <ProductDetailPanel
        products={item.products}
        selectedProductId={selection.productId}
        hdf5Files={item.hdf5Files}
        onDownload={onDownloadProduct}
        onReprocess={onReprocessProduct}
        onJumpToHdf5={jumpToHdf5}
      />
    );
  }
  if (selection.type === 'job') return <JobInspector jobs={item.jobs} selectedJobId={selection.jobId} />;
  return <ResultOverview item={item} onSelect={onSelect} />;
}

export default function DataCatalogPage() {
  const service = usePipelineService();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [rawData, setRawData] = useState<RawDataSummary[]>([]);
  const [hdf5Files, setHdf5Files] = useState<Hdf5FileSummary[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [query, setQuery] = useState('');
  const [inspectorMounted, setInspectorMounted] = useState(false);
  const [inspectorAnimating, setInspectorAnimating] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('raw');
  const [selectedRawId, setSelectedRawId] = useState<string | null>(null);
  const [selection, setSelection] = useState<InspectorSelection>({ type: 'raw' });
  const [diagramPipelineId, setDiagramPipelineId] = useState<string | null>(null);
  const [diagramCollapsed, setDiagramCollapsed] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [rawRes, hdf5Res, productRes, jobRes, plRes, plArchRes] = await Promise.all([
      service.원시데이터_목록을_조회한다({ limit: 2000 }),
      service.HDF5_애트리뷰트_목록을_조회한다(),
      service.제품_목록을_조회한다({ limit: 5000 }),
      service.Job_목록을_조회한다({ limit: 2000 }),
      service.파이프라인_목록을_조회한다(),
      service.아카이브_파이프라인_목록을_조회한다(),
    ]);
    if (rawRes.data) setRawData(rawRes.data.items);
    if (hdf5Res.data) setHdf5Files(hdf5Res.data);
    if (productRes.data) setProducts(productRes.data.items);
    if (jobRes.data) setJobs(jobRes.data.items);
    setPipelines([...(plRes.data ?? []), ...(plArchRes.data ?? [])]);
    setLoading(false);
  }, [service]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openInspector() {
    if (inspectorMounted) {
      setInspectorAnimating(true);
      return;
    }
    setInspectorMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setInspectorAnimating(true));
    });
  }
  function closeInspector() {
    setInspectorAnimating(false);
    setTimeout(() => setInspectorMounted(false), 200);
    // 패널 닫힐 때 SUBWAY MAP 의 강조(노드/잡 포커스)도 함께 해제한다.
    setSelection({ type: 'raw' });
    setInspectorTab('raw');
  }
  // 행 클릭 등으로 인한 자동 닫힘 — selection(하이라이트) 은 보존한다.
  function dismissInspector() {
    if (!inspectorMounted) return;
    setInspectorAnimating(false);
    setTimeout(() => setInspectorMounted(false), 200);
  }
  function selectInInspector(next: InspectorSelection) {
    setSelection(next);
    setInspectorTab(next.type === 'raw' ? 'raw' : 'result');
  }

  const lineage = useMemo(() => buildLineage(rawData, hdf5Files, products, jobs), [rawData, hdf5Files, products, jobs]);
  const filteredLineage = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = lineage.filter((item) => {
      if (!normalized) return true;
      return [
        item.raw.id,
        item.raw.title,
        item.raw.rawDataPath,
        ...item.hdf5Files.map((file) => file.fileName),
        ...item.products.map((product) => product.id),
        ...item.jobs.map((job) => job.jobId),
      ].some((value) => value.toLowerCase().includes(normalized));
    });
    return [...filtered].sort((a, b) => b.raw.capturedAt.localeCompare(a.raw.capturedAt));
  }, [lineage, query]);

  const selectedItem = useMemo(() => {
    return lineage.find((item) => item.raw.id === selectedRawId) ?? filteredLineage[0] ?? null;
  }, [filteredLineage, lineage, selectedRawId]);

  useEffect(() => {
    if (selectedRawId && selectedItem) return;
    if (filteredLineage[0]) {
      setSelectedRawId(filteredLineage[0].raw.id);
      setSelection({ type: 'raw' });
    }
  }, [filteredLineage, selectedItem, selectedRawId]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleHdf5Upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (selectedFiles.length === 0) return;
    if (!selectedItem) {
      toast.error('Select a Raw Data item to attach the HDF5 file to.');
      return;
    }

    const queuedUploads = selectedFiles.map((file, index) => ({
      id: createUploadQueueId(file, index),
      fileName: file.name,
      status: 'uploading' as const,
      message: 'Uploading',
    }));

    setUploading(true);
    setUploadQueue(queuedUploads);

    const uploadedFiles: Hdf5FileSummary[] = [];
    try {
      for (const [index, file] of selectedFiles.entries()) {
        const queuedUpload = queuedUploads[index];
        const [result] = await Promise.all([
          service.HDF5_파일을_업로드한다(file, selectedItem.raw.id),
          wait(700),
        ]);

        if (!result.success || !result.data) {
          setUploadQueue((current) =>
            current.map((item) =>
              item.id === queuedUpload.id
                ? { ...item, status: 'failed', message: result.message || 'Upload failed' }
                : item,
            ),
          );
          toast.error(result.message || `Failed to upload "${file.name}".`);
          continue;
        }

        const uploaded = { ...result.data, rawDataId: selectedItem.raw.id };
        uploadedFiles.push(uploaded);
        setUploadQueue((current) =>
          current.map((item) =>
            item.id === queuedUpload.id
              ? { ...item, status: 'uploaded', message: 'Upload complete' }
              : item,
          ),
        );
      }

      if (uploadedFiles.length > 0) {
        setHdf5Files((current) => [...uploadedFiles, ...current]);
        setSelection({ type: 'hdf5', fileId: uploadedFiles[0].id });
        setInspectorTab('result');
        toast.success(
          uploadedFiles.length === 1
            ? `"${uploadedFiles[0].fileName}" has been added.`
            : `${uploadedFiles.length} HDF5 files have been added.`,
        );
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadProduct = async (product: Product) => {
    const res = await service.제품_다운로드_URL을_발급한다(product.id);
    if (!res.success || !res.data) {
      toast.error(res.message || 'Failed to issue download URL.');
      return;
    }
    window.open(res.data.url, '_blank', 'noopener,noreferrer');
  };

  const handleReprocessProduct = async (product: Product) => {
    const res = await service.제품_재처리를_요청한다(product.id, { targetLevel: product.level });
    if (!res.success || !res.data) {
      toast.error(res.message || 'Failed to request reprocessing.');
      return;
    }
    toast.success(`Reprocess requested - Job: ${res.data.jobId}`);
  };

  // 이 RAW의 잡들에서 등장한 파이프라인만 추려 다이어그램 select 후보로 노출
  const rawPipelineOptions = useMemo<PipelineDefinition[]>(() => {
    if (!selectedItem) return [];
    const seen = new Set<string>();
    const ordered: PipelineDefinition[] = [];
    for (const job of selectedItem.jobs) {
      if (seen.has(job.pipelineId)) continue;
      seen.add(job.pipelineId);
      const pipeline = pipelines.find((p) => p.id === job.pipelineId);
      if (pipeline) ordered.push(pipeline);
    }
    return ordered;
  }, [selectedItem, pipelines]);

  // RAW 가 바뀌면 수동으로 고른 다이어그램 파이프라인 선택은 초기화한다.
  useEffect(() => {
    setDiagramPipelineId(null);
  }, [selectedItem?.raw.id]);

  const selectedPipeline = useMemo(() => {
    if (!selectedItem) return null;

    // 사용자가 다이어그램 select에서 명시적으로 고른 파이프라인이 있으면 우선 사용
    if (diagramPipelineId) {
      const explicit = pipelines.find((p) => p.id === diagramPipelineId);
      if (explicit) return explicit;
    }

    // 다이어그램은 RAW 가 바뀔 때까지 첫 번째 잡의 파이프라인으로 고정한다.
    // (테이블에서 JOB 을 클릭해 우측 패널을 열어도 다이어그램이 점프하지 않도록 selection 을 따라가지 않는다.
    // 다른 파이프라인을 보고 싶으면 상단 select 에서 명시적으로 고를 수 있다.)
    const firstJob = selectedItem.jobs[0];
    return firstJob ? pipelines.find((p) => p.id === firstJob.pipelineId) ?? null : null;
  }, [selectedItem, pipelines, diagramPipelineId]);

  const graphSteps = useMemo<PipelineStep[]>(() => {
    if (!selectedPipeline || !selectedItem) return [];
    const statusByOrder = new Map<number, PipelineStep['status']>();
    const hasJob = selectedItem.jobs.length > 0;

    // SAR step status from product status at the corresponding level
    const sarStatuses: PipelineStep['status'][] = [];
    for (const step of selectedPipeline.steps) {
      if (step.kind !== 'SAR' || !step.sarStage) continue;
      const level = SAR_STAGE_TO_LEVEL[step.sarStage];
      const productsAtLevel = selectedItem.products.filter((p) => p.level === level);
      let status: PipelineStep['status'] = 'PENDING';
      if (productsAtLevel.length > 0) {
        if (productsAtLevel.some((p) => p.status === 'COMPLETED')) status = 'COMPLETED';
        else if (productsAtLevel.some((p) => p.status === 'PROCESSING')) status = 'RUNNING';
        else if (productsAtLevel.every((p) => p.status === 'FAILED')) status = 'FAILED';
      }
      statusByOrder.set(step.order, status);
      sarStatuses.push(status);
    }

    const allSarCompleted = sarStatuses.length > 0 && sarStatuses.every((s) => s === 'COMPLETED');

    for (const step of selectedPipeline.steps) {
      if (statusByOrder.has(step.order)) continue;
      if (step.kind === 'TRIGGER') {
        statusByOrder.set(step.order, 'COMPLETED');
      } else if (step.kind === 'JOB_INIT' || step.kind === 'FILE_INPUT') {
        statusByOrder.set(step.order, hasJob ? 'COMPLETED' : 'PENDING');
      } else if (step.kind === 'CATALOG' || step.kind === 'THUMBNAIL') {
        statusByOrder.set(step.order, allSarCompleted ? 'COMPLETED' : 'PENDING');
      }
    }

    return toPreviewSteps(selectedPipeline, statusByOrder);
  }, [selectedPipeline, selectedItem]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <LeftSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} mode="nav" activePage="data-catalog" />
      <main className="flex min-w-0 flex-1 flex-col">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".h5,.hdf5,application/x-hdf5"
          onChange={(event) => void handleHdf5Upload(event)}
          className="hidden"
        />
        <div className="relative grid min-h-0 flex-1 grid-cols-[420px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-border bg-card">
            <div className="space-y-2 border-b border-border px-3 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <Antenna className="h-3.5 w-3.5" />
                  Raw Data
                </div>
                <button
                  type="button"
                  onClick={handleUploadClick}
                  disabled={uploading || !selectedItem}
                  className={cn(
                    'flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors',
                    uploading || !selectedItem
                      ? 'cursor-not-allowed bg-muted text-muted-foreground'
                      : 'bg-accent text-background hover:bg-accent/90',
                  )}
                  title="Attach HDF5 to selected Raw Data"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  HDF5
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search Raw / Product / Job"
                  className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:border-accent"
                />
              </div>
              <div className="text-[11px] font-semibold text-muted-foreground">
                {loading ? 'loading' : `${filteredLineage.length} items`}
              </div>
              {uploadQueue.length > 0 && (
                <div className="space-y-1">
                  {uploadQueue.slice(0, 2).map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        'rounded-md border px-2 py-1 text-[10px]',
                        item.status === 'uploaded' && 'border-success/35 text-success',
                        item.status === 'failed' && 'border-destructive/35 text-destructive',
                        item.status === 'uploading' && 'border-accent/35 text-muted-foreground',
                      )}
                    >
                      <div className="truncate font-medium">{item.fileName}</div>
                      <div className="truncate">{item.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {filteredLineage.length > 0 ? (
              <RawDataList
                items={filteredLineage}
                selectedRawId={selectedItem?.raw.id ?? null}
                onSelect={(rawId) => {
                  setSelectedRawId(rawId);
                  selectInInspector({ type: 'raw' });
                }}
              />
            ) : (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No Raw Data matches the filters.
              </div>
            )}
          </aside>

          <section className="flex min-h-0 flex-col">
            {selectedItem ? (
              <>
                <div className="flex min-h-0 flex-1 flex-col border-b border-border bg-background px-4 py-3">
                  <div className="mb-2 shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Pipeline Execution Matrix
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <LineageView
                      item={selectedItem}
                      selection={selection}
                      pipelines={pipelines}
                      onSelect={(next) => {
                        selectInInspector(next);
                        // 산출물 셀(L0~L3) 클릭 시에만 우측 상세 패널을 연다.
                        // 행/잡 클릭은 하이라이트만 남기고, 이전에 열려 있던 패널은 닫는다.
                        if (next.type === 'product') {
                          openInspector();
                        } else {
                          dismissInspector();
                        }
                      }}
                      activePipelineId={selectedPipeline?.id ?? null}
                      onPipelineClick={(pipelineId) => setDiagramPipelineId(pipelineId)}
                    />
                  </div>
                </div>
                <div
                  className={cn(
                    'flex min-h-0 flex-col bg-background px-4 py-3 transition-[flex-grow] duration-300 ease-out',
                    diagramCollapsed ? 'grow-0' : 'flex-1',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setDiagramCollapsed((v) => !v)}
                    className="-mx-1 flex w-full flex-wrap items-center gap-2 rounded px-1 py-1 text-left transition-colors hover:bg-muted/40"
                    title={diagramCollapsed ? 'Expand diagram' : 'Collapse diagram'}
                    aria-expanded={!diagramCollapsed}
                  >
                    <ChevronDown
                      className={cn(
                        'h-3 w-3 text-muted-foreground transition-transform duration-300 ease-out',
                        !diagramCollapsed && 'rotate-180',
                      )}
                    />
                    <span className="text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-muted-foreground">
                      Pipeline Diagram
                    </span>
                    {selectedPipeline && (
                      <span className="text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-foreground">
                        {selectedPipeline.name}
                      </span>
                    )}
                    {!diagramCollapsed && rawPipelineOptions.length > 1 && (
                      <span className="text-[10px] leading-none text-muted-foreground">
                        Click a Pipeline cell to switch
                      </span>
                    )}
                  </button>
                  <div
                    className={cn(
                      'grid min-h-0 flex-1 transition-[grid-template-rows,margin-top,opacity] duration-300 ease-out',
                      diagramCollapsed ? 'mt-0 grid-rows-[0fr] opacity-0' : 'mt-2 grid-rows-[1fr] opacity-100',
                    )}
                  >
                    <div className="min-h-0 overflow-hidden">
                      {graphSteps.length > 0 && selectedPipeline ? (
                        <div className="h-full overflow-hidden rounded-md border border-border bg-card">
                          <CanvasGraph
                            key={`catalog-${selectedItem.raw.id}-${selectedPipeline.id}`}
                            pipelineId={`catalog-${selectedItem.raw.id}-${selectedPipeline.id}`}
                            steps={graphSteps}
                            pipelineEdges={selectedPipeline.edges}
                            editable={false}
                            isJobMode
                            showGlow={false}
                            showMinimap={false}
                          />
                        </div>
                      ) : (
                        <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border bg-card text-[11px] text-muted-foreground">
                          {selectedItem.jobs.length === 0
                            ? 'No pipeline has been triggered for this Raw Data yet.'
                            : 'Pipeline definition unavailable.'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <EmptyInspector title="No Data" description="Adjust the filters or check the Raw Data reception status." />
            )}
          </section>

          {selectedItem && inspectorMounted && (
            <aside
              className={cn(
                'absolute inset-y-0 right-0 z-20 flex w-[420px] min-h-0 flex-col border-l border-border bg-card shadow-2xl transition-all duration-200 ease-out',
                inspectorAnimating ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0',
              )}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setInspectorTab('raw')}
                    className={cn(
                      'rounded px-2 py-1 text-[11px] font-semibold transition-colors',
                      inspectorTab === 'raw'
                        ? 'bg-accent/10 text-accent'
                        : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                    )}
                  >
                    Raw Data
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorTab('result')}
                    className={cn(
                      'rounded px-2 py-1 text-[11px] font-semibold transition-colors',
                      inspectorTab === 'result'
                        ? 'bg-accent/10 text-accent'
                        : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                    )}
                  >
                    Result
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => closeInspector()}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                  aria-label="Close inspector"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <Inspector
                  item={selectedItem}
                  tab={inspectorTab}
                  selection={selection}
                  onSelect={selectInInspector}
                  onDownloadProduct={(product) => void handleDownloadProduct(product)}
                  onReprocessProduct={(product) => void handleReprocessProduct(product)}
                />
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
