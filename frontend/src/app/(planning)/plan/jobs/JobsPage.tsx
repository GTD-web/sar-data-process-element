'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
import { Check, ChevronDown, FlaskConical, GitBranch, PanelRightOpen, Archive } from 'lucide-react';
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
  const canvasRef = useRef<HTMLDivElement>(null);
  const pipelineSelectRef = useRef<HTMLDivElement>(null);
  const [pipelineSelectOpen, setPipelineSelectOpen] = useState(false);

  useEffect(() => {
    if (!pipelineSelectOpen) return;
    const onDocClick = (event: MouseEvent) => {
      if (!pipelineSelectRef.current?.contains(event.target as Node)) {
        setPipelineSelectOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pipelineSelectOpen]);

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
      if (jobsRes.data) setJobs(jobsRes.data.items);
      if (rulesRes.data) setAutoPipelineCount(rulesRes.data.filter((rule) => rule.active).length);
      // 활성 + 아카이브 파이프라인을 통합 — Job이 아카이브된 파이프라인을 참조해도 다이어그램을 표시할 수 있게
      const active = plRes.data ?? [];
      const archived = (archivedRes.data ?? []).map((p) => ({ ...p, archived: true }));
      setPipelines([...active, ...archived]);
      if (logRes.data) setExecutionLogs(logRes.data);

      // Deep-link: ?jobId=
      const urlJobId = searchParams.get('jobId');
      const initialId = urlJobId ?? jobsRes.data?.items[0]?.jobId;
      if (initialId) {
        const jobRes = await service.Job_상세를_조회한다(initialId);
        if (jobRes.data) {
          setSelectedJob(jobRes.data);
          setRunPipelineId(jobRes.data.pipelineId);
          setConsoleMode({ type: 'job', job: jobRes.data });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams는 초기 로드에만 사용
  }, [service]);

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
      setActiveStepOrder(null);
      setConsoleMode({ type: 'job', job: res.data });
      setRightCollapsed(false);
      updateJobIdParam(jobId);
    } else {
      toast.error(res.message);
    }
  }, [service, updateJobIdParam]);

  // --- Derived: pipeline + graph data for the selected job ---
  const selectedPipeline = selectedJob
    ? pipelines.find((p) => p.id === selectedJob.pipelineId) ?? null
    : null;
  const runnablePipelines = pipelines.filter((pipeline) => !pipeline.archived);
  const selectedRunPipeline = runnablePipelines.find((pipeline) => pipeline.id === runPipelineId) ?? null;

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
  const filteredJobs = statusFilter ? jobs.filter((job) => job.status === statusFilter) : jobs;
  const totalJobPages = Math.max(1, Math.ceil(filteredJobs.length / jobPageSize));
  const currentJobPage = Math.min(jobPage, totalJobPages);
  const pageStart = (currentJobPage - 1) * jobPageSize;
  const pagedJobs = filteredJobs.slice(pageStart, pageStart + jobPageSize);

  useEffect(() => {
    if (jobPage > totalJobPages) {
      setJobPage(totalJobPages);
    }
  }, [jobPage, totalJobPages]);

  useEffect(() => {
    if (runnablePipelines.length === 0) return;
    if (runnablePipelines.some((pipeline) => pipeline.id === runPipelineId)) return;
    setRunPipelineId(runnablePipelines[0]!.id);
  }, [runPipelineId, runnablePipelines]);

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
    if (!runPipelineId) return;
    const runnablePipeline = pipelines.find((pipeline) => pipeline.id === runPipelineId && !pipeline.archived);
    if (!runnablePipeline) {
      toast.error('Select an active pipeline that can be executed.');
      return;
    }
    const res = await service.파이프라인을_실행한다(runPipelineId);
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
        setConsoleMode({ type: 'job', job: jobRes.data });
        updateJobIdParam(jobRes.data.jobId);
      }
    }
  }, [pipelines, runPipelineId, service, updateJobIdParam]);

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
          <div ref={pipelineSelectRef} className="relative min-w-0">
            <button
              type="button"
              disabled={runnablePipelines.length === 0}
              onClick={() => setPipelineSelectOpen((open) => !open)}
              className="flex h-8 w-72 max-w-[36vw] items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 text-left text-xs text-foreground shadow-sm transition-colors hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-45"
              aria-haspopup="listbox"
              aria-expanded={pipelineSelectOpen}
              aria-label="Pipeline to run"
            >
              <span className="min-w-0 truncate">
                {selectedRunPipeline?.name ?? 'No runnable pipelines'}
              </span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${pipelineSelectOpen ? 'rotate-180' : ''}`} />
            </button>
            {pipelineSelectOpen && runnablePipelines.length > 0 && (
              <div
                role="listbox"
                className="absolute right-0 top-full z-30 mt-1 max-h-72 w-80 max-w-[42vw] overflow-y-auto rounded-md border border-border bg-card py-1 shadow-xl"
              >
                {runnablePipelines.map((pipeline) => {
                  const selected = pipeline.id === runPipelineId;
                  return (
                    <button
                      key={pipeline.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setRunPipelineId(pipeline.id);
                        setPipelineSelectOpen(false);
                      }}
                      className={`flex w-full items-start gap-2 px-2.5 py-2 text-left text-xs transition-colors ${
                        selected ? 'bg-accent/10 text-accent' : 'text-foreground hover:bg-muted/35'
                      }`}
                    >
                      <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{pipeline.name}</span>
                      </span>
                    </button>
                  );
                })}
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
        {selectedJob && graphSteps.length > 0 ? (
          <div ref={canvasRef} className="flex-1 relative overflow-hidden">
            <CanvasGraph
              pipelineId={selectedJob.pipelineId}
              steps={graphSteps}
              pipelineEdges={graphEdges}
              editable={false}
              onNodeClick={handleNodeClick}
              onTrigger={handleRunPipeline}
              onReprocessStep={handleReprocessFromNode}
              isJobMode
            />
            <JobNameBadge
              jobId={selectedJob.jobId}
              pipelineName={selectedPipeline?.name ?? 'Unknown pipeline'}
              satelliteId={selectedJob.satelliteId}
              mode={selectedJob.mode}
              archived={selectedPipeline?.archived}
            />

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
                : 'Select a manual pipeline run from the left panel'}
          </div>
        )}

        {/* Progress Stepper */}
        {selectedJob && graphSteps.length > 0 && (
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
