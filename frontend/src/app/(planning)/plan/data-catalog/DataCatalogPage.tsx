'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ElementType } from 'react';
import { usePathname } from 'next/navigation';
import LeftSidebar from '@/components/panels/LeftSidebar';
import ProductsView from '@/app/(planning)/plan/products/ProductsView';
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

const LEVELS: ProductLevel[] = ['LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];
type CatalogPageTab = 'lineage' | 'production';
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
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-foreground">{item.raw.title}</div>
                <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{item.raw.id}</div>
              </div>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {formatFileSize(item.raw.fileSizeBytes)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span>{item.raw.satelliteId} / {item.raw.mode}</span>
              <span>{formatRelativeTime(item.raw.receivedAt)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// === Variation C — Subway map ===
// Raw = interchange. Each pipeline run (job) = one horizontal lane.
// Each lane terminates at its pipeline's target level (L0-only / L0-L1 / L0-L1-L2 / L0-L1-L2-L3).
// Solid line up to the last produced level, dashed continuation to the target if still running,
// or no line at all past the last produced level if the run is done.

const SUBWAY_LEVEL_HEAD: { key: 'RAW' | ProductLevel; label: string; hint: string; color: string }[] = [
  { key: 'RAW',     label: 'RAW', hint: '위성 원시 데이터',     color: '#0C1E33' },
  { key: 'LEVEL_0', label: 'L0',  hint: 'HDF5 패키징',          color: '#029FE7' },
  { key: 'LEVEL_1', label: 'L1',  hint: '기하 보정 / 단일 룩',  color: '#2B7FFF' },
  { key: 'LEVEL_2', label: 'L2',  hint: '지오레퍼런싱',         color: '#8E51FF' },
  { key: 'LEVEL_3', label: 'L3',  hint: '분석 준비 산출물',     color: '#64117E' },
];

const SUBWAY_LEVELS_ORDERED: ProductLevel[] = ['LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];
const LEVEL_TO_IDX: Record<ProductLevel, number> = { LEVEL_0: 0, LEVEL_1: 1, LEVEL_2: 2, LEVEL_3: 3 };

/**
 * 노선 색은 도달 레벨로 결정한다 (의미 기반 컬러):
 *  - L3 도달 → 초록
 *  - L1 또는 L2 도달 → 파랑
 *  - L0 까지 도달 → 보라
 *  - 아무 산출물 없음 → muted
 */
const SUBWAY_LEVEL_COLOR: Record<number, string> = {
  3: '#04B58B',
  2: '#2B7FFF',
  1: '#2B7FFF',
  0: '#8E51FF',
};
function colorForRun(run: LineageRun): string {
  const idx = run.lastProducedIdx;
  return SUBWAY_LEVEL_COLOR[idx] ?? '#94A3B8';
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

type LineageViewMode = 'subway' | 'table';
type LineageStatusFilter = 'all' | RunStatus;
type LineageLevelFilter = 'all' | ProductLevel;

function LineageView({
  item,
  selection,
  pipelines,
  view,
  onViewChange,
  onSelect,
}: {
  item: LineageItem;
  selection: InspectorSelection;
  pipelines: PipelineDefinition[];
  view: LineageViewMode;
  onViewChange: (value: LineageViewMode) => void;
  onSelect: (selection: InspectorSelection) => void;
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LineageStatusFilter>('all');
  const [levelFilter, setLevelFilter] = useState<LineageLevelFilter>('all');
  const [isolate, setIsolate] = useState(false);

  const allRuns = useMemo(() => buildLineageRuns(item, pipelines), [item, pipelines]);
  const activeJobId = activeJobIdFromSelection(selection, item);

  const filteredRuns = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRuns.filter((run) => {
      if (isolate && activeJobId && run.job.jobId !== activeJobId) return false;
      if (statusFilter !== 'all' && run.status !== statusFilter) return false;
      if (levelFilter !== 'all' && !run.productByLevel.has(levelFilter)) return false;
      if (q) {
        const haystack =
          `${run.pipelineName} ${run.job.jobId} ${run.products.map((p) => p.id).join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allRuns, query, statusFilter, levelFilter, isolate, activeJobId]);

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
        isolate={isolate}
        onIsolateChange={setIsolate}
        canIsolate={Boolean(activeJobId)}
        view={view}
        onViewChange={onViewChange}
        totalRuns={allRuns.length}
        visibleRuns={filteredRuns.length}
      />

      {filteredRuns.length === 0 && allRuns.length > 0 ? (
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border bg-card text-[12px] text-muted-foreground">
          필터에 맞는 노선이 없습니다.
        </div>
      ) : view === 'subway' ? (
        <SubwayLineage
          item={item}
          runs={filteredRuns}
          selection={selection}
          activeJobId={activeJobId}
          onSelect={onSelect}
        />
      ) : (
        <RunsTable
          runs={filteredRuns}
          activeJobId={activeJobId}
          onSelect={onSelect}
        />
      )}

      {/* Stats strip */}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border bg-card px-4 py-3">
        <SubwayStat num={allRuns.length} label="실행 / 노선" />
        <SubwayStat num={completedCount} label="완료 산출물" tone="text-success" />
        <SubwayStat num={runningCount} label="진행 중" tone="text-accent" />
        <SubwayStat num={pendingCount} label="대기" />
        {failedCount > 0 && <SubwayStat num={failedCount} label="실패" tone="text-destructive" />}
        <div className="flex-1" />
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            선택된 Raw
          </div>
          <div className="mt-0.5 truncate font-mono text-xs font-semibold text-foreground">
            {item.raw.title}
          </div>
        </div>
      </div>
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
  isolate,
  onIsolateChange,
  canIsolate,
  view,
  onViewChange,
  totalRuns,
  visibleRuns,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: LineageStatusFilter;
  onStatusChange: (value: LineageStatusFilter) => void;
  levelFilter: LineageLevelFilter;
  onLevelChange: (value: LineageLevelFilter) => void;
  isolate: boolean;
  onIsolateChange: (value: boolean) => void;
  canIsolate: boolean;
  view: LineageViewMode;
  onViewChange: (value: LineageViewMode) => void;
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
          placeholder="파이프라인 / Job / Product 검색"
          className="h-8 w-60 rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none focus:border-accent"
        />
      </div>
      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as LineageStatusFilter)}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-accent"
      >
        <option value="all">상태 · 전체</option>
        <option value="running">진행 중</option>
        <option value="completed">완료</option>
        <option value="failed">실패</option>
      </select>
      <select
        value={levelFilter}
        onChange={(e) => onLevelChange(e.target.value as LineageLevelFilter)}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-accent"
      >
        <option value="all">도달 레벨 · 전체</option>
        {SUBWAY_LEVELS_ORDERED.map((level) => (
          <option key={level} value={level}>
            {PRODUCT_LEVEL_LABELS[level]} 도달
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onIsolateChange(!isolate)}
        disabled={!canIsolate && !isolate}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
          isolate
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-border bg-background text-foreground hover:border-accent/50',
          !canIsolate && !isolate && 'cursor-not-allowed opacity-50',
        )}
        title={canIsolate ? '선택된 노선만 보기' : '먼저 노선을 선택하세요'}
      >
        <Eye className="h-3.5 w-3.5" />
        이것만 보기
      </button>
      <div className="flex h-8 items-center rounded-md border border-border bg-background p-0.5">
        <button
          type="button"
          onClick={() => onViewChange('subway')}
          className={cn(
            'rounded px-2 py-1 text-xs font-medium transition-colors',
            view === 'subway'
              ? 'bg-accent/15 text-accent'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Subway
        </button>
        <button
          type="button"
          onClick={() => onViewChange('table')}
          className={cn(
            'rounded px-2 py-1 text-xs font-medium transition-colors',
            view === 'table'
              ? 'bg-accent/15 text-accent'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Table
        </button>
      </div>
      <div className="ml-auto text-[11px] text-muted-foreground">
        {visibleRuns === totalRuns ? `${totalRuns} runs` : `${visibleRuns} / ${totalRuns} runs`}
      </div>
    </div>
  );
}

function SubwayLineage({
  item,
  runs,
  selection,
  activeJobId,
  onSelect,
}: {
  item: LineageItem;
  runs: LineageRun[];
  selection: InspectorSelection;
  activeJobId: string | undefined;
  onSelect: (selection: InspectorSelection) => void;
}) {
  // SVG layout (matches design: viewBox 980 wide)
  const W = 980;
  const leftPad = 80;
  const rightPad = 70;
  const colWidth = (W - leftPad - rightPad) / 4;
  const stationX = (idx: number) => leftPad + idx * colWidth; // 0=RAW, 1=L0, ..., 4=L3
  const rawY = 96;
  const laneStart = 200;
  const laneGap = 132;
  const H = laneStart + laneGap * Math.max(runs.length, 1) + 16;

  const rawActive = selection.type === 'raw';

  return (
    <div>
      <div className="rounded-md border border-border bg-card p-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          preserveAspectRatio="xMidYMin meet"
          style={{ maxHeight: laneGap * Math.max(runs.length, 1) + 240 }}
        >
          <defs>
            <linearGradient id="sw-raw-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#029FE7" />
              <stop offset="100%" stopColor="#64117E" />
            </linearGradient>
          </defs>

          {/* Vertical column guides + level headers */}
          {SUBWAY_LEVEL_HEAD.map((meta, idx) => (
            <g key={meta.key}>
              <line
                x1={stationX(idx)}
                y1={50}
                x2={stationX(idx)}
                y2={H - 8}
                stroke="hsl(var(--border))"
                strokeWidth="1"
                strokeDasharray="2 4"
              />
              <text
                x={stationX(idx)}
                y={32}
                textAnchor="middle"
                fontWeight={700}
                fontSize="12"
                fill={meta.color}
                letterSpacing="0.05em"
              >
                {meta.label}
              </text>
              <text
                x={stationX(idx)}
                y={48}
                textAnchor="middle"
                fontSize="10"
                fill="hsl(var(--muted-foreground))"
              >
                {meta.hint}
              </text>
            </g>
          ))}

          {/* RAW interchange station */}
          <g
            onClick={() => onSelect({ type: 'raw' })}
            style={{ cursor: 'pointer' }}
          >
            {rawActive && (
              <circle
                cx={stationX(0)}
                cy={rawY}
                r="30"
                fill="none"
                stroke="#64117E"
                strokeWidth="2"
                strokeDasharray="4 3"
                opacity="0.7"
              />
            )}
            <circle cx={stationX(0)} cy={rawY} r="22" fill="url(#sw-raw-grad)" />
            <circle cx={stationX(0)} cy={rawY} r="22" fill="none" stroke="#fff" strokeWidth="3" />
            <text
              x={stationX(0)}
              y={rawY + 4}
              textAnchor="middle"
              fontWeight={700}
              fontSize="11"
              fill="#fff"
            >
              RAW
            </text>
            <text
              x={stationX(0)}
              y={rawY + 42}
              textAnchor="middle"
              fontSize="10"
              fontWeight={600}
              fill="hsl(var(--foreground))"
            >
              {item.raw.satelliteId} · {item.raw.mode}
            </text>
            <text
              x={stationX(0)}
              y={rawY + 56}
              textAnchor="middle"
              fontSize="10"
              fill="hsl(var(--muted-foreground))"
            >
              {formatFileSize(item.raw.fileSizeBytes)}
            </text>
          </g>

          {runs.length === 0 && (
            <g>
              <text
                x={W / 2}
                y={laneStart + 30}
                textAnchor="middle"
                fontSize="13"
                fontWeight={600}
                fill="hsl(var(--muted-foreground))"
              >
                아직 파이프라인이 실행되지 않았습니다.
              </text>
              <text
                x={W / 2}
                y={laneStart + 50}
                textAnchor="middle"
                fontSize="11"
                fill="hsl(var(--muted-foreground))"
              >
                Raw에서 파이프라인을 실행하면 노선이 추가됩니다.
              </text>
            </g>
          )}

          {/*
            3-패스 렌더로 z-order 제어:
              (A) 도너 커넥터 + RAW 곡선 + 가로 lane 라인 (가장 아래)
              (B) 카드 + 텍스트 (lane label, run header, station 카드 — 라인 위)
              (C) station 원과 레벨 라벨 (가장 위)
          */}

          {/* PASS A: 도너 커넥터 + RAW 곡선 + 가로 lane 라인 */}
          {runs.map((run, idx) => {
            const y = laneStart + idx * laneGap;
            const color = colorForRun(run);
            const xRaw = stationX(0);
            const laneFirstIdx = run.isPartial && run.inputLevelIdx >= 0 ? run.inputLevelIdx : 0;
            const xLaneStart = stationX(laneFirstIdx + 1);
            const xLastProduced = run.lastProducedIdx >= 0 ? stationX(run.lastProducedIdx + 1) : null;
            const xTerminal = stationX(run.terminalIdx + 1);
            const isActive = activeJobId === run.job.jobId;
            const dim = activeJobId !== undefined && !isActive;
            const baseStrokeW = isActive ? 7 : 6;

            // 부분 재처리: 같은 RAW 안에서 입력 레벨을 COMPLETED로 산출한 노선(=donor)을 찾아 connector 표기.
            let donorIdx = -1;
            if (run.isPartial && run.inputLevelIdx >= 0) {
              const inputLevel = SUBWAY_LEVELS_ORDERED[run.inputLevelIdx];
              for (let j = 0; j < runs.length; j++) {
                if (j === idx) continue;
                const cand = runs[j].productByLevel.get(inputLevel);
                if (cand && cand.status === 'COMPLETED') {
                  donorIdx = j;
                  break;
                }
              }
            }
            const donorY = donorIdx >= 0 ? laneStart + donorIdx * laneGap : null;
            const donorColor = donorIdx >= 0 ? colorForRun(runs[donorIdx]!) : color;

            const showRawCurve = !(run.isPartial && donorIdx >= 0);
            const curveD = `M ${xRaw} ${rawY + 22} C ${xRaw} ${y - 26}, ${xLaneStart - 60} ${y}, ${xLaneStart} ${y}`;
            const curveDashed = run.lastProducedIdx === -1;

            const solidD =
              xLastProduced !== null && xLastProduced > xLaneStart
                ? `M ${xLaneStart} ${y} L ${xLastProduced} ${y}`
                : null;
            const dashedStartX = xLastProduced ?? xLaneStart;
            const dashedD =
              !run.isDone && xTerminal > dashedStartX
                ? `M ${dashedStartX} ${y} L ${xTerminal} ${y}`
                : null;

            return (
              <g key={`${run.job.jobId}-lines`} opacity={dim ? 0.4 : 1}>
                {donorY !== null && (
                  <path
                    d={`M ${xLaneStart} ${donorY + 16} C ${xLaneStart + 30} ${(donorY + y) / 2}, ${xLaneStart - 30} ${(donorY + y) / 2}, ${xLaneStart} ${y - 16}`}
                    stroke={donorColor}
                    strokeWidth={3}
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                    fill="none"
                    opacity={0.7}
                  />
                )}
                {showRawCurve && (
                  <path
                    d={curveD}
                    stroke={color}
                    strokeWidth={baseStrokeW}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={run.isPartial || curveDashed ? '8 6' : undefined}
                    opacity={run.isPartial ? 0.45 : curveDashed ? 0.55 : isActive ? 1 : 0.88}
                  />
                )}
                {solidD && (
                  <path
                    d={solidD}
                    stroke={color}
                    strokeWidth={baseStrokeW}
                    fill="none"
                    strokeLinecap="round"
                    opacity={isActive ? 1 : 0.88}
                  />
                )}
                {dashedD && (
                  <path
                    d={dashedD}
                    stroke={color}
                    strokeWidth={baseStrokeW - 1}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray="8 6"
                    opacity={0.5}
                  />
                )}
              </g>
            );
          })}

          {/* PASS B: 카드 + 텍스트 (라인 위) */}
          {runs.map((run, idx) => {
            const y = laneStart + idx * laneGap;
            const color = colorForRun(run);
            const laneFirstIdx = run.isPartial && run.inputLevelIdx >= 0 ? run.inputLevelIdx : 0;
            const isActive = activeJobId === run.job.jobId;
            const dim = activeJobId !== undefined && !isActive;
            return (
              <g key={`${run.job.jobId}-cards`} opacity={dim ? 0.4 : 1}>
                {/* Lane label */}
                <g
                  transform={`translate(8, ${y - 22})`}
                  onClick={() => onSelect({ type: 'job', jobId: run.job.jobId })}
                  style={{ cursor: 'pointer' }}
                >
                  <rect width={64} height={44} rx={6} fill={color} fillOpacity={isActive ? 0.2 : 0.1} />
                  <text x={32} y={18} textAnchor="middle" fontWeight={700} fontSize="9" fill={color}>
                    {run.job.jobId.replace(/^JOB-/, 'J')}
                  </text>
                  <text
                    x={32}
                    y={32}
                    textAnchor="middle"
                    fontWeight={600}
                    fontSize="8"
                    fill={color}
                    letterSpacing="0.06em"
                  >
                    {run.isPartial ? '재처리' : 'PRIMARY'}
                  </text>
                </g>

                {/* Run header above lane */}
                <text
                  x={leftPad + 92}
                  y={y - 32}
                  fontWeight={700}
                  fontSize="13"
                  fill="hsl(var(--foreground))"
                >
                  {run.pipelineName}
                </text>
                <text
                  x={leftPad + 92}
                  y={y - 18}
                  fontWeight={500}
                  fontSize="10"
                  fill="hsl(var(--muted-foreground))"
                >
                  {run.job.jobId} · {formatKST(run.job.startedAt)} · 목표 {' '}
                  {run.pipelineTargetIdx >= 0
                    ? PRODUCT_LEVEL_LABELS[SUBWAY_LEVELS_ORDERED[run.pipelineTargetIdx]]
                    : '—'}
                </text>

                {/* Station 카드 (배경 흰색). 카드 위에 라인이 오도록 PASS A에서 먼저 렌더 */}
                {SUBWAY_LEVELS_ORDERED.slice(laneFirstIdx, run.terminalIdx + 1).map((level) => {
                  const levelIdx = LEVEL_TO_IDX[level];
                  const sx = stationX(levelIdx + 1);
                  const product = run.productByLevel.get(level);
                  const isInput = run.isPartial && levelIdx === run.inputLevelIdx && !product;
                  const isFailed = product?.status === 'FAILED';
                  const isProductActive =
                    selection.type === 'product' && selection.productId === product?.id;

                  if (isInput) {
                    return (
                      <g
                        key={level}
                        transform={`translate(${sx - 50}, ${y + 24})`}
                        style={{ cursor: 'default' }}
                      >
                        <rect
                          width="100"
                          height="40"
                          rx="6"
                          fill="#ffffff"
                          stroke={color}
                          strokeOpacity="0.55"
                          strokeWidth="1"
                          strokeDasharray="3 2"
                        />
                        <text
                          x="50"
                          y="18"
                          textAnchor="middle"
                          fontSize="9"
                          fontWeight={700}
                          fill={color}
                          letterSpacing="0.08em"
                        >
                          INPUT
                        </text>
                        <text
                          x="50"
                          y="32"
                          textAnchor="middle"
                          fontSize="8"
                          fill="#6b7280"
                        >
                          이전 실행 결과
                        </text>
                      </g>
                    );
                  }
                  if (product) {
                    return (
                      <g
                        key={level}
                        transform={`translate(${sx - 72}, ${y + 24})`}
                        onClick={() => onSelect({ type: 'product', productId: product.id })}
                        style={{ cursor: 'pointer' }}
                      >
                        <rect
                          width="144"
                          height="62"
                          rx="6"
                          fill="#ffffff"
                          stroke={isFailed ? '#EB5757' : color}
                          strokeOpacity={isProductActive ? 0.65 : 0.28}
                          strokeWidth="1"
                        />
                        <text
                          x="9"
                          y="15"
                          fontWeight={600}
                          fontSize="8.5"
                          fill={isFailed ? '#EB5757' : color}
                          letterSpacing="0.05em"
                        >
                          {product.status}
                        </text>
                        <text x="9" y="31" fontSize="9" fontWeight={500} fill="#111827">
                          {product.id.length > 22 ? product.id.slice(0, 22) + '…' : product.id}
                        </text>
                        <text x="9" y="45" fontSize="9" fill="#6b7280">
                          {product.satelliteId} · {product.mode}
                        </text>
                        <text x="9" y="58" fontSize="8" fill="#6b7280">
                          {formatRelativeTime(product.createdAt)}
                        </text>
                      </g>
                    );
                  }
                  return (
                    <g key={level} transform={`translate(${sx - 50}, ${y + 24})`}>
                      <rect
                        width="100"
                        height="40"
                        rx="6"
                        fill="#ffffff"
                        stroke="hsl(var(--muted-foreground))"
                        strokeOpacity="0.55"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                      <text
                        x="50"
                        y="18"
                        textAnchor="middle"
                        fontSize="10"
                        fill="hsl(var(--muted-foreground))"
                        fontStyle="italic"
                      >
                        미생성
                      </text>
                      <text x="50" y="32" textAnchor="middle" fontSize="8" fill="hsl(var(--muted-foreground))">
                        {PRODUCT_LEVEL_LABELS[level]}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* PASS C: station 원 + 레벨 라벨 (가장 위) */}
          {runs.map((run, idx) => {
            const y = laneStart + idx * laneGap;
            const color = colorForRun(run);
            const laneFirstIdx = run.isPartial && run.inputLevelIdx >= 0 ? run.inputLevelIdx : 0;
            const isActive = activeJobId === run.job.jobId;
            const dim = activeJobId !== undefined && !isActive;
            return (
              <g key={`${run.job.jobId}-circles`} opacity={dim ? 0.4 : 1}>
                {SUBWAY_LEVELS_ORDERED.slice(laneFirstIdx, run.terminalIdx + 1).map((level) => {
                  const levelIdx = LEVEL_TO_IDX[level];
                  const sx = stationX(levelIdx + 1);
                  const product = run.productByLevel.get(level);
                  const isInput = run.isPartial && levelIdx === run.inputLevelIdx && !product;
                  const isPending = !product && !isInput;
                  const isRunning = product?.status === 'PROCESSING';
                  const isFailed = product?.status === 'FAILED';
                  const isProductActive =
                    selection.type === 'product' && selection.productId === product?.id;

                  return (
                    <g
                      key={level}
                      onClick={
                        product
                          ? () => onSelect({ type: 'product', productId: product.id })
                          : undefined
                      }
                      style={{ cursor: product ? 'pointer' : 'default' }}
                    >
                      {isProductActive && (
                        <circle cx={sx} cy={y} r="22" fill="none" stroke={color} strokeWidth="2" />
                      )}
                      <circle
                        cx={sx}
                        cy={y}
                        r="14"
                        fill="#ffffff"
                        stroke={
                          isFailed ? '#EB5757' : isInput ? color : isPending ? 'hsl(var(--muted-foreground))' : color
                        }
                        strokeWidth={isInput ? 2 : isPending ? 2.2 : 3.5}
                        strokeDasharray={isInput ? '3 2' : isPending ? '4 3' : undefined}
                        opacity={isInput ? 0.7 : isPending ? 0.85 : 1}
                      />
                      {isRunning && (
                        <circle cx={sx} cy={y} r="14" fill="none" stroke={color} strokeWidth="2" opacity="0.5">
                          <animate
                            attributeName="r"
                            values="14;22;14"
                            dur="1.6s"
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            values="0.6;0;0.6"
                            dur="1.6s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}
                      <text
                        x={sx}
                        y={y + 4}
                        textAnchor="middle"
                        fontWeight={700}
                        fontSize="10"
                        fill={
                          isInput
                            ? color
                            : isPending
                              ? 'hsl(var(--muted-foreground))'
                              : isFailed
                                ? '#EB5757'
                                : color
                        }
                      >
                        {PRODUCT_LEVEL_LABELS[level].replace('Level-', 'L')}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function RunsTable({
  runs,
  activeJobId,
  onSelect,
}: {
  runs: LineageRun[];
  activeJobId: string | undefined;
  onSelect: (selection: InspectorSelection) => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/35 text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Run</th>
            <th className="px-3 py-2 font-medium">Pipeline</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Reach</th>
            <th className="px-3 py-2 font-medium">Target</th>
            <th className="px-3 py-2 text-center font-medium">L0</th>
            <th className="px-3 py-2 text-center font-medium">L1</th>
            <th className="px-3 py-2 text-center font-medium">L2</th>
            <th className="px-3 py-2 text-center font-medium">L3</th>
            <th className="px-3 py-2 font-medium">Started</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
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
                      style={{ background: color }}
                    />
                    <span className="font-mono text-[11px] font-semibold text-foreground">
                      {run.job.jobId}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 font-medium text-foreground">{run.pipelineName}</td>
                <td className="px-3 py-2">
                  <RunStatusBadge status={run.status} />
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-foreground">
                  {run.lastProducedIdx >= 0
                    ? PRODUCT_LEVEL_LABELS[SUBWAY_LEVELS_ORDERED[run.lastProducedIdx]]
                    : '—'}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  {run.pipelineTargetIdx >= 0
                    ? PRODUCT_LEVEL_LABELS[SUBWAY_LEVELS_ORDERED[run.pipelineTargetIdx]]
                    : '—'}
                </td>
                {SUBWAY_LEVELS_ORDERED.map((level) => {
                  const levelIdx = LEVEL_TO_IDX[level];
                  const product = run.productByLevel.get(level);
                  const laneFirstIdx = run.isPartial && run.inputLevelIdx >= 0 ? run.inputLevelIdx : 0;
                  const inRange = levelIdx >= laneFirstIdx && levelIdx <= run.terminalIdx;
                  const isInput =
                    run.isPartial &&
                    levelIdx === run.inputLevelIdx &&
                    !product;
                  return (
                    <td
                      key={level}
                      className="px-3 py-2 text-center"
                      onClick={
                        product
                          ? (e) => {
                              e.stopPropagation();
                              onSelect({ type: 'product', productId: product.id });
                            }
                          : undefined
                      }
                    >
                      <RunCellDot product={product} inRange={inRange} isInput={isInput} color={color} />
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-[11px] text-muted-foreground">
                  {formatRelativeTime(run.job.startedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
}: {
  product: Product | undefined;
  inRange: boolean;
  isInput?: boolean;
  color: string;
}) {
  if (!inRange) {
    return <span className="text-[10px] text-muted-foreground/40">·</span>;
  }
  if (isInput) {
    return (
      <span
        className="mx-auto inline-block rounded px-1 py-0.5 text-[8px] font-bold tracking-wider"
        style={{ color, border: `1px dashed ${color}`, opacity: 0.7 }}
        title="이전 실행 결과 입력"
      >
        IN
      </span>
    );
  }
  if (!product) {
    return (
      <span
        className="mx-auto inline-block h-3.5 w-3.5 rounded-full border border-dashed"
        style={{ borderColor: 'hsl(var(--muted-foreground) / 0.6)' }}
        title="미생성"
      />
    );
  }
  if (product.status === 'PROCESSING') {
    return (
      <span
        className="mx-auto inline-block h-3.5 w-3.5 animate-pulse rounded-full"
        style={{ background: color, opacity: 0.85 }}
        title="진행 중"
      />
    );
  }
  if (product.status === 'FAILED') {
    return (
      <span
        className="mx-auto inline-block h-3.5 w-3.5 rounded-full"
        style={{ background: '#EB5757' }}
        title="실패"
      />
    );
  }
  return (
    <span
      className="mx-auto inline-block h-3.5 w-3.5 rounded-full"
      style={{ background: color }}
      title="완료"
    />
  );
}

function SubwayStat({ num, label, tone }: { num: number; label: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className={cn('text-xl font-bold tabular-nums leading-none text-foreground', tone)}>{num}</div>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
    </div>
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
  const [levelFilter, setLevelFilter] = useState<ProductLevel | 'all'>('all');
  const [pageTab, setPageTab] = useState<CatalogPageTab>('lineage');
  const [inspectorMounted, setInspectorMounted] = useState(true);
  const [inspectorAnimating, setInspectorAnimating] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('raw');
  const [selectedRawId, setSelectedRawId] = useState<string | null>(null);
  const [selection, setSelection] = useState<InspectorSelection>({ type: 'raw' });
  const [lineageView, setLineageView] = useState<LineageViewMode>('subway');
  const [diagramPipelineId, setDiagramPipelineId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [rawRes, hdf5Res, productRes, jobRes, plRes, plArchRes] = await Promise.all([
      service.원시데이터_목록을_조회한다({ limit: 500 }),
      service.HDF5_애트리뷰트_목록을_조회한다(),
      service.제품_목록을_조회한다({ limit: 500 }),
      service.Job_목록을_조회한다({ limit: 500 }),
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
  }
  function selectInInspector(next: InspectorSelection) {
    setSelection(next);
    setInspectorTab(next.type === 'raw' ? 'raw' : 'result');
  }

  const lineage = useMemo(() => buildLineage(rawData, hdf5Files, products, jobs), [rawData, hdf5Files, products, jobs]);
  const filteredLineage = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = lineage.filter((item) => {
      const matchesQuery = !normalized || [
        item.raw.id,
        item.raw.title,
        item.raw.rawDataPath,
        ...item.hdf5Files.map((file) => file.fileName),
        ...item.products.map((product) => product.id),
        ...item.jobs.map((job) => job.jobId),
      ].some((value) => value.toLowerCase().includes(normalized));
      const matchesLevel = levelFilter === 'all' || item.products.some((product) => product.level === levelFilter);
      return matchesQuery && matchesLevel;
    });
    return [...filtered].sort((a, b) => a.raw.capturedAt.localeCompare(b.raw.capturedAt));
  }, [lineage, levelFilter, query]);

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

    const pipelineFromJobId = (jobId: string | undefined) => {
      if (!jobId) return null;
      const job = selectedItem.jobs.find((j) => j.jobId === jobId);
      return job ? pipelines.find((p) => p.id === job.pipelineId) ?? null : null;
    };

    // When the user picks a stage card / chain segment, follow that selection.
    // Multi-pipeline lineages can have a different pipeline per level, so the
    // diagram should mirror whichever artifact is currently inspected.
    if (selection.type === 'product') {
      const product = selectedItem.products.find((p) => p.id === selection.productId);
      const pipeline = pipelineFromJobId(product?.jobId);
      if (pipeline) return pipeline;
    }
    if (selection.type === 'job') {
      const pipeline = pipelineFromJobId(selection.jobId);
      if (pipeline) return pipeline;
    }
    if (selection.type === 'hdf5') {
      const l0Product = selectedItem.products.find((p) => p.level === 'LEVEL_0');
      const pipeline = pipelineFromJobId(l0Product?.jobId);
      if (pipeline) return pipeline;
    }

    // Fallbacks for the raw stage / unmatched selections.
    if (levelFilter !== 'all') {
      const matchingProduct = selectedItem.products.find((p) => p.level === levelFilter);
      const pipeline = pipelineFromJobId(matchingProduct?.jobId);
      if (pipeline) return pipeline;
    }

    const firstJob = selectedItem.jobs[0];
    return firstJob ? pipelines.find((p) => p.id === firstJob.pipelineId) ?? null : null;
  }, [selectedItem, pipelines, levelFilter, selection, diagramPipelineId]);

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
        <div className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-3 py-2">
          <button
            type="button"
            onClick={() => setPageTab('lineage')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              pageTab === 'lineage'
                ? 'bg-accent/10 text-accent'
                : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
            )}
          >
            <Database className="h-3.5 w-3.5" />
            Data Catalog
          </button>
          <button
            type="button"
            onClick={() => setPageTab('production')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              pageTab === 'production'
                ? 'bg-accent/10 text-accent'
                : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
            )}
          >
            <Package className="h-3.5 w-3.5" />
            Productions
          </button>
        </div>
        {pageTab === 'production' ? (
          <ProductsView />
        ) : (
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
              <select
                value={levelFilter}
                onChange={(event) => setLevelFilter(event.target.value as ProductLevel | 'all')}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-accent"
              >
                <option value="all">All levels reached</option>
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    Reached {PRODUCT_LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
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
                <div className="border-b border-border bg-background px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Lineage · Subway map
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      노선 = 파이프라인 실행 · 역 = 산출물 · 점선 = 미생성
                    </div>
                  </div>
                  <LineageView
                    item={selectedItem}
                    selection={selection}
                    pipelines={pipelines}
                    view={lineageView}
                    onViewChange={setLineageView}
                    onSelect={(next) => {
                      selectInInspector(next);
                      openInspector();
                    }}
                  />
                </div>
                {lineageView === 'table' && (
                  <div className="border-b border-border bg-background px-4 py-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Pipeline Diagram
                      </div>
                      {rawPipelineOptions.length > 1 && (
                        <select
                          value={diagramPipelineId ?? selectedPipeline?.id ?? ''}
                          onChange={(e) => setDiagramPipelineId(e.target.value || null)}
                          className="ml-2 h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-accent"
                          title="다이어그램에 표시할 파이프라인 선택"
                        >
                          {rawPipelineOptions.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      )}
                      {rawPipelineOptions.length > 1 && (
                        <span className="text-[10px] text-muted-foreground">
                          {rawPipelineOptions.length} pipelines
                        </span>
                      )}
                    </div>
                    {graphSteps.length > 0 && selectedPipeline ? (
                      <div className="h-56 overflow-hidden rounded-md border border-border bg-card">
                        <CanvasGraph
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
                      <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border bg-card text-[11px] text-muted-foreground">
                        {selectedItem.jobs.length === 0
                          ? 'No pipeline has been triggered for this Raw Data yet.'
                          : 'Pipeline definition unavailable.'}
                      </div>
                    )}
                  </div>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">{selectedItem.raw.title}</h2>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {selectedItem.products.length} products / {selectedItem.jobs.length} jobs / {selectedItem.hdf5Files.length} HDF5
                      </div>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-md border border-border bg-card">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/35 text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Level</th>
                          <th className="px-3 py-2 font-medium">Product</th>
                          <th className="px-3 py-2 font-medium">Satellite</th>
                          <th className="px-3 py-2 font-medium">Mode</th>
                          <th className="px-3 py-2 font-medium">Job</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Created</th>
                          <th className="px-3 py-2 text-right font-medium">Download</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedItem.products.map((product) => (
                          <tr
                            key={product.id}
                            className="cursor-pointer border-t border-border hover:bg-muted/20"
                            onClick={() => {
                              selectInInspector({ type: 'product', productId: product.id });
                              openInspector();
                            }}
                          >
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1">
                                <span className="font-mono text-accent">{PRODUCT_LEVEL_LABELS[product.level]}</span>
                                {product.level === 'LEVEL_0' && (
                                  <span className="rounded bg-muted px-1 py-px text-[9px] font-semibold text-muted-foreground">HDF5</span>
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-semibold text-foreground">{product.id}</td>
                            <td className="px-3 py-2 text-foreground">{product.satelliteId}</td>
                            <td className="px-3 py-2 text-foreground">{product.mode}</td>
                            <td className="px-3 py-2 font-mono text-muted-foreground">{product.jobId}</td>
                            <td className="px-3 py-2"><ProductStatusBadge status={product.status} /></td>
                            <td className="px-3 py-2 text-muted-foreground">{formatKST(product.createdAt)}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (product.status === 'COMPLETED') void handleDownloadProduct(product);
                                }}
                                disabled={product.status !== 'COMPLETED'}
                                className={cn(
                                  'inline-flex items-center justify-center rounded p-1 transition-colors',
                                  product.status === 'COMPLETED'
                                    ? 'text-muted-foreground hover:bg-muted/40 hover:text-accent'
                                    : 'cursor-not-allowed text-muted-foreground/30',
                                )}
                                title={product.status === 'COMPLETED' ? 'Download' : 'Not available'}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {selectedItem.products.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                              No products have been generated yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
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
        )}
      </main>
    </div>
  );
}
