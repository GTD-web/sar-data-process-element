'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import PipelineProgressStepper from '@/components/graph/PipelineProgressStepper';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import LeftSidebar from '@/components/panels/LeftSidebar';
import PipelineExecutionTabs from '@/components/panels/PipelineExecutionTabs';
import RightTabbedPanel from '@/components/panels/RightTabbedPanel';
import ConsoleTab, { type ConsoleMode } from '@/components/panels/ConsoleTab';
import ReprocessConfirmDialog from '@/components/panels/ReprocessConfirmDialog';
import CancelConfirmDialog from '@/components/panels/CancelConfirmDialog';
import ExecutionLogPanel from '@/components/panels/ExecutionLogPanel';
import StepDetailPopover from '@/components/panels/StepDetailPopover';
import { toast } from '@/components/ui/Toast';
import { Check, ChevronDown, FlaskConical, GitBranch, PanelRightOpen, Archive, Search } from 'lucide-react';
import type {
  PipelineDefinition,
  ExecutionLog,
  JobSummary,
  JobDetail,
  PipelineStep,
  SarStage,
  JobStatus,
} from '@/types/pipeline';
import { SAR_STAGE_TO_CSC, SAR_STAGE_TO_LEVEL } from '@/types/pipeline';

const JOB_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const JOB_ID_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
type RunTargetType = 'job' | 'pipeline';

function compareJobsByIdDesc(a: JobSummary, b: JobSummary): number {
  const byJobId = JOB_ID_COLLATOR.compare(b.jobId, a.jobId);
  if (byJobId !== 0) return byJobId;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Canvas (dynamic import — ReactFlow only on client)
// ---------------------------------------------------------------------------

const CanvasGraph = dynamic(() => import('@/components/graph/CanvasGraph'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-background text-muted-foreground text-sm">
      Loading diagram...
    </div>
  ),
});

// ---------------------------------------------------------------------------
// Canvas Overlay: Pipeline Title Badge
// ---------------------------------------------------------------------------

