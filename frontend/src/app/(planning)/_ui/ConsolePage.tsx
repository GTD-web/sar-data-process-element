'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import PipelineProgressStepper from '@/components/graph/PipelineProgressStepper';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import TopBar from '@/components/panels/TopBar';
import LeftSidebar from '@/components/panels/LeftSidebar';
import RightTabbedPanel, { type RightTab } from '@/components/panels/RightTabbedPanel';
import ConsoleTab, { type ConsoleMode } from '@/components/panels/ConsoleTab';
import JobsTab from '@/components/panels/JobsTab';
import AlertsTab from '@/components/panels/AlertsTab';
import AuditTab from '@/components/panels/AuditTab';
import QueuesTab from '@/components/panels/QueuesTab';
import AlertModal from '@/components/panels/AlertModal';
import ReprocessConfirmDialog from '@/components/panels/ReprocessConfirmDialog';
import CancelConfirmDialog from '@/components/panels/CancelConfirmDialog';
import CreatePipelineDialog, { type CreatePipelineBasicData } from '@/components/panels/CreatePipelineDialog';
import SelectStartNodeDialog, { type StartNodeSelection } from '@/components/panels/SelectStartNodeDialog';
import ExecutionLogPanel from '@/components/panels/ExecutionLogPanel';
import NodeDetailModal from '@/components/panels/NodeDetailModal';
import Toast, { type ToastMessage } from '@/components/ui/Toast';
import { FlaskConical } from 'lucide-react';
import type {
  PipelineDefinition,
  PipelineStepDefinition,
  ProcessingProfile,
  ExecutionLog,
  JobSummary,
  JobDetail,
  Alert,
  AuditEvent,
  QueueHealth,
  DashboardStats,
  PipelineStep,
  SarStage,
  PipelineNodeKind,
} from '@/types/pipeline';
import { SAR_STAGE_TO_CSC, SAR_STAGE_TO_LEVEL, JOB_INIT_PROFILE_MISSING_MESSAGE } from '@/types/pipeline';

const CanvasGraph = dynamic(() => import('@/components/graph/CanvasGraph'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-background text-muted-foreground text-sm">
      그래프 로딩 중...
    </div>
  ),
});

