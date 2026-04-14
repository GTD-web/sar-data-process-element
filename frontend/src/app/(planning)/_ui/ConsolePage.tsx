'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
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
import CreatePipelineDialog from '@/components/panels/CreatePipelineDialog';
import Toast, { type ToastMessage } from '@/components/ui/Toast';
import type {
  PipelineDefinition,
  PipelineStepDefinition,
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
import { SAR_STAGE_TO_CSC, SAR_STAGE_TO_LEVEL } from '@/types/pipeline';

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

  // --- UI State ---
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('console');
  const [consoleMode, setConsoleMode] = useState<ConsoleMode>({ type: 'idle' });
  const [editSaving, setEditSaving] = useState(false);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [reprocessDialogOpen, setReprocessDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [createPipelineDialogOpen, setCreatePipelineDialogOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // --- Load ---
  useEffect(() => {
    (async () => {
      const [plRes, statsRes, jobsRes, alertsRes, auditRes, queuesRes] = await Promise.all([
        service.파이프라인_목록을_조회한다(),
        service.대시보드_통계를_조회한다(),
        service.Job_목록을_조회한다({ limit: 50 }),
        service.Alert_목록을_조회한다(),
        service.감사로그를_조회한다({ size: 50 }),
        service.큐_상태를_조회한다(),
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
          : s.kind === 'CATALOG' ? 'CSC-07' : 'CSC-02';
        const productLevel = s.kind === 'SAR' && s.sarStage
          ? SAR_STAGE_TO_LEVEL[s.sarStage]
          : 'LEVEL_0';
        return {
          order: s.order,
          kind: s.kind,
          sarStage: s.sarStage,
          targetCsc,
          productLevel,
          status: jobStep?.status ?? 'PENDING',
          durationMs: jobStep?.durationMs,
          errorMessage: jobStep?.errorMessage,
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
      if (step?.kind === 'TRIGGER') return; // D-01: TRIGGER 노드는 삭제 불가
      const newSteps = selectedPipeline.steps
        .filter((s) => s.order !== order)
        .map((s) => ({ kind: s.kind, sarStage: s.sarStage }));
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
      const newSteps = [
        ...selectedPipeline.steps.map((s) => ({ kind: s.kind, sarStage: s.sarStage })),
        { kind, sarStage },
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
          ? { kind: updated.kind, sarStage: updated.sarStage }
          : { kind: s.kind, sarStage: s.sarStage },
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
    setCreatePipelineDialogOpen(true);
  }, []);

  const handleCreatePipelineConfirm = useCallback(async (data: { name: string; satelliteId: string; mode: string }) => {
    setCreatePipelineDialogOpen(false);
    const modeSteps: Record<string, { kind: PipelineNodeKind; sarStage?: SarStage }[]> = {
      Stripmap: [
        { kind: 'TRIGGER' },
        { kind: 'SAR', sarStage: 'L0' },
        { kind: 'SAR', sarStage: 'L1A' },
        { kind: 'SAR', sarStage: 'L1B' },
        { kind: 'SAR', sarStage: 'L1C' },
        { kind: 'SAR', sarStage: 'L2A' },
        { kind: 'SAR', sarStage: 'L2B' },
        { kind: 'SAR', sarStage: 'L3' },
        { kind: 'CATALOG' },
      ],
      ScanSAR: [
        { kind: 'TRIGGER' },
        { kind: 'SAR', sarStage: 'L0' },
        { kind: 'SAR', sarStage: 'L1A' },
        { kind: 'SAR', sarStage: 'L1B' },
        { kind: 'CATALOG' },
      ],
      Spotlight: [
        { kind: 'TRIGGER' },
        { kind: 'SAR', sarStage: 'L0' },
        { kind: 'SAR', sarStage: 'L1A' },
        { kind: 'SAR', sarStage: 'L1B' },
        { kind: 'SAR', sarStage: 'L1C' },
        { kind: 'CATALOG' },
      ],
    };
    const steps = modeSteps[data.mode] ?? modeSteps['Stripmap']!;
    const res = await service.파이프라인을_생성한다({ ...data, steps });
    if (res.data) {
      setPipelines((prev) => [...prev, res.data!]);
      setSelectedPipelineId(res.data.id);
    }
  }, [service]);

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
        stats={stats}
        alertCount={unackedAlerts.length}
        onAlertClick={() => setAlertModalOpen(true)}
      />

      {/* Center: Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <TopBar queues={queues} />
          {graphSteps.length > 0 ? (
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
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center bg-background text-muted-foreground gap-3">
              <span className="text-sm">파이프라인을 선택하거나 새로 만드세요</span>
              <button
                onClick={handleCreatePipeline}
                className="px-3 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 transition-colors"
              >
                새 파이프라인
              </button>
            </div>
          )}
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

      {/* S-01: 파이프라인 생성 다이얼로그 */}
      {createPipelineDialogOpen && (
        <CreatePipelineDialog
          onConfirm={handleCreatePipelineConfirm}
          onCancel={() => setCreatePipelineDialogOpen(false)}
        />
      )}

      {/* S-03: 동시성 충돌 토스트 */}
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