function JobNameBadge({
  jobId,
  pipelineName,
  satelliteId,
  mode,
  archived,
}: {
  jobId: string;
  pipelineName: string;
  satelliteId?: string;
  mode?: string;
  archived?: boolean;
}) {
  return (
    <div className="absolute top-3 left-3 z-10">
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card/80 backdrop-blur-sm border border-border shadow-sm">
        <GitBranch className="w-3.5 h-3.5 text-accent shrink-0 self-start mt-0.5" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-xs font-semibold text-foreground truncate">{pipelineName}</div>
            <span className="shrink-0 rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              {jobId}
            </span>
          </div>
          {(satelliteId || mode) && (
            <div className="text-[10px] text-muted-foreground truncate">
              {[satelliteId, mode].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        {archived && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
            <Archive className="w-3 h-3" />
            Archived
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function JobsPage() {
  const service = usePipelineService();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith('/current') ? '/current' : '/plan';
  const manualJobsPath = `${basePath}/jobs`;
  const isLegacyManualExecutionRoute = pathname === `${basePath}/deployed` && searchParams.get('tab') === 'manual';

  const updateJobIdParam = useCallback((jobId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('tab');
    if (jobId) {
      params.set('jobId', jobId);
    } else {
      params.delete('jobId');
    }
    const qs = params.toString();
    router.replace(qs ? `${manualJobsPath}?${qs}` : manualJobsPath);
  }, [searchParams, router, manualJobsPath]);

  useEffect(() => {
    if (!isLegacyManualExecutionRoute) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('tab');
    const qs = params.toString();
    router.replace(qs ? `${manualJobsPath}?${qs}` : manualJobsPath);
  }, [isLegacyManualExecutionRoute, searchParams, router, manualJobsPath]);

  // --- Data ---
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [activePipelineIds, setActivePipelineIds] = useState<Set<string>>(() => new Set());
  const [autoPipelineCount, setAutoPipelineCount] = useState(0);
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);

  // --- UI ---
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [consoleMode, setConsoleMode] = useState<ConsoleMode>({ type: 'idle' });
  const [reprocessDialogOpen, setReprocessDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [activeStepOrder, setActiveStepOrder] = useState<number | null>(null);
  const [popoverClickY, setPopoverClickY] = useState(0);
  const [statusFilter, setStatusFilter] = useState<JobStatus | ''>('');
  const [jobPage, setJobPage] = useState(1);
  const [jobPageSize, setJobPageSize] = useState<(typeof JOB_PAGE_SIZE_OPTIONS)[number]>(20);
  const [runPipelineId, setRunPipelineId] = useState('');
  const [runTargetType, setRunTargetType] = useState<RunTargetType>('job');
  const canvasRef = useRef<HTMLDivElement>(null);
  const jobSelectRef = useRef<HTMLDivElement>(null);
  const [jobSelectOpen, setJobSelectOpen] = useState(false);
  const [jobSelectSearch, setJobSelectSearch] = useState('');

  useEffect(() => {
    if (!jobSelectOpen && jobSelectSearch) setJobSelectSearch('');
  }, [jobSelectOpen, jobSelectSearch]);

  useEffect(() => {
    if (!jobSelectOpen) return;
    const onDocClick = (event: MouseEvent) => {
      if (!jobSelectRef.current?.contains(event.target as Node)) {
        setJobSelectOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [jobSelectOpen]);

  // --- Initial load ---
  useEffect(() => {
    (async () => {
      const [jobsRes, plRes, archivedRes, logRes, rulesRes] = await Promise.all([
        service.Job_목록을_조회한다({ limit: 100 }),
        service.파이프라인_목록을_조회한다(),
        service.아카이브_파이프라인_목록을_조회한다(),
        service.실행_로그를_조회한다({ limit: 300 }),
        service.파이프라인_자동실행규칙을_조회한다(),
      ]);
      const loadedJobs = jobsRes.data?.items ?? [];
      if (jobsRes.data) setJobs(loadedJobs);
      if (rulesRes.data) {
        const activeRules = rulesRes.data.filter((rule) => rule.active);
        setAutoPipelineCount(activeRules.length);
        setActivePipelineIds(new Set(activeRules.map((rule) => rule.pipelineId)));
      }
      // 활성 + 아카이브 파이프라인을 통합 — Job이 아카이브된 파이프라인을 참조해도 다이어그램을 표시할 수 있게
      const active = plRes.data ?? [];
      const archived = (archivedRes.data ?? []).map((p) => ({ ...p, archived: true }));
      setPipelines([...active, ...archived]);
      if (logRes.data) setExecutionLogs(logRes.data);

      // Deep-link: ?jobId=
      const urlJobId = searchParams.get('jobId');
      const initialId = urlJobId ?? [...loadedJobs].sort(compareJobsByIdDesc)[0]?.jobId;
      if (initialId) {
        const jobRes = await service.Job_상세를_조회한다(initialId);
        if (jobRes.data) {
          setSelectedJob(jobRes.data);
          setRunPipelineId(jobRes.data.pipelineId);
          setRunTargetType('job');
          setConsoleMode({ type: 'job', job: jobRes.data });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams는 초기 로드에만 사용
  }, [service]);

  // 선택된 Job 이 바뀌면 그 Job 의 전체 로그를 다시 가져온다.
  // (전역 limit 으로는 오래된 로그만 잡혀 새 Job 의 패널이 비어 보이는 것을 방지)
  useEffect(() => {
    if (!selectedJob) return;
    let cancelled = false;
    void (async () => {
      const res = await service.실행_로그를_조회한다({ jobId: selectedJob.jobId, limit: 1000 });
      if (!cancelled && res.data) setExecutionLogs(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedJob, service]);

  // --- Poll active jobs ---
  useEffect(() => {
    if (!selectedJob) return;
    if (selectedJob.status !== 'ASSIGNED' && selectedJob.status !== 'CREATED') return;

    const jobId = selectedJob.jobId;
    let stopped = false;

    const interval = setInterval(async () => {
      if (stopped) return;
      const res = await service.Job_상세를_조회한다(jobId);
      if (!res.data) return;
      setSelectedJob(res.data);
      setConsoleMode({ type: 'job', job: res.data });
      const jobsRes = await service.Job_목록을_조회한다({ limit: 100 });
      if (jobsRes.data) setJobs(jobsRes.data.items);

      if (res.data.status === 'COMPLETED' || res.data.status === 'FAILED') {
        stopped = true;
        clearInterval(interval);
        if (res.data.status === 'COMPLETED') {
          toast.success(`Job ${res.data.jobId} completed`);
        } else {
          toast.error(`Job ${res.data.jobId} failed`);
        }
      }
    }, 1000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [selectedJob, service]);

  // --- Selection ---
  const handleSelectJob = useCallback(async (jobId: string) => {
    const res = await service.Job_상세를_조회한다(jobId);
    if (res.data) {
      setSelectedJob(res.data);
      setRunPipelineId(res.data.pipelineId);
      setRunTargetType('job');
      setActiveStepOrder(null);
      setConsoleMode({ type: 'job', job: res.data });
      setRightCollapsed(false);
      updateJobIdParam(jobId);
    } else {
      toast.error(res.message);
    }
  }, [service, updateJobIdParam]);

  // --- Derived: pipeline + graph data for the selected job (or selected unrun pipeline) ---
  const selectedPipeline = runTargetType === 'pipeline' && runPipelineId
    ? pipelines.find((pipeline) => pipeline.id === runPipelineId && !pipeline.archived) ?? null
    : selectedJob
      ? pipelines.find((p) => p.id === selectedJob.pipelineId) ?? null
      : null;
  const pipelineNameById = useMemo(
    () => new Map(pipelines.map((pipeline) => [pipeline.id, pipeline.name])),
    [pipelines],
  );
  const sortedJobs = useMemo(() => [...jobs].sort(compareJobsByIdDesc), [jobs]);
  const runTargetPipeline = runPipelineId
    ? pipelines.find((pipeline) => pipeline.id === runPipelineId && !pipeline.archived) ?? null
    : null;
  const runTargetJob = runTargetType === 'job' && selectedJob?.pipelineId === runPipelineId ? selectedJob : null;
  const activeRunPipelines = useMemo(
    () => pipelines
      .filter((pipeline) => !pipeline.archived && activePipelineIds.has(pipeline.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [activePipelineIds, pipelines],
  );
  const jobSelectKeyword = normalizeSearch(jobSelectSearch);
  const selectableJobs = useMemo(() => {
    if (!jobSelectKeyword) return sortedJobs;
    return sortedJobs.filter((job) => {
      const pipelineName = pipelineNameById.get(job.pipelineId) ?? job.pipelineId;
      return [
        job.jobId,
        job.sceneId,
        job.status,
        pipelineName,
      ].some((value) => value.toLowerCase().includes(jobSelectKeyword));
    });
  }, [jobSelectKeyword, pipelineNameById, sortedJobs]);
  const selectableActivePipelines = useMemo(() => {
    if (!jobSelectKeyword) return activeRunPipelines;
    return activeRunPipelines.filter((pipeline) => (
      pipeline.id.toLowerCase().includes(jobSelectKeyword)
      || pipeline.name.toLowerCase().includes(jobSelectKeyword)
    ));
  }, [activeRunPipelines, jobSelectKeyword]);

  const graphSteps: PipelineStep[] = selectedPipeline
    ? selectedPipeline.steps.map((s) => {
        const jobStep = selectedJob ? selectedJob.steps.find((js) => js.order === s.order) : undefined;
        const targetCsc = s.kind === 'SAR' && s.sarStage
          ? SAR_STAGE_TO_CSC[s.sarStage]
          : s.kind === 'CATALOG' ? 'CSC-07'
          : s.kind === 'JOB_INIT' ? 'CSC-08'
          : 'CSC-02';
        const productLevel = s.kind === 'SAR' && s.sarStage
          ? SAR_STAGE_TO_LEVEL[s.sarStage]
          : 'LEVEL_0';
        return {
          order: s.order,
          kind: s.kind,
          sarStage: s.sarStage,
          inputLevel: s.inputLevel,
          targetCsc,
          productLevel,
          status: jobStep?.status ?? 'PENDING',
          durationMs: jobStep?.durationMs,
          errorMessage: jobStep?.errorMessage,
          enabledTasks: s.enabledTasks,
        };
      })
    : [];

  const graphEdges = selectedPipeline?.edges ?? [];
  const filteredJobs = statusFilter ? sortedJobs.filter((job) => job.status === statusFilter) : sortedJobs;
  const pendingJobCount = jobs.filter((job) => job.status === 'CREATED').length;
  const runningJobCount = jobs.filter((job) => job.status === 'ASSIGNED').length;
  const totalJobPages = Math.max(1, Math.ceil(filteredJobs.length / jobPageSize));
  const currentJobPage = Math.min(jobPage, totalJobPages);
  const pageStart = (currentJobPage - 1) * jobPageSize;
  const pagedJobs = filteredJobs.slice(pageStart, pageStart + jobPageSize);

  useEffect(() => {
    if (jobPage > totalJobPages) {
      setJobPage(totalJobPages);
    }
  }, [jobPage, totalJobPages]);

  // --- Job actions ---
  const handleReprocessJob = useCallback(() => {
    if (!selectedJob) return;
    setReprocessDialogOpen(true);
  }, [selectedJob]);

  const handleReprocessConfirm = useCallback(async () => {
    if (!selectedJob) return;
    setReprocessDialogOpen(false);
    await service.Job을_재처리한다(selectedJob.jobId);
    toast.success('Reprocess request created.');
    const [jRes, jsRes] = await Promise.all([
      service.Job_상세를_조회한다(selectedJob.jobId),
      service.Job_목록을_조회한다({ limit: 100 }),
    ]);
    if (jRes.data) { setSelectedJob(jRes.data); setConsoleMode({ type: 'job', job: jRes.data }); }
    if (jsRes.data) setJobs(jsRes.data.items);
  }, [service, selectedJob]);

  const handleCancelJob = useCallback(() => {
    if (!selectedJob) return;
    setCancelDialogOpen(true);
  }, [selectedJob]);

  const handleCancelConfirm = useCallback(async () => {
    if (!selectedJob) return;
    setCancelDialogOpen(false);
    await service.Job을_취소한다(selectedJob.jobId);
    const [jRes, jsRes] = await Promise.all([
      service.Job_상세를_조회한다(selectedJob.jobId),
      service.Job_목록을_조회한다({ limit: 100 }),
    ]);
    if (jRes.data) { setSelectedJob(jRes.data); setConsoleMode({ type: 'job', job: jRes.data }); }
    if (jsRes.data) setJobs(jsRes.data.items);
  }, [service, selectedJob]);

  const handlePartialReprocess = useCallback(async (sarStage: SarStage) => {
    if (!selectedJob) return;
    await service.부분_재처리를_요청한다(selectedJob.jobId, { sarStage });
    toast.success('Reprocess request created.');
    const [jRes, jsRes] = await Promise.all([
      service.Job_상세를_조회한다(selectedJob.jobId),
      service.Job_목록을_조회한다({ limit: 100 }),
    ]);
    if (jRes.data) { setSelectedJob(jRes.data); setConsoleMode({ type: 'job', job: jRes.data }); }
    if (jsRes.data) setJobs(jsRes.data.items);
  }, [service, selectedJob]);

  const handleReprocessFromNode = useCallback((order: number) => {
    if (!selectedJob || !selectedPipeline) return;
    const step = selectedPipeline.steps.find((s) => s.order === order);
    if (!step || step.kind !== 'SAR' || !step.sarStage) return;
    handlePartialReprocess(step.sarStage);
  }, [selectedJob, selectedPipeline, handlePartialReprocess]);

  const handleRunPipeline = useCallback(async () => {
    const pipelineIdToRun = runPipelineId;
    if (!pipelineIdToRun) return;
    const runnablePipeline = pipelines.find((pipeline) => pipeline.id === pipelineIdToRun && !pipeline.archived);
    if (!runnablePipeline) {
      toast.error('Select a job or active pipeline that can be executed.');
      return;
    }
    const res = await service.파이프라인을_실행한다(pipelineIdToRun);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    toast.success(res.message);
    const [jobsRes, logRes] = await Promise.all([
      service.Job_목록을_조회한다({ limit: 100 }),
      service.실행_로그를_조회한다({ limit: 300 }),
    ]);
    if (jobsRes.data) setJobs(jobsRes.data.items);
    if (logRes.data) setExecutionLogs(logRes.data);
    setLogPanelOpen(true);

    if (res.data) {
      const jobRes = await service.Job_상세를_조회한다(res.data.jobId);
      if (jobRes.data) {
        setSelectedJob(jobRes.data);
        setRunPipelineId(jobRes.data.pipelineId);
        setRunTargetType('job');
        setConsoleMode({ type: 'job', job: jobRes.data });
        updateJobIdParam(jobRes.data.jobId);
      }
    }
  }, [pipelines, runPipelineId, service, updateJobIdParam]);

  const handleSelectJobFromDropdown = useCallback((jobId: string) => {
    setJobSelectOpen(false);
    setJobSelectSearch('');
    void handleSelectJob(jobId);
  }, [handleSelectJob]);

  const handleSelectPipelineFromDropdown = useCallback((pipelineId: string) => {
    setRunPipelineId(pipelineId);
    setRunTargetType('pipeline');
    setJobSelectOpen(false);
    setJobSelectSearch('');
    // 파이프라인을 선택하면 "아직 실행하지 않은" 상태로 보여준다 — 이전 Job 선택을 비운다.
    setSelectedJob(null);
    setActiveStepOrder(null);
    setConsoleMode({ type: 'idle' });
    updateJobIdParam(null);
  }, [updateJobIdParam]);

  // --- Canvas node interactions ---
  const handleNodeClick = useCallback((stepOrder: number, clickY: number) => {
    setActiveStepOrder(stepOrder);
    setPopoverClickY(clickY);
    setRightCollapsed(false);
  }, []);

  return (
    <div className="h-full flex overflow-hidden">
      <LeftSidebar
        mode="jobs"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        activePage="jobs"
        pipelines={pipelines}
        jobs={pagedJobs}
        pendingJobCount={pendingJobCount}
        runningJobCount={runningJobCount}
        selectedJobId={selectedJob?.jobId ?? null}
        onSelectJob={handleSelectJob}
        statusFilter={statusFilter}
        onStatusFilterChange={(status) => {
          setStatusFilter(status);
          setJobPage(1);
        }}
        page={currentJobPage}
        totalPages={totalJobPages}
        pageSize={jobPageSize}
        pageSizeOptions={JOB_PAGE_SIZE_OPTIONS}
        totalJobs={filteredJobs.length}
        pageStart={filteredJobs.length === 0 ? 0 : pageStart + 1}
        pageEnd={Math.min(pageStart + jobPageSize, filteredJobs.length)}
        onPageChange={setJobPage}
        onPageSizeChange={(size) => {
          setJobPageSize(size as (typeof JOB_PAGE_SIZE_OPTIONS)[number]);
          setJobPage(1);
        }}
      />

      {/* Center: Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5 shrink-0">
          <PipelineExecutionTabs active="manual" counts={{ auto: autoPipelineCount, manual: jobs.length }} />
          <div className="flex min-w-0 items-center gap-2">
          <div ref={jobSelectRef} className="relative min-w-0">
            <button
              type="button"
              disabled={jobs.length === 0 && activeRunPipelines.length === 0}
              onClick={() => setJobSelectOpen((open) => !open)}
              className="flex h-8 w-72 max-w-[36vw] items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 text-left text-xs text-foreground shadow-sm transition-colors hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-45"
              aria-haspopup="listbox"
              aria-expanded={jobSelectOpen}
              aria-label="Pipeline run target"
            >
              <span className="min-w-0 truncate">
                {runTargetJob
                  ? `${runTargetJob.jobId} · ${selectedPipeline?.name ?? runTargetJob.pipelineId}`
                  : runTargetPipeline
                    ? `Pipeline · ${runTargetPipeline.name}`
                    : 'Select job or active pipeline'}
              </span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${jobSelectOpen ? 'rotate-180' : ''}`} />
            </button>
            {jobSelectOpen && (jobs.length > 0 || activeRunPipelines.length > 0) && (
              <div
                role="listbox"
                className="absolute right-0 top-full z-30 mt-1 flex max-h-80 w-[26rem] max-w-[48vw] flex-col overflow-hidden rounded-md border border-border bg-card shadow-xl"
              >
                <div className="shrink-0 border-b border-border/70 bg-card px-2 pb-2 pt-1">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={jobSelectSearch}
                      onChange={(event) => setJobSelectSearch(event.target.value)}
                      placeholder="Search job ID, scene, pipeline..."
                      className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
                      aria-label="Search job or active pipeline"
                    />
                  </div>
                </div>
                <div className="min-h-0 overflow-y-auto py-1">
                  {selectableJobs.length > 0 && (
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                      Jobs
                    </div>
                  )}
                  {selectableJobs.map((job) => {
                    const selected = runTargetType === 'job' && job.jobId === selectedJob?.jobId && runPipelineId === job.pipelineId;
                    const pipelineName = pipelineNameById.get(job.pipelineId) ?? job.pipelineId;
                    return (
                      <button
                        key={`job-${job.jobId}`}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => handleSelectJobFromDropdown(job.jobId)}
                        className={`flex w-full items-start gap-2 px-2.5 py-2 text-left text-xs transition-colors ${
                          selected ? 'bg-accent/10 text-accent' : 'text-foreground hover:bg-muted/35'
                        }`}
                      >
                        <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                          {selected && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{job.jobId}</span>
                          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                            {pipelineName} · {job.status}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  {selectableActivePipelines.length > 0 && (
                    <div className="border-t border-border/70 px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                      Active Pipelines
                    </div>
                  )}
                  {selectableActivePipelines.map((pipeline) => {
                    const selected = runTargetType === 'pipeline' && runPipelineId === pipeline.id;
                    return (
                      <button
                        key={`pipeline-${pipeline.id}`}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => handleSelectPipelineFromDropdown(pipeline.id)}
                        className={`flex w-full items-start gap-2 px-2.5 py-2 text-left text-xs transition-colors ${
                          selected ? 'bg-accent/10 text-accent' : 'text-foreground hover:bg-muted/35'
                        }`}
                      >
                        <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                          {selected && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{pipeline.name}</span>
                          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                            {pipeline.steps.length} steps · active
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  {selectableJobs.length === 0 && selectableActivePipelines.length === 0 && (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                      No jobs or active pipelines match the search.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={!runPipelineId}
            onClick={handleRunPipeline}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-[11px] font-semibold text-accent-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Run Pipeline
          </button>
          </div>
        </div>
        {selectedPipeline && graphSteps.length > 0 ? (
          <div ref={canvasRef} className="flex-1 relative overflow-hidden">
            <CanvasGraph
              pipelineId={selectedPipeline.id}
              steps={graphSteps}
              pipelineEdges={graphEdges}
              editable={false}
              onNodeClick={handleNodeClick}
              onTrigger={selectedJob?.status === 'ASSIGNED' ? undefined : handleRunPipeline}
              onReprocessStep={handleReprocessFromNode}
              isJobMode
            />
            {selectedJob ? (
              <JobNameBadge
                jobId={selectedJob.jobId}
                pipelineName={selectedPipeline.name}
                satelliteId={selectedJob.satelliteId}
                mode={selectedJob.mode}
                archived={selectedPipeline.archived}
              />
            ) : (
              <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-md border border-border bg-card/80 backdrop-blur-sm px-2.5 py-1.5 shadow-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Not yet executed
                </span>
                <span className="text-xs font-semibold text-foreground truncate max-w-[260px]" title={selectedPipeline.name}>
                  {selectedPipeline.name}
                </span>
              </div>
            )}

            {/* Open right panel */}
            {rightCollapsed && (
              <div className="absolute top-3 right-3 z-10">
                <button
                  type="button"
                  onClick={() => setRightCollapsed(false)}
                  className="p-1.5 rounded-md bg-card/80 backdrop-blur-sm border border-border shadow-sm
                             text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  title="Open panel"
                >
                  <PanelRightOpen className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Step detail popover */}
            {activeStepOrder != null && activeStepOrder > 0 && (() => {
              if (!selectedJob) return null;
              const activeStep = selectedJob.steps.find((s) => s.order === activeStepOrder);
              if (!activeStep) return null;
              const canvasRect = canvasRef.current?.getBoundingClientRect();
              const canvasTop = canvasRect?.top ?? 0;
              const canvasHeight = canvasRect?.height ?? 600;
              const relativeTop = Math.max(8, popoverClickY - canvasTop);
              return (
                <StepDetailPopover
                  step={activeStep}
                  job={selectedJob}
                  logs={executionLogs}
                  onClose={() => setActiveStepOrder(null)}
                  topOffset={relativeTop}
                  containerHeight={canvasHeight}
                />
              );
            })()}
          </div>
        ) : (
          <div className="flex-1 relative flex items-center justify-center bg-background text-muted-foreground text-sm">
            {jobs.length === 0
              ? 'No manual pipeline runs yet'
              : selectedJob && !selectedPipeline
                ? 'Pipeline for the selected job was not found'
                : runTargetType === 'pipeline' && !selectedPipeline
                  ? 'Selected pipeline was not found or is archived'
                  : 'Select a manual pipeline run from the left panel'}
          </div>
        )}

        {/* Progress Stepper */}
        {selectedJob && selectedPipeline && graphSteps.length > 0 && (
          <PipelineProgressStepper steps={graphSteps} />
        )}

        {/* Execution Log Panel */}
        <ExecutionLogPanel
          logs={executionLogs}
          selectedJobId={selectedJob?.jobId}
          open={logPanelOpen}
          onToggle={() => setLogPanelOpen((v) => !v)}
        />
      </div>

      {/* Right: ConsoleTab (JobDetailPanel in job mode) */}
      <RightTabbedPanel
        collapsed={rightCollapsed}
        onToggle={() => setRightCollapsed((v) => !v)}
        showCollapsedToggle={false}
        title="Job Details"
      >
        <ConsoleTab
          mode={consoleMode}
          onSaveNode={() => { /* jobs mode — 편집 불가 */ }}
          onDeleteNode={() => { /* jobs mode — 편집 불가 */ }}
          onConfirmAddStep={() => { /* jobs mode — 편집 불가 */ }}
          onReprocessJob={handleReprocessJob}
          onPartialReprocess={handlePartialReprocess}
          onCancelJob={handleCancelJob}
          availableProfiles={[]}
          onStepClick={(order, clickY) => { setActiveStepOrder(order); setPopoverClickY(clickY); }}
          activeStepOrder={activeStepOrder}
        />
      </RightTabbedPanel>

      {/* Dialogs */}
      {reprocessDialogOpen && selectedJob && (
        <ReprocessConfirmDialog
          jobId={selectedJob.jobId}
          sceneId={selectedJob.sceneId}
          onConfirm={handleReprocessConfirm}
          onCancel={() => setReprocessDialogOpen(false)}
        />
      )}
      {cancelDialogOpen && selectedJob && (
        <CancelConfirmDialog
          jobId={selectedJob.jobId}
          onConfirm={handleCancelConfirm}
          onCancel={() => setCancelDialogOpen(false)}
        />
      )}
    </div>
  );
}