export default function ConsolePage() {
  const service = usePipelineService();

  // --- Data ---
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [queues, setQueues] = useState<QueueHealth[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
  const [profiles, setProfiles] = useState<ProcessingProfile[]>([]);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);

  // --- UI State ---
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('console');
  const [consoleMode, setConsoleMode] = useState<ConsoleMode>({ type: 'idle' });
  const [editSaving, setEditSaving] = useState(false);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [reprocessDialogOpen, setReprocessDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [createStep, setCreateStep] = useState<'step1' | 'step2' | null>(null);
  const [createBasicData, setCreateBasicData] = useState<CreatePipelineBasicData | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [focusEntryTrigger, setFocusEntryTrigger] = useState(0);
  const [nodeDetailStep, setNodeDetailStep] = useState<PipelineStepDefinition | null>(null);

  // --- Load ---
  useEffect(() => {
    (async () => {
      const [plRes, statsRes, jobsRes, alertsRes, auditRes, queuesRes, profRes, logRes] = await Promise.all([
        service.파이프라인_목록을_조회한다(),
        service.대시보드_통계를_조회한다(),
        service.Job_목록을_조회한다({ limit: 50 }),
        service.Alert_목록을_조회한다(),
        service.감사로그를_조회한다({ size: 50 }),
        service.큐_상태를_조회한다(),
        service.처리_프로파일_목록을_조회한다(),
        service.실행_로그를_조회한다({ limit: 300 }),
      ]);
      if (plRes.data) {
        setPipelines(plRes.data);
        if (plRes.data.length > 0) setSelectedPipelineId(plRes.data[0].id);
      }
      if (statsRes.data) setStats(statsRes.data);
      if (jobsRes.data) setJobs(jobsRes.data.items);
      if (alertsRes.data) setAlerts(alertsRes.data);
      if (auditRes.data) setAuditEvents(auditRes.data.items);
      if (queuesRes.data) setQueues(queuesRes.data);
      if (profRes.data) setProfiles(profRes.data);
      if (logRes.data) setExecutionLogs(logRes.data);
    })();
  }, [service]);

  // --- Derived ---
  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) ?? null;
  const activeJobs = jobs.filter((j) => j.status === 'ASSIGNED' || j.status === 'CREATED');
  const unackedAlerts = alerts.filter((a) => !a.acknowledged);
  const canvasEditable = !selectedJob;

  const graphSteps: PipelineStep[] = selectedPipeline
    ? selectedPipeline.steps.map((s) => {
        const jobStep = selectedJob ? selectedJob.steps.find((js) => js.order === s.order) : undefined;
        // 백엔드 호환용 CSC/Level 파생
        const targetCsc = s.kind === 'SAR' && s.sarStage
          ? SAR_STAGE_TO_CSC[s.sarStage]
          : s.kind === 'CATALOG' ? 'CSC-07'
          : s.kind === 'JOB_INIT' ? 'CSC-08'
          : 'CSC-02'; // TRIGGER / FILE_INPUT
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

  // --- Pipeline mutation ---
  const updatePipeline = useCallback(
    async (data: { steps?: Omit<PipelineStepDefinition, 'order'>[]; edges?: { source: number; target: number }[] }) => {
      if (!selectedPipelineId) return;
      const res = await service.파이프라인을_수정한다(selectedPipelineId, data);
      if (res.data) setPipelines((prev) => prev.map((p) => (p.id === selectedPipelineId ? res.data! : p)));
    },
    [service, selectedPipelineId],
  );

  // --- Canvas handlers ---
  const handleNodeClick = useCallback(
    (stepOrder: number) => {
      const step = selectedPipeline?.steps.find((s) => s.order === stepOrder);

      // D-01: TRIGGER 노드 클릭 — job 선택 여부와 관계없이 수신 정보 표시
      if (step?.kind === 'TRIGGER') {
        setConsoleMode({
          type: 'trigger',
          receivedAt: selectedJob?.receivedAt ?? '—',
          rawDataPath: selectedJob?.rawDataPath ?? '—',
        });
        setRightTab('console');
        setRightCollapsed(false);
        return;
      }

      // FILE_INPUT 노드 클릭 — 부분 재처리 입력 레벨 표시
      if (step?.kind === 'FILE_INPUT') {
        setConsoleMode({
          type: 'fileInput',
          inputLevel: step.inputLevel ?? 'LEVEL_1',
        });
        setRightTab('console');
        setRightCollapsed(false);
        return;
      }

      // CSU-08.02: JOB_INIT 노드 클릭
      if (step?.kind === 'JOB_INIT') {
        if (selectedJob) {
          setConsoleMode({
            type: 'jobInit',
            processingProfile: selectedJob.processingProfile,
            jobCreatedAt: selectedJob.startedAt,
            priority: selectedJob.priority,
            triggerSource: selectedJob.triggerSource,
          });
        } else if (selectedPipeline) {
          setConsoleMode({
            type: 'jobInitEdit',
            step,
            satelliteId: selectedPipeline.satelliteId,
            mode: selectedPipeline.mode,
          });
        }
        setRightTab('console');
        setRightCollapsed(false);
        return;
      }

      if (selectedJob) return;

      if (step) {
        setConsoleMode({ type: 'node', step });
        setRightTab('console');
        setRightCollapsed(false);
      }
    },
    [selectedJob, selectedPipeline],
  );

  const handleConnect = useCallback(
    (sourceOrder: number, targetOrder: number) => {
      if (!selectedPipeline) return;
      const exists = selectedPipeline.edges.some((e) => e.source === sourceOrder && e.target === targetOrder);
      if (exists) return;
      const newEdges = [...selectedPipeline.edges, { source: sourceOrder, target: targetOrder }];
      updatePipeline({ edges: newEdges });
    },
    [selectedPipeline, updatePipeline],
  );

  const handleDeleteNode = useCallback(
    (order: number) => {
      if (!selectedPipeline || selectedPipeline.steps.length <= 1) return;
      const step = selectedPipeline.steps.find((s) => s.order === order);
      if (step?.kind === 'TRIGGER' || step?.kind === 'FILE_INPUT') return; // 진입점 노드 삭제 불가
      const newSteps = selectedPipeline.steps
        .filter((s) => s.order !== order)
        .map((s) => ({ kind: s.kind, sarStage: s.sarStage, inputLevel: s.inputLevel, enabledTasks: s.enabledTasks, jobInitConfig: s.jobInitConfig }));
      const newEdges = selectedPipeline.edges.filter((e) => e.source !== order && e.target !== order);
      updatePipeline({ steps: newSteps, edges: newEdges });
      if (consoleMode.type === 'node' && consoleMode.step.order === order) setConsoleMode({ type: 'idle' });
    },
    [selectedPipeline, updatePipeline, consoleMode],
  );

  const handleDeleteEdge = useCallback(
    (sourceOrder: number, targetOrder: number) => {
      if (!selectedPipeline) return;
      const newEdges = selectedPipeline.edges.filter((e) => !(e.source === sourceOrder && e.target === targetOrder));
      updatePipeline({ edges: newEdges });
    },
    [selectedPipeline, updatePipeline],
  );

  const profileMissing = (() => {
    if (!selectedPipeline) return false;
    const jobInitStep = selectedPipeline.steps.find((s) => s.kind === 'JOB_INIT');
    if (!jobInitStep) return false;
    return !jobInitStep.jobInitConfig?.profileId;
  })();

  const jobInitWarningReason = profileMissing ? JOB_INIT_PROFILE_MISSING_MESSAGE : undefined;

  const handleTriggerPipeline = useCallback(async () => {
    if (!selectedPipelineId) return;
    const res = await service.파이프라인을_실행한다(selectedPipelineId);
    if (res.success) {
      if (profileMissing) {
        setToast({
          message: `${res.message} — 처리 프로파일이 파이프라인에 없습니다. 캔버스의 「작업 초기화」노드 안내를 확인하세요.`,
          type: 'warning',
        });
      } else {
        setToast({ message: res.message, type: 'success' });
      }
      const [jobsRes, logRes] = await Promise.all([
        service.Job_목록을_조회한다(),
        service.실행_로그를_조회한다({ limit: 300 }),
      ]);
      if (jobsRes.success && jobsRes.data) setJobs(jobsRes.data.items);
      if (logRes.data) setExecutionLogs(logRes.data);
      setRightTab('jobs');
      setRightCollapsed(false);
      setLogPanelOpen(true);
    } else {
      setToast({ message: res.message, type: 'error' });
    }
  }, [selectedPipelineId, service, profileMissing]);

  const handleAddNode = useCallback(
    (afterOrder: number, beforeOrder?: number) => {
      setConsoleMode({ type: 'addStep', afterOrder, beforeOrder });
      setRightTab('console');
      setRightCollapsed(false);
    },
    [],
  );

  const handleConfirmAddStep = useCallback(
    (afterOrder: number, kind: PipelineNodeKind, sarStage?: SarStage) => {
      if (!selectedPipeline) return;
      const newStep: { kind: PipelineNodeKind; sarStage?: SarStage; jobInitConfig?: import('@/types/pipeline').JobInitConfig } =
        kind === 'JOB_INIT'
          ? { kind, jobInitConfig: { polarization: '', priority: 5, retryInterval: 'IMMEDIATE' as const } }
          : { kind, sarStage };
      const newSteps = [
        ...selectedPipeline.steps.map((s) => ({ kind: s.kind, sarStage: s.sarStage, inputLevel: s.inputLevel, enabledTasks: s.enabledTasks, jobInitConfig: s.jobInitConfig })),
        newStep,
      ];
      const newOrder = newSteps.length;
      const beforeOrder = consoleMode.type === 'addStep' ? consoleMode.beforeOrder : undefined;
      let newEdges = [...selectedPipeline.edges];
      if (beforeOrder !== undefined) {
        newEdges = newEdges.filter((e) => !(e.source === afterOrder && e.target === beforeOrder));
        newEdges.push({ source: afterOrder, target: newOrder });
        newEdges.push({ source: newOrder, target: beforeOrder });
      } else {
        if (afterOrder > 0) {
          newEdges.push({ source: afterOrder, target: newOrder });
        }
      }
      updatePipeline({ steps: newSteps, edges: newEdges });
      setConsoleMode({ type: 'idle' });
    },
    [selectedPipeline, updatePipeline, consoleMode],
  );

  const handleSaveNode = useCallback(
    (updated: PipelineStepDefinition) => {
      if (!selectedPipeline) return;
      const newSteps = selectedPipeline.steps.map((s) =>
        s.order === updated.order
          ? { kind: updated.kind, sarStage: updated.sarStage, inputLevel: updated.inputLevel, enabledTasks: updated.enabledTasks, jobInitConfig: updated.jobInitConfig }
          : { kind: s.kind, sarStage: s.sarStage, inputLevel: s.inputLevel, enabledTasks: s.enabledTasks, jobInitConfig: s.jobInitConfig },
      );
      updatePipeline({ steps: newSteps });
    },
    [selectedPipeline, updatePipeline],
  );

  // --- Job handlers ---
  const handleSelectJob = useCallback(async (jobId: string) => {
    const res = await service.Job_상세를_조회한다(jobId);
    if (res.data) {
      setSelectedJob(res.data);
      setConsoleMode({ type: 'job', job: res.data });
      setRightTab('console');
      setRightCollapsed(false);
    }
  }, [service]);

  const handleAckAlert = useCallback(async (alertId: string) => {
    const alert = alerts.find((a) => a.id === alertId);
    const res = await service.Alert을_확인한다(alertId, { ifMatchVersion: alert?.version });
    if (!res.success && res.code === 409) {
      setToast({ message: '이미 다른 운영자가 확인한 알림입니다', type: 'error' });
    }
    const [aRes, sRes] = await Promise.all([service.Alert_목록을_조회한다(), service.대시보드_통계를_조회한다()]);
    if (aRes.data) setAlerts(aRes.data);
    if (sRes.data) setStats(sRes.data);
  }, [service, alerts]);

  const handleReprocessJob = useCallback(() => {
    if (!selectedJob) return;
    setReprocessDialogOpen(true);
  }, [selectedJob]);

  const handleReprocessConfirm = useCallback(async () => {
    if (!selectedJob) return;
    setReprocessDialogOpen(false);
    await service.Job을_재처리한다(selectedJob.jobId);
    const [jRes, jsRes] = await Promise.all([service.Job_상세를_조회한다(selectedJob.jobId), service.Job_목록을_조회한다({ limit: 50 })]);
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
    const [jRes, jsRes] = await Promise.all([service.Job_상세를_조회한다(selectedJob.jobId), service.Job_목록을_조회한다({ limit: 50 })]);
    if (jRes.data) { setSelectedJob(jRes.data); setConsoleMode({ type: 'job', job: jRes.data }); }
    if (jsRes.data) setJobs(jsRes.data.items);
  }, [service, selectedJob]);

  // D-02: 부분 재처리
  const handlePartialReprocess = useCallback(async (sarStage: SarStage) => {
    if (!selectedJob) return;
    await service.부분_재처리를_요청한다(selectedJob.jobId, { sarStage });
    const [jRes, jsRes] = await Promise.all([service.Job_상세를_조회한다(selectedJob.jobId), service.Job_목록을_조회한다({ limit: 50 })]);
    if (jRes.data) { setSelectedJob(jRes.data); setConsoleMode({ type: 'job', job: jRes.data }); }
    if (jsRes.data) setJobs(jsRes.data.items);
  }, [service, selectedJob]);

  const handleDeletePipeline = useCallback(async (id: string) => {
    await service.파이프라인을_삭제한다(id);
    setPipelines((prev) => prev.filter((p) => p.id !== id));
    if (selectedPipelineId === id) {
      setSelectedPipelineId(null);
      setSelectedJob(null);
      setConsoleMode({ type: 'idle' });
    }
  }, [service, selectedPipelineId]);

  // --- Pipeline handlers ---
  const handleSavePipeline = useCallback(async (data: { name: string; satelliteId: string; mode: string; steps: { kind: PipelineNodeKind; sarStage?: SarStage }[] }) => {
    if (!selectedPipelineId) return;
    setEditSaving(true);
    const res = await service.파이프라인을_수정한다(selectedPipelineId, data);
    if (res.data) setPipelines((prev) => prev.map((p) => (p.id === selectedPipelineId ? res.data! : p)));
    setEditSaving(false);
    setConsoleMode({ type: 'idle' });
  }, [service, selectedPipelineId]);

  const handleCreatePipeline = useCallback(() => {
    setCreateStep('step1');
  }, []);

  const handleCreateStep1Next = useCallback((data: CreatePipelineBasicData) => {
    setCreateBasicData(data);
    setCreateStep('step2');
  }, []);

  const handleCreateStep2Confirm = useCallback(async (selection: StartNodeSelection) => {
    if (!createBasicData) return;
    setCreateStep(null);
    const steps: { kind: PipelineNodeKind; sarStage?: SarStage; inputLevel?: import('@/types/pipeline').ProductLevel }[] = [
      { kind: selection.startNodeKind, inputLevel: selection.startNodeInputLevel },
    ];
    const res = await service.파이프라인을_생성한다({ ...createBasicData, steps });
    if (res.data) {
      setPipelines((prev) => [...prev, res.data!]);
      setSelectedPipelineId(res.data.id);
      setFocusEntryTrigger((n) => n + 1);
    }
    setCreateBasicData(null);
  }, [service, createBasicData]);

  const handleCreateCancel = useCallback(() => {
    setCreateStep(null);
    setCreateBasicData(null);
  }, []);

  const handleNodeOpenDetail = useCallback((stepOrder: number) => {
    const step = selectedPipeline?.steps.find((s) => s.order === stepOrder);
    if (step) setNodeDetailStep(step);
  }, [selectedPipeline]);

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left: Pipelines + Settings */}
      <LeftSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        pipelines={pipelines}
        selectedPipelineId={selectedPipelineId}
        selectedPipelineName={selectedPipeline?.name ?? null}
        onSelectPipeline={(id) => {
          setSelectedPipelineId(id);
          setSelectedJob(null);
          setConsoleMode({ type: 'idle' });
        }}
        onCreatePipeline={handleCreatePipeline}
        onDeletePipeline={handleDeletePipeline}
        stats={stats}
        alertCount={unackedAlerts.length}
        onAlertClick={() => setAlertModalOpen(true)}
      />

      {/* Center: Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar queues={queues} />
        {selectedJob && graphSteps.length > 0 && (
          <PipelineProgressStepper steps={graphSteps} />
        )}
          {graphSteps.length > 0 ? (
            <div className="flex-1 relative overflow-hidden">
              <CanvasGraph
                pipelineId={selectedPipelineId}
                steps={graphSteps}
                pipelineEdges={graphEdges}
                editable={canvasEditable}
                onNodeClick={handleNodeClick}
                onDeleteNode={handleDeleteNode}
                onAddNode={handleAddNode}
                onConnect={handleConnect}
                onDeleteEdge={handleDeleteEdge}
                onTrigger={handleTriggerPipeline}
                jobInitWarningReason={jobInitWarningReason}
                focusEntryTrigger={focusEntryTrigger}
                onNodeOpenDetail={handleNodeOpenDetail}
              />
              {/* n8n 스타일 플로팅 실행 버튼 — 캔버스 하단 중앙 */}
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                <button
                  type="button"
                  disabled={!selectedPipelineId || !!selectedJob}
                  onClick={handleTriggerPipeline}
                  className="pointer-events-auto flex items-center gap-2 pl-2.5 pr-3.5 py-2 rounded-lg
                             text-[11px] font-semibold shadow-lg whitespace-nowrap
                             bg-accent text-accent-foreground
                             hover:brightness-110 active:brightness-95 transition-all
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  파이프라인 실행
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground gap-3">
              <span className="text-sm">파이프라인을 선택하거나 새로 만드세요</span>
              <button
                onClick={handleCreatePipeline}
                className="px-3 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 transition-colors"
              >
                새 파이프라인
              </button>
            </div>
          )}

          {/* Bottom: Execution Log Panel */}
          <ExecutionLogPanel
            logs={executionLogs}
            selectedJobId={selectedJob?.jobId}
            open={logPanelOpen}
            onToggle={() => setLogPanelOpen((v) => !v)}
          />
        </div>

      {/* Right: Tabbed Panel */}
      <RightTabbedPanel
          collapsed={rightCollapsed}
          onToggle={() => setRightCollapsed((v) => !v)}
          activeTab={rightTab}
          onTabChange={setRightTab}
          alertCount={unackedAlerts.length}
          jobCount={activeJobs.length}
        >
          {rightTab === 'console' && (
            <ConsoleTab
              mode={consoleMode}
              onSaveNode={handleSaveNode}
              onDeleteNode={handleDeleteNode}
              onConfirmAddStep={handleConfirmAddStep}
              onReprocessJob={handleReprocessJob}
              onPartialReprocess={handlePartialReprocess}
              onCancelJob={handleCancelJob}
              onSavePipeline={handleSavePipeline}
              pipelineSaving={editSaving}
              availableProfiles={profiles}
            />
          )}
          {rightTab === 'jobs' && (
            <JobsTab jobs={jobs} selectedJobId={selectedJob?.jobId ?? null} onSelectJob={handleSelectJob} />
          )}
          {rightTab === 'alerts' && (
            <AlertsTab alerts={alerts} onAck={handleAckAlert} onSelectJob={handleSelectJob} />
          )}
          {rightTab === 'queues' && (
            <QueuesTab queues={queues} />
          )}
          {rightTab === 'audit' && (
            <AuditTab events={auditEvents} onSelectJob={handleSelectJob} />
          )}
      </RightTabbedPanel>

      {/* Alert Modal */}
      <AlertModal
        open={alertModalOpen}
        onClose={() => setAlertModalOpen(false)}
        alerts={alerts}
        onAck={handleAckAlert}
        onSelectJob={(jobId) => { setAlertModalOpen(false); handleSelectJob(jobId); }}
      />

      {/* S-01 + S-02: 재처리 확인 다이얼로그 — Job ID 타이핑 필요 */}
      {reprocessDialogOpen && selectedJob && (
        <ReprocessConfirmDialog
          jobId={selectedJob.jobId}
          sceneId={selectedJob.sceneId}
          onConfirm={handleReprocessConfirm}
          onCancel={() => setReprocessDialogOpen(false)}
        />
      )}

      {/* S-01: 취소 확인 다이얼로그 */}
      {cancelDialogOpen && selectedJob && (
        <CancelConfirmDialog
          jobId={selectedJob.jobId}
          onConfirm={handleCancelConfirm}
          onCancel={() => setCancelDialogOpen(false)}
        />
      )}

      {/* 파이프라인 생성 1단계 — 이름/위성/모드 */}
      {createStep === 'step1' && (
        <CreatePipelineDialog
          onNext={handleCreateStep1Next}
          onCancel={handleCreateCancel}
        />
      )}

      {/* 파이프라인 생성 2단계 — 시작 노드 선택 */}
      {createStep === 'step2' && createBasicData && (
        <SelectStartNodeDialog
          pipelineName={createBasicData.name}
          satelliteId={createBasicData.satelliteId}
          mode={createBasicData.mode}
          onConfirm={handleCreateStep2Confirm}
          onBack={() => setCreateStep('step1')}
          onCancel={handleCreateCancel}
        />
      )}

      {/* 노드 상세 모달 — 더블클릭 또는 툴바 Play */}
      {nodeDetailStep && (
        <NodeDetailModal
          step={nodeDetailStep}
          onClose={() => setNodeDetailStep(null)}
        />
      )}

      {/* S-03: 동시성 충돌 토스트 */}
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
