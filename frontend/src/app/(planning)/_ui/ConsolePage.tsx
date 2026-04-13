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
  TargetCsc,
  ProductLevel,
} from '@/types/pipeline';

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
        return {
          order: s.order,
          kind: s.kind,
          targetCsc: s.targetCsc,
          productLevel: s.productLevel,
          status: jobStep?.status ?? 'PENDING',
          durationMs: jobStep?.durationMs,
          errorMessage: jobStep?.errorMessage,
        };
      })
    : [];

  const graphEdges = selectedPipeline?.edges ?? [];

  // --- Pipeline mutation ---
  const updatePipeline = useCallback(
    async (data: { steps?: { targetCsc: TargetCsc; productLevel: ProductLevel }[]; edges?: { source: number; target: number }[] }) => {
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
      // Add new edge (avoid duplicates)
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
        .map((s) => ({ targetCsc: s.targetCsc, productLevel: s.productLevel }));
      // Remove edges that reference the deleted node
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
    (afterOrder: number, targetCsc: TargetCsc, productLevel: ProductLevel) => {
      if (!selectedPipeline) return;
      const newSteps = [
        ...selectedPipeline.steps.map((s) => ({ targetCsc: s.targetCsc, productLevel: s.productLevel })),
        { targetCsc, productLevel },
      ];
      const newOrder = newSteps.length; // new step gets the last order
      const beforeOrder = consoleMode.type === 'addStep' ? consoleMode.beforeOrder : undefined;
      let newEdges = [...selectedPipeline.edges];
      if (beforeOrder !== undefined) {
        // Inserting between two nodes: remove old edge, add two new edges
        newEdges = newEdges.filter((e) => !(e.source === afterOrder && e.target === beforeOrder));
        newEdges.push({ source: afterOrder, target: newOrder });
        newEdges.push({ source: newOrder, target: beforeOrder });
      } else {
        // Appending after a node
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
          ? { targetCsc: updated.targetCsc, productLevel: updated.productLevel }
          : { targetCsc: s.targetCsc, productLevel: s.productLevel },
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
    await service.Alert을_확인한다(alertId);
    const [aRes, sRes] = await Promise.all([service.Alert_목록을_조회한다(), service.대시보드_통계를_조회한다()]);
    if (aRes.data) setAlerts(aRes.data);
    if (sRes.data) setStats(sRes.data);
  }, [service]);

  const handleReprocessJob = useCallback(async () => {
    if (!selectedJob || !confirm(`Job ${selectedJob.jobId}을(를) 재처리하시겠습니까?`)) return;
    await service.Job을_재처리한다(selectedJob.jobId);
    const [jRes, jsRes] = await Promise.all([service.Job_상세를_조회한다(selectedJob.jobId), service.Job_목록을_조회한다({ limit: 50 })]);
    if (jRes.data) { setSelectedJob(jRes.data); setConsoleMode({ type: 'job', job: jRes.data }); }
    if (jsRes.data) setJobs(jsRes.data.items);
  }, [service, selectedJob]);

  const handleCancelJob = useCallback(async () => {
    if (!selectedJob || !confirm(`Job ${selectedJob.jobId}을(를) 취소하시겠습니까?`)) return;
    await service.Job을_취소한다(selectedJob.jobId);
    const [jRes, jsRes] = await Promise.all([service.Job_상세를_조회한다(selectedJob.jobId), service.Job_목록을_조회한다({ limit: 50 })]);
    if (jRes.data) { setSelectedJob(jRes.data); setConsoleMode({ type: 'job', job: jRes.data }); }
    if (jsRes.data) setJobs(jsRes.data.items);
  }, [service, selectedJob]);

  // D-02: 부분 재처리
  const handlePartialReprocess = useCallback(async (targetLevel: ProductLevel) => {
    if (!selectedJob) return;
    // 해당 레벨의 첫 번째 CSC 스텝을 대상으로 지정
    const targetStep = selectedJob.steps.find((s) => s.kind !== 'TRIGGER' && s.productLevel === targetLevel);
    const targetCsc = targetStep?.targetCsc ?? 'CSC-03';
    await service.부분_재처리를_요청한다(selectedJob.jobId, { targetLevel, targetCsc });
    const [jRes, jsRes] = await Promise.all([service.Job_상세를_조회한다(selectedJob.jobId), service.Job_목록을_조회한다({ limit: 50 })]);
    if (jRes.data) { setSelectedJob(jRes.data); setConsoleMode({ type: 'job', job: jRes.data }); }
    if (jsRes.data) setJobs(jsRes.data.items);
  }, [service, selectedJob]);

  // --- Pipeline handlers ---
  const handleSavePipeline = useCallback(async (data: { name: string; satelliteId: string; mode: string; steps: { targetCsc: TargetCsc; productLevel: ProductLevel }[] }) => {
    if (!selectedPipelineId) return;
    setEditSaving(true);
    const res = await service.파이프라인을_수정한다(selectedPipelineId, data);
    if (res.data) setPipelines((prev) => prev.map((p) => (p.id === selectedPipelineId ? res.data! : p)));
    setEditSaving(false);
    setConsoleMode({ type: 'idle' });
  }, [service, selectedPipelineId]);

  const handleCreatePipeline = useCallback(async () => {
    const name = prompt('파이프라인 이름을 입력하세요:');
    if (!name) return;
    const res = await service.파이프라인을_생성한다({
      name, satelliteId: 'KS-5', mode: 'Stripmap',
      steps: [
        { targetCsc: 'CSC-02', productLevel: 'LEVEL_0' },
        { targetCsc: 'CSC-03', productLevel: 'LEVEL_0' },
        { targetCsc: 'CSC-04', productLevel: 'LEVEL_1' },
        { targetCsc: 'CSC-05', productLevel: 'LEVEL_2' },
        { targetCsc: 'CSC-06', productLevel: 'LEVEL_3' },
        { targetCsc: 'CSC-07', productLevel: 'LEVEL_3' },
      ],
    });
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
    </div>
  );
}
