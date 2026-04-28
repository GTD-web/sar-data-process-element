'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Background, BackgroundVariant, Controls, ReactFlow, type Edge, type EdgeTypes, type Node, type NodeTypes, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import LeftSidebar from '@/components/panels/LeftSidebar';
import { useMockRole } from '@/components/auth/RolePreviewSelect';
import { DeletableEdge, type DeletableEdgeData } from '@/components/graph/DeletableEdge';
import { PipelineNode, type PipelineNodeData } from '@/components/graph/PipelineNode';
import { cn, formatRelativeTime } from '@/lib/utils';
import * as t from '@/styles/design-tokens';
import type {
  JobDetail,
  JobStatus,
  JobSummary,
  PipelineEdge,
  PipelineDefinition,
  PipelineStepDefinition,
  ProductLevel,
  SarStage,
  StepStatus,
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
  AlertTriangle,
  Check,
  Filter,
  GitBranch,
  Layers,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

type NodeMetric = {
  order: number;
  depth: number;
  lane: number;
  kind: PipelineStepDefinition['kind'];
  sarStage?: SarStage;
  inputLevel?: ProductLevel;
  enabledTasks?: string[];
  label: string;
  subLabel: string;
  target: string;
  running: number;
  failed: number;
  completed: number;
  pending: number;
  total: number;
  currentStatus: StepStatus | 'IDLE';
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
  depthMetrics: DepthMetric[];
};

const ACTIVE_JOB_STATUS: JobStatus[] = ['CREATED', 'ASSIGNED'];
const MATRIX_LABEL_COLUMN_WIDTH = 92;
const DASHBOARD_FILTER_STORAGE_PREFIX = 'sdpe.dashboard.pipelineFilter';
const MATRIX_NODE_COLUMN_WIDTH = 148;
const DASHBOARD_FLOW_NODE_SIZE = 64;
const DASHBOARD_FLOW_HEIGHT = 320;
const DASHBOARD_FLOW_FIT_VIEW = { padding: 0.18, duration: 260 };

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
const dashboardNodeTypes: NodeTypes = {
  pipeline: PipelineNode,
};
const dashboardEdgeTypes: EdgeTypes = {
  deletable: DeletableEdge,
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
    setFilterMode('custom');
    setSelectedPipelineIds((prev) => {
      const baseSelection = filterMode === 'all'
        ? []
        : prev;

      return baseSelection.includes(pipelineId)
        ? baseSelection.filter((id) => id !== pipelineId)
        : [...baseSelection, pipelineId];
    });
  }, [filterMode]);

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

      <div className="flex-1 overflow-hidden bg-background">
        <main className="h-full overflow-y-auto bg-background px-8 pb-6">
          <header className="-mx-8 border-b border-border bg-card/95 py-3 backdrop-blur">
            <div className="px-5 sm:px-6 xl:px-8">
              <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch">
                <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                  <div className="rounded-xl border border-accent/20 bg-accent/10 p-2 text-accent shadow-sm">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-base font-bold text-foreground">대시보드</h1>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {currentUsername}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="rounded-full bg-muted/70 px-2 py-0.5">실행 파이프라인 {executedPipelines.length}</span>
                      <span className="rounded-full bg-muted/70 px-2 py-0.5">활성 필터 {filterSummary}</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-fit xl:justify-self-end">
                  <KpiCard className="xl:w-[174px]" label="실행 파이프라인" value={executedPipelines.length} icon={GitBranch} tone="accent" />
                  <KpiCard className="xl:w-[174px]" label="실행 중 Job" value={totalRunning} icon={Activity} tone="accent" />
                  <KpiCard className="xl:w-[174px]" label="실패 Job" value={totalFailed} icon={XCircle} tone={totalFailed > 0 ? 'danger' : 'muted'} />
                  <KpiCard className="xl:w-[174px]" label="노드 실패" value={failedNodes} icon={AlertTriangle} tone={failedNodes > 0 ? 'danger' : 'muted'} />
                </div>
              </div>
            </div>
          </header>

          <section>
            <div className="sticky top-0 z-20 -mx-8 bg-background/95 px-8 pt-3 pb-5 backdrop-blur-sm">
              <div className="grid gap-3 rounded-2xl border border-border bg-card/95 px-4 py-2.5 shadow-sm xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-xl bg-accent/10 p-1.5 text-accent">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">품질 현황 매트릭스</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="rounded-full bg-muted px-2 py-1 font-mono">{dashboard.length} visible</span>
                      <span className="rounded-full bg-muted px-2 py-1 font-mono">{pipelines.length} total</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-2 xl:items-end xl:justify-self-end">
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
    const latestJob = pipelineJobs[0];
    const topology = buildStepTopology(pipeline.steps, pipeline.edges);
    const depthMetrics = buildDepthMetrics(pipeline.steps, pipelineJobs, topology);

    return {
      pipeline,
      jobs: pipelineJobs,
      runningJobs: pipelineJobs.filter((job) => ACTIVE_JOB_STATUS.includes(job.status)).length,
      failedJobs: pipelineJobs.filter((job) => job.status === 'FAILED').length,
      completedJobs: pipelineJobs.filter((job) => job.status === 'COMPLETED').length,
      latestJob,
      nodeMetrics: pipeline.steps.map((step) => buildNodeMetric(step, pipelineJobs, latestJob, topology)),
      depthMetrics,
    };
  });
}

