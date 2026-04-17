'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import PipelineProgressStepper from '@/components/graph/PipelineProgressStepper';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import LeftSidebar from '@/components/panels/LeftSidebar';
import RightTabbedPanel from '@/components/panels/RightTabbedPanel';
import ConsoleTab, { type ConsoleMode } from '@/components/panels/ConsoleTab';

import ReprocessConfirmDialog from '@/components/panels/ReprocessConfirmDialog';
import CancelConfirmDialog from '@/components/panels/CancelConfirmDialog';
import CreatePipelineDialog, { type CreatePipelineBasicData } from '@/components/panels/CreatePipelineDialog';
import SelectStartNodeDialog, { type StartNodeSelection } from '@/components/panels/SelectStartNodeDialog';
import ExecutionLogPanel from '@/components/panels/ExecutionLogPanel';
import StepDetailPopover from '@/components/panels/StepDetailPopover';
import NodeDetailModal, { type PrevNodeInfo } from '@/components/panels/NodeDetailModal';
import FileInputConfigDialog from '@/components/panels/FileInputConfigDialog';
import { toast } from '@/components/ui/Toast';
import { FlaskConical, Plus, PanelRightOpen, GitBranch, Pencil, Check, X } from 'lucide-react';
import type {
  PipelineDefinition,
  PipelineStepDefinition,
  FileInputConfig,
  ProcessingProfile,
  ExecutionLog,
  JobDetail,
  PipelineStep,
  SarStage,
  PipelineNodeKind,
} from '@/types/pipeline';
import { SAR_STAGE_TO_CSC, SAR_STAGE_TO_LEVEL, SAR_STAGE_LABELS, JOB_INIT_PROFILE_MISSING_MESSAGE } from '@/types/pipeline';

// ---------------------------------------------------------------------------
// Pipeline Name Badge (canvas overlay)
// ---------------------------------------------------------------------------

