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
import { GitBranch, PanelRightOpen, Archive } from 'lucide-react';
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
      다이어그램 불러오는 중...
    </div>
  ),
});

// ---------------------------------------------------------------------------
// Canvas Overlay: Job Info Badge (Scene ID + 위성·모드)
// ---------------------------------------------------------------------------

function JobNameBadge({ job, pipelineName, archived }: { job: JobDetail; pipelineName?: string; archived?: boolean }) {
  return (
    <div className="absolute top-3 left-3 z-10">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-card/80 backdrop-blur-sm border border-border shadow-sm">
        <GitBranch className="w-3.5 h-3.5 text-accent shrink-0" />
        <span className="text-xs font-semibold text-foreground font-mono">{job.jobId}</span>
        <span className="text-[10px] text-muted-foreground">
          {job.sceneId} · {job.satelliteId} · {job.mode}
        </span>
        {pipelineName && (
          <span className="text-[10px] text-muted-foreground/70 border-l border-border pl-2">{pipelineName}</span>
        )}
        {archived && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
            <Archive className="w-3 h-3" />
            아카이브
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
  const canvasRef = useRef<HTMLDivElement>(null);

  // --- Initial load ---
  useEffect(() => {
    (async () => {
      const [jobsRes, plRes, archivedRes, logRes] = await Promise.all([
        service.Job_목록을_조회한다({ limit: 100 }),
        service.파이프라인_목록을_조회한다(),
        service.아카이브_파이프라인_목록을_조회한다(),
        service.실행_로그를_조회한다({ limit: 300 }),
      ]);
      if (jobsRes.data) setJobs(jobsRes.data.items);
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
          toast.success(`Job ${res.data.jobId} 처리가 완료되었습니다`);
        } else {
          toast.error(`Job ${res.data.jobId} 처리 중 오류가 발생했습니다`);
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

  // --- Job actions ---
  const handleReprocessJob = useCallback(() => {
    if (!selectedJob) return;
    setReprocessDialogOpen(true);
  }, [selectedJob]);

  const handleReprocessConfirm = useCallback(async () => {
    if (!selectedJob) return;
    setReprocessDialogOpen(false);
    await service.Job을_재처리한다(selectedJob.jobId);
    toast.success('재처리 요청이 생성되었습니다.');
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
    toast.success('재처리 요청이 생성되었습니다.');
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
        <div className="flex items-center gap-3 border-b border-border px-5 py-2.5 shrink-0">
          <PipelineExecutionTabs active="manual" counts={{ manual: filteredJobs.length }} />
        </div>
        {selectedJob && graphSteps.length > 0 ? (
          <div ref={canvasRef} className="flex-1 relative overflow-hidden">
            <CanvasGraph
              pipelineId={selectedJob.pipelineId}
              steps={graphSteps}
              pipelineEdges={graphEdges}
              editable={false}
              onNodeClick={handleNodeClick}
              onReprocessStep={handleReprocessFromNode}
              isJobMode
            />
            <JobNameBadge
              job={selectedJob}
              pipelineName={selectedPipeline?.name}
              archived={selectedPipeline?.archived}
            />

            {/* 우측 패널 열기 */}
            {rightCollapsed && (
              <div className="absolute top-3 right-3 z-10">
                <button
                  type="button"
                  onClick={() => setRightCollapsed(false)}
                  className="p-1.5 rounded-md bg-card/80 backdrop-blur-sm border border-border shadow-sm
                             text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  title="패널 열기"
                >
                  <PanelRightOpen className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 단계 상세 팝오버 — 우측 패널의 단계 카드 클릭 시 캔버스 우측에 */}
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
              ? '수동 파이프라인 실행 기록이 없습니다'
              : selectedJob && !selectedPipeline
                ? '선택된 작업의 파이프라인을 찾을 수 없습니다'
                : '좌측에서 수동 파이프라인 실행을 선택하세요'}
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
        title="작업 상세"
      >
        <ConsoleTab
          mode={consoleMode}
          onSaveNode={() => { /* jobs mode — 편집 불가 */ }}
          onDeleteNode={() => { /* jobs mode — 편집 불가 */ }}
          onConfirmAddStep={() => { /* jobs mode — 편집 불가 */ }}
          onReprocessJob={handleReprocessJob}
          onPartialReprocess={handlePartialReprocess}
          onCancelJob={handleCancelJob}
          onSavePipeline={() => { /* jobs mode — 편집 불가 */ }}
          pipelineSaving={false}
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