function buildNodeMetric(
  step: PipelineStepDefinition,
  jobs: JobDetail[],
  latestJob: JobDetail | undefined,
  topology: StepTopology,
): NodeMetric {
  const stepRuns = jobs.map((job) => job.steps.find((s) => s.order === step.order)).filter(Boolean);
  const running = stepRuns.filter((s) => s?.status === 'RUNNING').length;
  const failed = stepRuns.filter((s) => s?.status === 'FAILED').length;
  const completed = stepRuns.filter((s) => s?.status === 'COMPLETED').length;
  const pending = stepRuns.filter((s) => s?.status === 'PENDING').length;
  const currentStatus = latestJob?.steps.find((s) => s.order === step.order)?.status ?? 'IDLE';
  const quality: NodeMetric['quality'] =
    currentStatus === 'IDLE'
      ? 'idle'
      : currentStatus === 'FAILED'
        ? 'critical'
        : currentStatus === 'RUNNING'
          ? 'running'
          : currentStatus === 'PENDING' || currentStatus === 'CANCELED' || currentStatus === 'SKIPPED'
            ? 'pending'
            : 'normal';

  const { label, subLabel } = getStepPresentation(step);

  return {
    order: step.order,
    depth: topology.depthByOrder.get(step.order) ?? 0,
    lane: topology.laneByOrder.get(step.order) ?? 0,
    kind: step.kind,
    sarStage: step.sarStage,
    inputLevel: step.inputLevel,
    enabledTasks: step.enabledTasks,
    label,
    subLabel,
    target: getStepTarget(step),
    running,
    failed,
    completed,
    pending,
    total: stepRuns.length,
    currentStatus,
    quality,
  };
}

function summarizeDepthStatus(statuses: StepStatus[]): 'RUNNING' | 'FAILED' | 'COMPLETED' | 'PENDING' {
  if (statuses.some((status) => status === 'FAILED')) return 'FAILED';
  if (statuses.some((status) => status === 'RUNNING')) return 'RUNNING';
  if (statuses.every((status) => status === 'COMPLETED')) return 'COMPLETED';
  return 'PENDING';
}

function buildDepthMetrics(
  steps: PipelineStepDefinition[],
  jobs: JobDetail[],
  topology: StepTopology,
): DepthMetric[] {
  const stepOrdersByDepth = new Map<number, number[]>();

  steps.forEach((step) => {
    const depth = topology.depthByOrder.get(step.order) ?? 0;
    const bucket = stepOrdersByDepth.get(depth) ?? [];
    bucket.push(step.order);
    stepOrdersByDepth.set(depth, bucket);
  });

  return Array.from(stepOrdersByDepth.entries())
    .sort(([left], [right]) => left - right)
    .map(([depth, stepOrders]) => {
      const metric: DepthMetric = {
        depth,
        running: 0,
        failed: 0,
        completed: 0,
        pending: 0,
        total: jobs.length,
      };

      jobs.forEach((job) => {
        const statuses = stepOrders.map((order) => job.steps.find((step) => step.order === order)?.status ?? 'PENDING');
        const depthStatus = summarizeDepthStatus(statuses);

        if (depthStatus === 'FAILED') metric.failed += 1;
        else if (depthStatus === 'RUNNING') metric.running += 1;
        else if (depthStatus === 'COMPLETED') metric.completed += 1;
        else metric.pending += 1;
      });

      return metric;
    });
}