function PipelineNameBadge({
  name,
  satellite,
  mode,
  editable,
  onRename,
}: {
  name: string;
  satellite: string;
  mode: string;
  editable: boolean;
  onRename: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft when pipeline changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 파이프라인 전환 시 편집 상태 리셋 (외부 prop 동기화)
    setDraft(name);
    setEditing(false);
  }, [name]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) {
      onRename(trimmed);
    } else {
      setDraft(name);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(name);
    setEditing(false);
  };

  return (
    <div className="absolute top-3 left-3 z-10">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-card/80 backdrop-blur-sm border border-border shadow-sm">
        <GitBranch className="w-3.5 h-3.5 text-accent shrink-0" />

        {editing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
                if (e.key === 'Escape') handleCancel();
              }}
              className="bg-background border border-accent rounded px-1.5 py-0.5 text-xs font-semibold text-foreground focus:outline-none w-48"
              autoFocus
            />
            <button onClick={handleSubmit} className="p-0.5 rounded hover:bg-success/20 transition-colors" title="저장">
              <Check className="w-3.5 h-3.5 text-success" />
            </button>
            <button onClick={handleCancel} className="p-0.5 rounded hover:bg-destructive/20 transition-colors" title="취소">
              <X className="w-3.5 h-3.5 text-destructive" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => editable && setEditing(true)}
            className={`group flex items-center gap-1.5 ${editable ? 'cursor-pointer' : 'cursor-default'}`}
            title={editable ? '클릭하여 이름 수정' : undefined}
          >
            <span className="text-xs font-semibold text-foreground">{name}</span>
            <span className="text-[10px] text-muted-foreground">
              {satellite} · {mode}
            </span>
            {editable && (
              <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const updateJobIdParam = useCallback((jobId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (jobId) {
      params.set('jobId', jobId);
    } else {
      params.delete('jobId');
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [searchParams, router, pathname]);

  // --- Data ---
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
  const [profiles, setProfiles] = useState<ProcessingProfile[]>([]);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);

  // --- UI State ---
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [consoleMode, setConsoleMode] = useState<ConsoleMode>({ type: 'idle' });
  const [editSaving, setEditSaving] = useState(false);
  const [reprocessDialogOpen, setReprocessDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [createStep, setCreateStep] = useState<'step1' | 'step2' | null>(null);
  const [createBasicData, setCreateBasicData] = useState<CreatePipelineBasicData | null>(null);
  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [focusEntryTrigger, setFocusEntryTrigger] = useState(0);
  const [nodeDetailStep, setNodeDetailStep] = useState<PipelineStepDefinition | null>(null);
  const [fileInputConfigStep, setFileInputConfigStep] = useState<PipelineStepDefinition | null>(null);
  const [disabledNodeOrders, setDisabledNodeOrders] = useState<Set<number>>(new Set());
  const [activeStepOrder, setActiveStepOrder] = useState<number | null>(null);
  const [popoverClickY, setPopoverClickY] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);

  // --- Load ---
  useEffect(() => {
    (async () => {
      const [plRes, profRes, logRes] = await Promise.all([
        service.파이프라인_목록을_조회한다(),
        service.처리_프로파일_목록을_조회한다(),
        service.실행_로그를_조회한다({ limit: 300 }),
      ]);
      const isCreateMode = searchParams.get('create') === 'true';

      if (plRes.data) {
        setPipelines(plRes.data);
        // create 모드가 아닐 때만 첫 파이프라인 자동 선택
        if (!isCreateMode && plRes.data.length > 0) setSelectedPipelineId(plRes.data[0].id);
      }
      if (profRes.data) setProfiles(profRes.data);
      if (logRes.data) setExecutionLogs(logRes.data);

      // URL에 jobId가 있으면 자동 선택
      const urlJobId = searchParams.get('jobId');
      if (urlJobId) {
        const jobRes = await service.Job_상세를_조회한다(urlJobId);
        if (jobRes.data) {
          setSelectedJob(jobRes.data);
          setConsoleMode({ type: 'job', job: jobRes.data });
          
          setRightCollapsed(false);
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams는 초기 로드에만 사용
  }, [service]);

  // --- 실행 중인 Job 폴링 (ASSIGNED/CREATED 상태일 때 1초 간격으로 갱신) ---
  useEffect(() => {
    if (!selectedJob) return;
    if (selectedJob.status !== 'ASSIGNED' && selectedJob.status !== 'CREATED') return;

    const interval = setInterval(async () => {
      const res = await service.Job_상세를_조회한다(selectedJob.jobId);
      if (res.data) {
        setSelectedJob(res.data);
        setConsoleMode({ type: 'job', job: res.data });

        // 완료/실패 시 폴링 중지 (다음 체크에서 조건 불일치로 자동 정리)
        if (res.data.status === 'COMPLETED') {
          toast.success(`Job ${res.data.jobId} 처리가 완료되었습니다`);
        } else if (res.data.status === 'FAILED') {
          toast.error(`Job ${res.data.jobId} 처리 중 오류가 발생했습니다`);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedJob, service]);

  const handleToggleNodeActive = useCallback((order: number) => {
    setDisabledNodeOrders((prev) => {
      const next = new Set(prev);
      if (next.has(order)) {
        next.delete(order);
      } else {
        next.add(order);
      }
      return next;
    });
  }, []);

  // --- Derived ---
  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) ?? null;
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
      if (res.data) {
        setPipelines((prev) => prev.map((p) => (p.id === selectedPipelineId ? res.data! : p)));
        setDisabledNodeOrders(new Set()); // 노드 order 재배치 시 바이패스 상태 초기화
      }
    },
    [service, selectedPipelineId],
  );

  // --- Canvas handlers ---
  const handleNodeClick = useCallback(
    (stepOrder: number, clickY: number) => {
      if (!selectedJob) return;
      const activeStep = selectedJob.steps.find((s) => s.order === stepOrder);
      if (!activeStep) return;
      // 이미 열려 있는 팝오버를 다시 클릭하면 닫기
      if (activeStepOrder === stepOrder) {
        setActiveStepOrder(null);
        return;
      }
      setActiveStepOrder(stepOrder);
      setPopoverClickY(clickY);
    },
    [selectedJob, activeStepOrder],
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
        toast.warning(`${res.message} — 처리 프로파일이 파이프라인에 없습니다. 캔버스의 「작업 초기화」노드 안내를 확인하세요.`);
      } else {
        toast.success(res.message);
      }
      const logRes = await service.실행_로그를_조회한다({ limit: 300 });
      if (logRes.data) setExecutionLogs(logRes.data);
      setLogPanelOpen(true);

      // 생성된 Job을 자동 선택하여 실행 진행 상황을 추적
      if (res.data) {
        const jobDetailRes = await service.Job_상세를_조회한다(res.data.jobId);
        if (jobDetailRes.data) {
          setSelectedJob(jobDetailRes.data);
          setConsoleMode({ type: 'job', job: jobDetailRes.data });
          
          setRightCollapsed(false);
        }
      }
    } else {
      toast.error(res.message);
    }
  }, [selectedPipelineId, service, profileMissing]);

  const handleAddNode = useCallback(
    (afterOrder: number, beforeOrder?: number) => {
      setConsoleMode({ type: 'addStep', afterOrder, beforeOrder });
      
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
  const handleReprocessJob = useCallback(() => {
    if (!selectedJob) return;
    setReprocessDialogOpen(true);
  }, [selectedJob]);

  const handleReprocessConfirm = useCallback(async () => {
    if (!selectedJob) return;
    setReprocessDialogOpen(false);
    const jobId = selectedJob.jobId;
    const fileInput = selectedJob.steps.find((s) => s.kind === 'FILE_INPUT');
    const startLabel = fileInput?.inputLevel
      ? `${fileInput.inputLevel.replace('LEVEL_', 'L')} 입력 이후`
      : '처음부터';
    const res = await service.Job을_재처리한다(jobId);
    if (res.success) {
      toast.success(`Job ${jobId} 전체 재처리를 ${startLabel} 시작했습니다`);
    } else {
      toast.error(res.message);
    }
    const jRes = await service.Job_상세를_조회한다(jobId);
    if (jRes.data) {
      setSelectedJob(jRes.data);
      setConsoleMode({ type: 'job', job: jRes.data });
    }
  }, [service, selectedJob]);

  const handleCancelJob = useCallback(() => {
    if (!selectedJob) return;
    setCancelDialogOpen(true);
  }, [selectedJob]);

  const handleCancelConfirm = useCallback(async () => {
    if (!selectedJob) return;
    setCancelDialogOpen(false);
    await service.Job을_취소한다(selectedJob.jobId);
    const jRes = await service.Job_상세를_조회한다(selectedJob.jobId);
    if (jRes.data) { setSelectedJob(jRes.data); setConsoleMode({ type: 'job', job: jRes.data }); }
  }, [service, selectedJob]);

  // D-02: 부분 재처리
  const handlePartialReprocess = useCallback(async (sarStage: SarStage) => {
    if (!selectedJob) return;
    const jobId = selectedJob.jobId;
    const stageLabel = SAR_STAGE_LABELS[sarStage];
    const res = await service.부분_재처리를_요청한다(jobId, { sarStage });
    if (res.success) {
      toast.success(`Job ${jobId} ${sarStage} · ${stageLabel} 노드부터 재처리를 시작했습니다`);
    } else {
      toast.error(res.message);
    }
    const jRes = await service.Job_상세를_조회한다(jobId);
    if (jRes.data) {
      setSelectedJob(jRes.data);
      setConsoleMode({ type: 'job', job: jRes.data });
    }
  }, [service, selectedJob]);

  // D-02: 노드 order 기반 부분 재처리 (캔버스 노드 toolbar에서 호출)
  const handleReprocessFromNode = useCallback((order: number) => {
    if (!selectedJob || !selectedPipeline) return;
    const step = selectedPipeline.steps.find((s) => s.order === order);
    if (!step || step.kind !== 'SAR' || !step.sarStage) return;
    handlePartialReprocess(step.sarStage);
  }, [selectedJob, selectedPipeline, handlePartialReprocess]);

  const handleDeletePipeline = useCallback(async (id: string) => {
    await service.파이프라인을_삭제한다(id);
    setPipelines((prev) => prev.filter((p) => p.id !== id));
    if (selectedPipelineId === id) {
      setSelectedPipelineId(null);
      setSelectedJob(null);
      setActiveStepOrder(null);
      setConsoleMode({ type: 'idle' });
      setDisabledNodeOrders(new Set());
      updateJobIdParam(null);
    }
  }, [service, selectedPipelineId, updateJobIdParam]);

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
    // 파이프라인 선택 해제 → 빈 캔버스로 이동 (거기서 모달 진입)
    setSelectedPipelineId(null);
    setSelectedJob(null);
    setActiveStepOrder(null);
    setConsoleMode({ type: 'idle' });
    setDisabledNodeOrders(new Set());
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
    if (!step) return;
    if (step.kind === 'FILE_INPUT') {
      setFileInputConfigStep(step);
      return;
    }
    setNodeDetailStep(step);
  }, [selectedPipeline]);

  /** 노드 상세 모달용 — 이전 노드 정보 계산 */
  const getPrevNodes = useCallback((stepOrder: number): PrevNodeInfo[] => {
    if (!selectedPipeline) return [];
    const sourceOrders = selectedPipeline.edges
      .filter((e) => e.target === stepOrder)
      .map((e) => e.source);
    const results: PrevNodeInfo[] = [];
    for (const order of sourceOrders) {
      const s = selectedPipeline.steps.find((st) => st.order === order);
      if (!s) continue;
      let label: string;
      let csc: string;
      if (s.kind === 'TRIGGER') { label = '원시 데이터 수신 트리거'; csc = 'EI-01'; }
      else if (s.kind === 'FILE_INPUT') { label = '결과 파일 입력'; csc = 'SI-07'; }
      else if (s.kind === 'JOB_INIT') { label = '작업 초기화'; csc = 'CSC-08.02'; }
      else if (s.kind === 'CATALOG') { label = '카탈로그 등록'; csc = 'CSC-07'; }
      else if (s.kind === 'SAR' && s.sarStage) { label = SAR_STAGE_LABELS[s.sarStage]; csc = SAR_STAGE_TO_CSC[s.sarStage]; }
      else { label = '노드'; csc = '—'; }
      results.push({ order: s.order, kind: s.kind, sarStage: s.sarStage, inputLevel: s.inputLevel, label, csc });
    }
    return results;
  }, [selectedPipeline]);

  const handleRenamePipeline = useCallback(async (newName: string) => {
    if (!selectedPipelineId) return;
    const res = await service.파이프라인을_수정한다(selectedPipelineId, { name: newName });
    if (res.success && res.data) {
      setPipelines((prev) => prev.map((p) => (p.id === selectedPipelineId ? { ...p, name: res.data!.name } : p)));
      toast.success('파이프라인 이름이 변경되었습니다');
    } else {
      toast.error(res.message);
    }
  }, [service, selectedPipelineId]);

  const handleOpenNodesPanel = useCallback(() => {
    if (!selectedPipeline || selectedPipeline.steps.length === 0) return;
    const lastOrder = Math.max(...selectedPipeline.steps.map((s) => s.order));
    setConsoleMode({ type: 'addStep', afterOrder: lastOrder });
    setRightCollapsed(false);
  }, [selectedPipeline]);

  const handleFileInputConfigApply = useCallback(async (config: FileInputConfig) => {
    if (!selectedPipelineId || !fileInputConfigStep || !selectedPipeline) return;
    const updatedSteps = selectedPipeline.steps.map((s) =>
      s.order === fileInputConfigStep.order ? { ...s, fileInputConfig: config } : s,
    );
    const res = await service.파이프라인을_수정한다(selectedPipelineId, { steps: updatedSteps });
    if (res.success && res.data) {
      setPipelines((prev) => prev.map((p) => (p.id === selectedPipelineId ? res.data! : p)));
    }
    setFileInputConfigStep(null);
  }, [selectedPipelineId, fileInputConfigStep, selectedPipeline, service]);

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left: Pipelines + Settings */}
      <LeftSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        pipelines={pipelines}
        selectedPipelineId={selectedPipelineId}
        onSelectPipeline={(id) => {
          setSelectedPipelineId(id);
          setSelectedJob(null);
          setActiveStepOrder(null);
          setConsoleMode({ type: 'idle' });
          setDisabledNodeOrders(new Set());
          updateJobIdParam(null);
        }}
        onCreatePipeline={handleCreatePipeline}
        onDeletePipeline={handleDeletePipeline}
        activePage="console"
      />

      {/* Center: Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
          {graphSteps.length > 0 ? (
            <div ref={canvasRef} className="flex-1 relative overflow-hidden">
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
                onTrigger={selectedJob?.status === 'ASSIGNED' ? undefined : handleTriggerPipeline}
                jobInitWarningReason={jobInitWarningReason}
                focusEntryTrigger={focusEntryTrigger}
                onNodeOpenDetail={handleNodeOpenDetail}
                disabledNodeOrders={disabledNodeOrders}
                onToggleNodeActive={handleToggleNodeActive}
                onReprocessStep={selectedJob ? handleReprocessFromNode : undefined}
                isJobMode={!!selectedJob}
              />
              {/* 캔버스 좌측 상단 — 파이프라인 이름 */}
              {selectedPipeline && (
                <PipelineNameBadge
                  name={selectedPipeline.name}
                  satellite={selectedPipeline.satelliteId}
                  mode={selectedPipeline.mode}
                  editable={canvasEditable}
                  onRename={handleRenamePipeline}
                />
              )}
              {/* 캔버스 우측 상단 툴바 — 세로 정렬 */}
              <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
                {canvasEditable && selectedPipeline && (
                  <button
                    type="button"
                    onClick={handleOpenNodesPanel}
                    className="p-1.5 rounded-md bg-card/80 backdrop-blur-sm border border-border shadow-sm
                               text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    title="노드 추가"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
                {rightCollapsed && (
                  <button
                    type="button"
                    onClick={() => setRightCollapsed(false)}
                    className="p-1.5 rounded-md bg-card/80 backdrop-blur-sm border border-border shadow-sm
                               text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    title="패널 열기"
                  >
                    <PanelRightOpen className="w-4 h-4" />
                  </button>
                )}
              </div>
              {/* n8n 스타일 플로팅 실행 버튼 — 캔버스 하단 중앙 (Job 선택 시 숨김) */}
              {!selectedJob && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                  <button
                    type="button"
                    disabled={!selectedPipelineId}
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
              )}
              {/* 단계 상세 팝오버 — 클릭한 카드 높이에 맞춰 캔버스 우측에 렌더링 */}
              {selectedJob && activeStepOrder != null && activeStepOrder > 0 && (() => {
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
            <div className="flex-1 flex items-center justify-center bg-background">
              <div className="flex items-center gap-6">
                {/* 새 파이프라인 만들기 */}
                <button
                  type="button"
                  onClick={() => setCreateStep('step1')}
                  className="group flex flex-col items-center justify-center w-40 h-40
                             border-2 border-dashed border-border rounded-xl
                             hover:border-accent/50 hover:bg-accent/5 transition-all"
                >
                  <Plus className="w-10 h-10 text-muted-foreground/50 group-hover:text-accent transition-colors" />
                  <span className="text-sm text-muted-foreground group-hover:text-foreground mt-3 transition-colors">
                    새 파이프라인 만들기
                  </span>
                </button>

                <span className="text-sm text-muted-foreground/40">or</span>

                {/* 기존 파이프라인 선택 */}
                <button
                  type="button"
                  onClick={() => {
                    if (pipelines.length > 0) {
                      setSelectedPipelineId(pipelines[0]!.id);
                    }
                  }}
                  className="group flex flex-col items-center justify-center w-40 h-40
                             border-2 border-dashed border-border rounded-xl
                             hover:border-accent/50 hover:bg-accent/5 transition-all"
                >
                  <GitBranch className="w-10 h-10 text-muted-foreground/50 group-hover:text-accent transition-colors" />
                  <span className="text-sm text-muted-foreground group-hover:text-foreground mt-3 transition-colors">
                    기존 파이프라인 열기
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Progress Stepper — 실행 로그 패널 위 */}
          {selectedJob && graphSteps.length > 0 && (
            <PipelineProgressStepper steps={graphSteps} />
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
          showCollapsedToggle={false}
          title={consoleMode.type === 'addStep' ? '노드 추가' : '콘솔'}
        >
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
            onStepClick={(order, clickY) => { setActiveStepOrder(order); setPopoverClickY(clickY); }}
            activeStepOrder={activeStepOrder}
          />
      </RightTabbedPanel>

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

      {/* FILE_INPUT 노드 설정 다이얼로그 — 더블클릭 또는 툴바 Play */}
      {fileInputConfigStep && fileInputConfigStep.inputLevel && (
        <FileInputConfigDialog
          inputLevel={fileInputConfigStep.inputLevel}
          current={fileInputConfigStep.fileInputConfig}
          onConfirm={handleFileInputConfigApply}
          onCancel={() => setFileInputConfigStep(null)}
        />
      )}

      {/* 노드 상세 모달 — 더블클릭 또는 툴바 Play */}
      {nodeDetailStep && (
        <NodeDetailModal
          step={nodeDetailStep}
          onClose={() => setNodeDetailStep(null)}
          onSaveNode={canvasEditable ? handleSaveNode : undefined}
          availableProfiles={profiles}
          satelliteId={selectedPipeline?.satelliteId}
          mode={selectedPipeline?.mode}
          prevNodes={getPrevNodes(nodeDetailStep.order)}
        />
      )}

    </div>
  );
}