function getMatrixStageLabel(node: NodeMetric): string {
  if (node.sarStage) return node.sarStage;
  if (node.kind === 'TRIGGER') return 'TRIGGER';
  if (node.kind === 'FILE_INPUT') {
    if (node.inputLevel === 'LEVEL_0') return 'L0 INPUT';
    if (node.inputLevel === 'LEVEL_1') return 'L1 INPUT';
    if (node.inputLevel === 'LEVEL_2') return 'L2 INPUT';
    return 'FILE_INPUT';
  }
  if (node.kind === 'JOB_INIT') return 'JOB_INIT';
  if (node.kind === 'CATALOG') return 'CATALOG';
  if (node.kind === 'THUMBNAIL') return 'QUICKLOOK';
  return node.kind;
}

function getLaneQualifier(node: NodeMetric): string {
  return `Path ${String.fromCharCode(65 + (node.lane % 26))}`;
}

function getMatrixQualifier(node: NodeMetric): string | null {
  if (node.enabledTasks && node.enabledTasks.length === 1) {
    const task = node.enabledTasks[0].toLowerCase();
    if (task.includes('hh')) return 'HH';
    if (task.includes('hv')) return 'HV';
    if (task.includes('vv')) return 'VV';
    if (task.includes('vh')) return 'VH';
    if (task.includes('thumbnail') || task.includes('quicklook')) return 'Quick-look';
    if (task.includes('scene')) return 'Scene';
    if (task.includes('application') || task.includes('app')) return 'App';
    if (task.includes('map')) return 'Map';
    return node.enabledTasks[0].replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  if (node.kind === 'FILE_INPUT' && node.inputLevel) {
    return PRODUCT_LEVEL_LABELS[node.inputLevel];
  }

  return null;
}

function buildMatrixDepthGroups(nodeMetrics: NodeMetric[], depthMetrics: DepthMetric[]): MatrixDepthGroup[] {
  const grouped = new Map<number, NodeMetric[]>();
  const depthMetricMap = new Map(depthMetrics.map((metric) => [metric.depth, metric]));

  nodeMetrics.forEach((node) => {
    const bucket = grouped.get(node.depth) ?? [];
    bucket.push(node);
    grouped.set(node.depth, bucket);
  });

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left - right)
    .map(([depth, nodes]) => {
      const orderedNodes = nodes.slice().sort((left, right) => left.lane - right.lane || left.order - right.order);
      const stageCounts = new Map<string, number>();

      orderedNodes.forEach((node) => {
        const stageLabel = getMatrixStageLabel(node);
        stageCounts.set(stageLabel, (stageCounts.get(stageLabel) ?? 0) + 1);
      });

      const columns = orderedNodes.map<MatrixColumn>((node) => {
        const stageLabel = getMatrixStageLabel(node);
        const duplicateStage = (stageCounts.get(stageLabel) ?? 0) > 1;
        const qualifier = getMatrixQualifier(node) ?? (duplicateStage ? getLaneQualifier(node) : null);
        return {
          key: `depth-${depth}-node-${node.order}`,
          header: qualifier ? `${stageLabel} · ${qualifier}` : stageLabel,
          subtitle: node.label,
          target: node.target,
          metric: node,
        };
      });

      return {
        depth,
        title: columns.length > 1 ? `단계 ${depth + 1} (${columns.length}개 분기)` : `단계 ${depth + 1}`,
        subtitle: '',
        columns,
        aggregate: depthMetricMap.get(depth) ?? {
          depth,
          running: 0,
          failed: 0,
          completed: 0,
          pending: 0,
          total: 0,
        },
      };
    });
}

function getStepPresentation(step: PipelineStepDefinition): { label: string; subLabel: string } {
  if (step.kind === 'TRIGGER') {
    return { label: '원시 데이터 수신 트리거', subLabel: 'EI-01 · RAW_DATA_RECEIVED' };
  }
  if (step.kind === 'FILE_INPUT') {
    const levelStr = step.inputLevel === 'LEVEL_0' ? 'L0' : step.inputLevel === 'LEVEL_1' ? 'L1' : step.inputLevel === 'LEVEL_2' ? 'L2' : 'L?';
    return { label: `${levelStr} 결과 입력`, subLabel: 'SI-07 · 부분 재처리' };
  }
  if (step.kind === 'JOB_INIT') {
    return { label: '작업 초기화', subLabel: 'CSU-08.02 · 프로파일 선택' };
  }
  if (step.kind === 'CATALOG') {
    return { label: '카탈로그 등록', subLabel: 'CSC-07 · 등록' };
  }
  if (step.kind === 'THUMBNAIL') {
    return { label: 'Quick-look 생성', subLabel: 'CSU-07.06 · 조기 미리보기' };
  }
  if (step.kind === 'SAR' && step.sarStage) {
    return {
      label: SAR_STAGE_LABELS[step.sarStage],
      subLabel: `${step.sarStage} · ${PRODUCT_LEVEL_LABELS[SAR_STAGE_TO_LEVEL[step.sarStage]]}`,
    };
  }
  return { label: COMPACT_KIND_LABELS[step.kind] ?? step.kind, subLabel: '—' };
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

type FlowPosition = { x: number; y: number };
type StepTopology = {
  depthByOrder: Map<number, number>;
  rowByOrder: Map<number, number>;
  laneByOrder: Map<number, number>;
};
type DepthMetric = {
  depth: number;
  running: number;
  failed: number;
  completed: number;
  pending: number;
  total: number;
};
type MatrixColumn = {
  key: string;
  header: string;
  subtitle: string;
  target: string;
  metric: NodeMetric;
};
type MatrixDepthGroup = {
  depth: number;
  title: string;
  subtitle: string;
  columns: MatrixColumn[];
  aggregate: DepthMetric;
};

function buildStepTopology(steps: PipelineStepDefinition[], edges: PipelineEdge[]): StepTopology {
  const incoming = new Map<number, number[]>();
  const outgoing = new Map<number, number[]>();
  const depthByOrder = new Map<number, number>();
  const rowHints = new Map<number, number[]>();

  for (const step of steps) {
    incoming.set(step.order, []);
    outgoing.set(step.order, []);
  }

  for (const edge of edges) {
    incoming.get(edge.target)?.push(edge.source);
    outgoing.get(edge.source)?.push(edge.target);
  }

  const heads = steps
    .filter((step) => (incoming.get(step.order)?.length ?? 0) === 0)
    .map((step) => step.order)
    .sort((a, b) => a - b);

  const queue = [...heads];
  for (const head of heads) depthByOrder.set(head, 0);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const nextDepth = depthByOrder.get(current) ?? 0;
    for (const target of outgoing.get(current) ?? []) {
      const candidate = nextDepth + 1;
      if ((depthByOrder.get(target) ?? -1) < candidate) depthByOrder.set(target, candidate);
      queue.push(target);
    }
  }

  const pushRowHint = (order: number, row: number) => {
    const bucket = rowHints.get(order) ?? [];
    bucket.push(row);
    rowHints.set(order, bucket);
  };

  const visit = (order: number, row: number, trail: Set<number>) => {
    if (trail.has(order)) return;
    pushRowHint(order, row);
    const children = (outgoing.get(order) ?? []).slice().sort((a, b) => a - b);
    const nextTrail = new Set(trail);
    nextTrail.add(order);
    children.forEach((child, index) => visit(child, row + (children.length === 1 ? 0 : index), nextTrail));
  };

  heads.forEach((head, index) => visit(head, index * 2, new Set<number>()));

  const rowByOrder = new Map<number, number>();
  const laneByOrder = new Map<number, number>();
  const rowsByDepth = new Map<number, { order: number; row: number }[]>();

  for (const step of steps) {
    const hints = rowHints.get(step.order) ?? [0];
    const avgRow = hints.reduce((sum, value) => sum + value, 0) / hints.length;
    rowByOrder.set(step.order, avgRow);
    const depth = depthByOrder.get(step.order) ?? 0;
    const bucket = rowsByDepth.get(depth) ?? [];
    bucket.push({ order: step.order, row: avgRow });
    rowsByDepth.set(depth, bucket);
  }

  rowsByDepth.forEach((entries) => {
    entries
      .slice()
      .sort((a, b) => a.row - b.row || a.order - b.order)
      .forEach((entry, index) => laneByOrder.set(entry.order, index));
  });

  return { depthByOrder, rowByOrder, laneByOrder };
}

function layoutPipelineFlow(steps: PipelineStepDefinition[], edges: PipelineEdge[]): Map<number, FlowPosition> {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: 'LR',
    nodesep: 120,
    ranksep: 200,
    marginx: 24,
    marginy: 24,
  });
  const positions = new Map<number, FlowPosition>();

  steps
    .slice()
    .sort((left, right) => left.order - right.order)
    .forEach((step) => {
      graph.setNode(`s-${step.order}`, { width: DASHBOARD_FLOW_NODE_SIZE, height: DASHBOARD_FLOW_NODE_SIZE });
    });

  edges
    .slice()
    .sort((left, right) => left.source - right.source || left.target - right.target)
    .forEach((edge) => {
      graph.setEdge(`s-${edge.source}`, `s-${edge.target}`);
    });

  dagre.layout(graph);

  steps.forEach((step) => {
    const position = graph.node(`s-${step.order}`);
    if (position) {
      positions.set(step.order, {
        x: position.x - DASHBOARD_FLOW_NODE_SIZE / 2,
        y: position.y - DASHBOARD_FLOW_NODE_SIZE / 2,
      });
      return;
    }
    positions.set(step.order, { x: step.order * 260, y: 0 });
  });

  return positions;
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
  className,
  label,
  value,
  icon: Icon,
  tone,
}: {
  className?: string;
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
    <div className={cn('h-full w-full min-w-28 rounded-xl border border-border bg-background px-2.5 py-2.5 shadow-sm', className)}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={cn('rounded-md p-0.5', toneClass)}>
          <Icon className="h-3.25 w-3.25" />
        </span>
        <span className="text-[9px] font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="font-mono text-base font-bold text-foreground">{value}</div>
        <div className="pb-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground/75">live</div>
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

          <div className="grid max-h-72 gap-1 overflow-y-auto p-2 sm:grid-cols-2">
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
                    onChange={() => onTogglePipeline(pipeline.id)}
                    className="peer sr-only"
                    aria-label={`${pipeline.name} 표시 여부`}
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
                      checked
                        ? 'border-accent bg-accent text-white shadow-[0_0_0_1px_rgba(16,185,129,0.18)]'
                        : 'border-border bg-background text-transparent',
                    )}
                  >
                    <Check className="h-2.5 w-2.5 stroke-[3]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-semibold text-foreground">{pipeline.name}</span>
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const matrixGroups = useMemo(
    () => buildMatrixDepthGroups(item.nodeMetrics, item.depthMetrics),
    [item.depthMetrics, item.nodeMetrics],
  );
  const matrixColumns = useMemo(() => matrixGroups.flatMap((group) => group.columns), [matrixGroups]);
  const baseMatrixWidth = useMemo(
    () => Math.max(760, MATRIX_LABEL_COLUMN_WIDTH + matrixColumns.length * MATRIX_NODE_COLUMN_WIDTH),
    [matrixColumns.length],
  );
  const matrixWidth = Math.max(baseMatrixWidth, availableWidth);
  const columnWidth = Math.max(
    MATRIX_NODE_COLUMN_WIDTH,
    (matrixWidth - MATRIX_LABEL_COLUMN_WIDTH) / Math.max(matrixColumns.length, 1),
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const syncWidth = () => {
      setAvailableWidth(element.clientWidth > 0 ? element.clientWidth - 32 : 0);
    };

    syncWidth();

    const observer = new ResizeObserver(() => {
      syncWidth();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
            <span>{item.jobs.length}회 실행</span>
            <span>{runningLabel}</span>
            <span>{failureLabel}</span>
            {item.latestJob && <span>최근 {formatRelativeTime(item.latestJob.updatedAt)}</span>}
          </div>
        </div>
      </div>

      <div ref={containerRef} className="overflow-x-auto">
        <div className="px-4 py-4" style={{ width: matrixWidth }}>
          <PipelineFlowDiagram
            pipeline={item.pipeline}
            nodeMetrics={item.nodeMetrics}
            width={matrixWidth}
          />

          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border bg-muted/15 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
              분기 단계의 헤더는 해당 단계를 구성하는 노드 설명입니다. 아래 `Running / Failed / Done / Pending` 수치는 같은 단계에 속한 노드를 묶은 단계 단위 집계로 계산합니다.
            </div>
            <table className="w-full border-collapse table-fixed text-[11px]">
              <thead className="bg-muted/25">
                <tr className="border-b border-border">
                  <th
                    rowSpan={2}
                    className="border-r border-border px-3 py-2 text-left align-top"
                    style={{ width: MATRIX_LABEL_COLUMN_WIDTH }}
                  >
                    <div className="font-mono text-[10px] font-bold text-foreground">STATUS</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">count</div>
                  </th>
                  {matrixGroups.map((group) => (
                    <th
                      key={`depth-group-${group.depth}`}
                      colSpan={group.columns.length}
                      className="border-r border-border px-3 py-2 text-left last:border-r-0"
                    >
                      <div className="font-mono text-[10px] font-bold text-foreground">{group.title}</div>
                      {group.subtitle ? <div className="mt-0.5 text-[10px] text-muted-foreground">{group.subtitle}</div> : null}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  {matrixGroups.flatMap((group) => group.columns.map((column) => (
                    <th
                      key={column.key}
                      className="border-r border-border px-3 py-2 text-left align-top last:border-r-0"
                      style={{ minWidth: columnWidth, width: columnWidth }}
                    >
                      <div className="font-mono text-[10px] font-bold text-foreground">{column.header}</div>
                      <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={column.subtitle}>
                        {column.subtitle}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-muted-foreground/85" title={column.target}>
                        {column.target}
                      </div>
                    </th>
                  )))}
                </tr>
              </thead>
              <tbody>
                <MetricMatrixRow
                  label="Running"
                  tone="accent"
                  groups={matrixGroups}
                  valueSelector={(group) => group.aggregate.running}
                />
                <MetricMatrixRow
                  label="Failed"
                  tone="danger"
                  groups={matrixGroups}
                  valueSelector={(group) => group.aggregate.failed}
                />
                <MetricMatrixRow
                  label="Done"
                  tone="success"
                  groups={matrixGroups}
                  valueSelector={(group) => group.aggregate.completed}
                />
                <MetricMatrixRow
                  label="Pending"
                  tone="muted"
                  groups={matrixGroups}
                  valueSelector={(group) => group.aggregate.pending}
                />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </article>
  );
}

function PipelineFlowDiagram({
  pipeline,
  nodeMetrics,
  width,
}: {
  pipeline: PipelineDefinition;
  nodeMetrics: NodeMetric[];
  width: number;
}) {
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  const graphScope = useMemo(() => `dashboard-${pipeline.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`, [pipeline.id]);
  const positions = useMemo(() => layoutPipelineFlow(pipeline.steps, pipeline.edges), [pipeline.edges, pipeline.steps]);
  const nodeByOrder = useMemo(() => new Map(nodeMetrics.map((node) => [node.order, node])), [nodeMetrics]);
  const disabledOrders = useMemo(
    () => new Set(pipeline.steps.filter((step) => step.disabled).map((step) => step.order)),
    [pipeline.steps],
  );
  const handleResetViewport = useCallback(() => {
    flowInstance?.fitView(DASHBOARD_FLOW_FIT_VIEW);
  }, [flowInstance]);
  const nodes = useMemo<Node[]>(() => (
    pipeline.steps.map((step) => {
      const metric = nodeByOrder.get(step.order);
      const position = positions.get(step.order) ?? { x: step.order * 170, y: 20 };
      return {
        id: `dashboard-step-${step.order}`,
        type: 'pipeline',
        position,
        draggable: false,
        selectable: false,
        data: {
          kind: step.kind,
          sarStage: step.sarStage,
          inputLevel: step.inputLevel,
          status: metric?.currentStatus === 'IDLE' ? 'PENDING' : (metric?.currentStatus ?? 'PENDING'),
          order: step.order,
          enabledTasks: step.enabledTasks,
          editable: false,
          isLeaf: !pipeline.edges.some((edge) => edge.source === step.order),
          isHead: !pipeline.edges.some((edge) => edge.target === step.order),
          enabled: !step.disabled,
          isJobMode: true,
        } satisfies PipelineNodeData,
      };
    })
  ), [nodeByOrder, pipeline.edges, pipeline.steps, positions]);
  const edges = useMemo<Edge<DeletableEdgeData>[]>(() => (
    pipeline.edges.map((edge) => {
      const sourceMetric = nodeByOrder.get(edge.source);
      const targetMetric = nodeByOrder.get(edge.target);
      const sourceStatus = sourceMetric?.currentStatus ?? 'IDLE';
      const targetStatus = targetMetric?.currentStatus ?? 'IDLE';
      const sourceDisabled = disabledOrders.has(edge.source);
      const targetDisabled = disabledOrders.has(edge.target);
      const dimmed = sourceDisabled || targetDisabled || sourceStatus === 'FAILED' || targetStatus === 'PENDING' || targetStatus === 'CANCELED' || targetStatus === 'SKIPPED';
      const stroke = dimmed
        ? t.edgeMuted
        : sourceStatus === 'COMPLETED'
          ? t.edgeSuccess
          : targetStatus === 'RUNNING'
            ? t.accent
            : t.edge;
      const markerVariant = dimmed ? 'outline' : 'solid';
      const edgeId = `${graphScope}-edge-${edge.source}-${edge.target}`;
      return {
        id: edgeId,
        source: `dashboard-step-${edge.source}`,
        target: `dashboard-step-${edge.target}`,
        type: 'deletable',
        animated: targetStatus === 'RUNNING',
        selectable: false,
        data: {
          stroke,
          strokeWidth: 2.2,
          animated: targetStatus === 'RUNNING',
          editable: false,
          markerVariant,
          markerBackground: 'var(--background)',
          sourceOrder: edge.source,
          targetOrder: edge.target,
          markerId: `arrow-${edgeId}`,
        },
      };
    })
  ), [disabledOrders, graphScope, nodeByOrder, pipeline.edges]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-background/65" style={{ width }}>
      <button
        type="button"
        onClick={handleResetViewport}
        className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-border bg-card/92 px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted/70 hover:text-foreground"
        aria-label="처음 파이프라인 보기로 돌아가기"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        처음 보기
      </button>
      <div style={{ height: DASHBOARD_FLOW_HEIGHT }}>
        <ReactFlow
          key={`dashboard-flow-${pipeline.id}-${Math.round(width)}`}
          nodes={nodes}
          edges={edges}
          nodeTypes={dashboardNodeTypes}
          edgeTypes={dashboardEdgeTypes}
          fitView
          fitViewOptions={DASHBOARD_FLOW_FIT_VIEW}
          onInit={setFlowInstance}
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          preventScrolling
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          minZoom={0.2}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
          className="bg-transparent"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={t.canvasDot} />
          <Controls
            showInteractive={false}
            position="bottom-left"
            fitViewOptions={DASHBOARD_FLOW_FIT_VIEW}
            className="!bg-card/92 !border-border !shadow-lg [&>button]:!bg-muted [&>button]:!border-border [&>button]:!text-foreground"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

function MetricMatrixRow({
  label,
  groups,
  tone,
  valueSelector,
}: {
  label: string;
  groups: MatrixDepthGroup[];
  tone: 'success' | 'accent' | 'danger' | 'muted';
  valueSelector: (group: MatrixDepthGroup) => number;
}) {
  const textClass = {
    success: 'text-success',
    accent: 'text-accent',
    danger: 'text-destructive',
    muted: 'text-muted-foreground',
  }[tone];

  return (
    <tr className="border-t border-border">
      <td className="min-h-12 border-r border-border px-3 py-2 align-middle" style={{ width: MATRIX_LABEL_COLUMN_WIDTH }}>
        <span className={cn('text-[11px] font-semibold', textClass)}>{label}</span>
      </td>
      {groups.map((group) => {
        const value = valueSelector(group);
        return (
          <td
            key={`${label}-depth-${group.depth}`}
            colSpan={group.columns.length}
            className="min-h-12 border-r border-border px-3 py-2 align-middle last:border-r-0"
          >
            <div>
            <div className={cn('font-mono text-lg font-bold', value > 0 ? textClass : 'text-muted-foreground/45')}>
              {value}
            </div>
            </div>
          </td>
        );
      })}
    </tr>
  );
}

