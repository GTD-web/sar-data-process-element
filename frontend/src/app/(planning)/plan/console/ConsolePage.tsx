'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import LeftSidebar from '@/components/panels/LeftSidebar';
import PipelineManagementTabs from '@/components/panels/PipelineManagementTabs';
import RightTabbedPanel from '@/components/panels/RightTabbedPanel';
import ConsoleTab, { type ConsoleMode } from '@/components/panels/ConsoleTab';
import { useMockRole } from '@/components/auth/RolePreviewSelect';

import ReprocessConfirmDialog from '@/components/panels/ReprocessConfirmDialog';
import CancelConfirmDialog from '@/components/panels/CancelConfirmDialog';
import CreatePipelineDialog, { type CreatePipelineBasicData } from '@/components/panels/CreatePipelineDialog';
import SelectStartNodeDialog, { type StartNodeSelection } from '@/components/panels/SelectStartNodeDialog';
import NodeDetailModal, { type PrevNodeInfo } from '@/components/panels/NodeDetailModal';
import FileInputConfigDialog from '@/components/panels/FileInputConfigDialog';
import PipelineArchiveConfirmDialog from '@/components/panels/PipelineArchiveConfirmDialog';
import PipelineDeleteConfirmDialog from '@/components/panels/PipelineDeleteConfirmDialog';
import PipelineUndeployConfirmDialog from '@/components/panels/PipelineUndeployConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { Plus, GitBranch, Pencil, Check, X, Radio, UploadCloud, Info, Archive } from 'lucide-react';
import type {
  PipelineDefinition,
  PipelineStepDefinition,
  FileInputConfig,
  ProcessingProfile,
  ExecutionLog,
  JobDetail,
  JobSummary,
  PipelineStep,
  SarStage,
  PipelineNodeKind,
  PipelineActivationRule,
} from '@/types/pipeline';
import {
  JOB_INIT_PROFILE_MISSING_MESSAGE,
  SAR_STAGE_LABELS,
  SAR_STAGE_TO_CSC,
  SAR_STAGE_TO_LEVEL,
} from '@/types/pipeline';

// ---------------------------------------------------------------------------
// Pipeline Name Badge (canvas overlay)
// ---------------------------------------------------------------------------

function PipelineNameBadge({
  name,
  editable,
  onRename,
}: {
  name: string;
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
            <button onClick={handleSubmit} className="p-0.5 rounded hover:bg-success/20 transition-colors" title="Save">
              <Check className="w-3.5 h-3.5 text-success" />
            </button>
            <button onClick={handleCancel} className="p-0.5 rounded hover:bg-destructive/20 transition-colors" title="Cancel">
              <X className="w-3.5 h-3.5 text-destructive" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => editable && setEditing(true)}
            className={`group flex items-center gap-1.5 ${editable ? 'cursor-pointer' : 'cursor-default'}`}
            title={editable ? 'Edit name' : undefined}
          >
            <span className="text-xs font-semibold text-foreground">{name}</span>
            {editable && (
              <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function PipelineActivationPanel({
  rules,
  canManage,
  deploying,
  onSetDeployment,
}: {
  rules: PipelineActivationRule[];
  canManage: boolean;
  deploying: boolean;
  onSetDeployment: (active: boolean) => void;
}) {
  const [openTooltipId, setOpenTooltipId] = useState<string | null>(null);
  const activeRules = rules.filter((rule) => rule.active);
  const visibleRules = activeRules.length > 0 ? activeRules : rules;
  const deployed = activeRules.length > 0;
  const summaryText = deployed
    ? 'Connected to operational events for automatic execution.'
    : 'Not connected to operational events yet.';
  const headerTooltip = deployed
    ? 'When enabled, pgmq events are matched against this rule and matching raw-data events start this pipeline automatically.'
    : 'When disabled, operational events will not start this pipeline automatically.';

  const toggleTooltip = (id: string) => {
    setOpenTooltipId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="absolute top-14 left-3 z-10 w-[440px] max-w-[calc(100%-1.5rem)] overflow-visible rounded-xl border border-border/80 bg-card/92 shadow-[0_14px_40px_rgba(15,23,42,0.14)] backdrop-blur-sm">
      <div className="border-b border-border/70 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border ${
              deployed
                ? 'border-success/20 bg-success/10 text-success'
                : 'border-border bg-muted/35 text-muted-foreground'
            }`}>
              <Radio className="h-4 w-4" />
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold leading-tight text-foreground">Automatic Execution Link</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  deployed ? 'bg-success/10 text-success' : 'bg-muted/60 text-muted-foreground'
                }`}>
                  {deployed ? 'DEPLOYED' : 'DRAFT'}
                </span>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">{summaryText}</p>
            </div>
          </div>
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => toggleTooltip('summary')}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                openTooltipId === 'summary'
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
              title="Show activation details"
              aria-label="Show activation details"
              aria-expanded={openTooltipId === 'summary'}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
            {openTooltipId === 'summary' && (
              <div
                role="tooltip"
                className="absolute right-0 top-9 z-20 w-[260px] rounded-md border border-border bg-card px-3 py-2 text-left text-[10px] leading-relaxed text-foreground shadow-xl"
              >
                {headerTooltip}
              </div>
            )}
          </div>
        </div>
      </div>

      {visibleRules.length === 0 && (
        <div className="px-3 py-3 text-xs text-muted-foreground border-b border-border/60">
          Activation conditions cannot be created. Check the entry node and pipeline properties.
        </div>
      )}

      <div className="flex items-center justify-between gap-3 bg-muted/15 px-3 py-2.5">
        <div className="text-[10px] leading-relaxed text-muted-foreground">
          {deployed ? 'Automatic execution is active.' : 'Enable this link to start automatic execution.'}
        </div>
        {canManage && visibleRules.length > 0 && (
          <button
            type="button"
            disabled={deploying}
            onClick={() => onSetDeployment(!deployed)}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
              deployed
                ? 'border border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/15'
                : 'bg-accent text-accent-foreground hover:brightness-110'
            }`}
          >
            <UploadCloud className="h-3.5 w-3.5" />
            {deployed ? 'Deactivate' : 'Activate'}
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
      Loading graph...
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
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [profiles, setProfiles] = useState<ProcessingProfile[]>([]);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [activationRules, setActivationRules] = useState<PipelineActivationRule[]>([]);

  // --- UI State ---
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [previewRole] = useMockRole();
  const [consoleMode, setConsoleMode] = useState<ConsoleMode>({ type: 'idle' });
  const [deploymentSaving, setDeploymentSaving] = useState(false);
  const [reprocessDialogOpen, setReprocessDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [createStep, setCreateStep] = useState<'step1' | 'step2' | null>(null);
  const [createBasicData, setCreateBasicData] = useState<CreatePipelineBasicData | null>(null);
  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [focusEntryTrigger, setFocusEntryTrigger] = useState(0);
  const [nodeDetailStep, setNodeDetailStep] = useState<PipelineStepDefinition | null>(null);
  const [fileInputConfigStep, setFileInputConfigStep] = useState<PipelineStepDefinition | null>(null);
  const [archivePipelineTarget, setArchivePipelineTarget] = useState<PipelineDefinition | null>(null);
  const [deletePipelineTarget, setDeletePipelineTarget] = useState<PipelineDefinition | null>(null);
  const [undeployTarget, setUndeployTarget] = useState<PipelineDefinition | null>(null);
  const [activeStepOrder, setActiveStepOrder] = useState<number | null>(null);
  const [popoverClickY, setPopoverClickY] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const terminalToastKeysRef = useRef<Set<string>>(new Set());

  // --- Load ---
  useEffect(() => {
    (async () => {
      const [plRes, profRes, logRes, jobsRes, activationRes] = await Promise.all([
        service.파이프라인_목록을_조회한다(),
        service.처리_프로파일_목록을_조회한다(),
        service.실행_로그를_조회한다({ limit: 300 }),
        service.Job_목록을_조회한다({ limit: 100 }),
        service.파이프라인_자동실행규칙을_조회한다(),
      ]);
      const isCreateMode = searchParams.get('create') === 'true';

      if (plRes.data) {
        setPipelines(plRes.data);
        const urlPipelineId = searchParams.get('pipelineId');
        const matchedPipeline = urlPipelineId ? plRes.data.find((pipeline) => pipeline.id === urlPipelineId) : undefined;
        // create 모드가 아닐 때만 첫 파이프라인 자동 선택
        if (!isCreateMode && matchedPipeline) setSelectedPipelineId(matchedPipeline.id);
        else if (!isCreateMode && plRes.data.length > 0) setSelectedPipelineId(plRes.data[0].id);
      }
      if (profRes.data) setProfiles(profRes.data);
      if (logRes.data) setExecutionLogs(logRes.data);
      if (jobsRes.data) setJobs(jobsRes.data.items);
      if (activationRes.data) setActivationRules(activationRes.data);

    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams는 초기 로드에만 사용
  }, [service]);

  // --- Derived ---
  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) ?? null;
  const selectedActivationRules = selectedPipelineId
    ? activationRules.filter((rule) => rule.pipelineId === selectedPipelineId)
    : [];
  const pipelineJobs = selectedPipelineId
    ? jobs
        .filter((job) => job.pipelineId === selectedPipelineId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    : [];
  const canManage = previewRole === 'Administrator';
  const canvasEditable = canManage;
  const disabledNodeOrders = new Set(selectedPipeline?.steps.filter((s) => s.disabled).map((s) => s.order) ?? []);

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
          durationMs: jobStep?.durationMs,
          errorMessage: jobStep?.errorMessage,
          enabledTasks: s.enabledTasks,
          status: s.disabled && !selectedJob ? 'SKIPPED' : (jobStep?.status ?? 'PENDING'),
        };
      })
    : [];

  const graphEdges = selectedPipeline?.edges ?? [];

  // --- Pipeline mutation ---
  const refreshActivationRules = useCallback(async () => {
    const res = await service.파이프라인_자동실행규칙을_조회한다();
    if (res.data) setActivationRules(res.data);
  }, [service]);

  const updatePipeline = useCallback(
    async (data: { name?: string; satelliteTags?: string[]; modeTags?: string[]; polarizationTags?: string[]; steps?: Omit<PipelineStepDefinition, 'order'>[]; edges?: { source: number; target: number }[] }) => {
      if (!selectedPipelineId) return;
      const res = await service.파이프라인을_수정한다(selectedPipelineId, data);
      if (res.data) {
        setPipelines((prev) => prev.map((p) => (p.id === selectedPipelineId ? res.data! : p)));
        await refreshActivationRules();
      }
    },
    [service, selectedPipelineId, refreshActivationRules],
  );

  const toStepUpdate = useCallback((step: PipelineStepDefinition): Omit<PipelineStepDefinition, 'order'> => ({
    kind: step.kind,
    sarStage: step.sarStage,
    inputLevel: step.inputLevel,
    parentOrder: step.parentOrder,
    enabledTasks: step.enabledTasks,
    jobInitConfig: step.jobInitConfig,
    fileInputConfig: step.fileInputConfig,
    disabled: step.disabled,
  }), []);

  const handleToggleNodeActive = useCallback((order: number) => {
    if (!selectedPipeline) return;
    const step = selectedPipeline.steps.find((s) => s.order === order);
    if (!step || step.kind === 'TRIGGER' || step.kind === 'FILE_INPUT') return;

    const nextSteps = selectedPipeline.steps.map((s) =>
      s.order === order ? { ...toStepUpdate(s), disabled: !s.disabled } : toStepUpdate(s),
    );
    updatePipeline({ steps: nextSteps });
    toast.success(step.disabled ? 'Node bypass removed.' : 'Node saved as bypassed.');
  }, [selectedPipeline, toStepUpdate, updatePipeline]);

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
        .map(toStepUpdate);
      const newEdges = selectedPipeline.edges.filter((e) => e.source !== order && e.target !== order);
      updatePipeline({ steps: newSteps, edges: newEdges });
      if (consoleMode.type === 'node' && consoleMode.step.order === order) setConsoleMode({ type: 'idle' });
    },
    [selectedPipeline, updatePipeline, consoleMode, toStepUpdate],
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
        toast.warning(`${res.message} - Processing profile is missing from the pipeline. Check the Job Init node on the canvas.`);
      } else {
        toast.success(res.message);
      }
      const logRes = await service.실행_로그를_조회한다({ limit: 300 });
      if (logRes.data) setExecutionLogs(logRes.data);
      const jobsRes = await service.Job_목록을_조회한다({ limit: 100 });
      if (jobsRes.data) setJobs(jobsRes.data.items);
      setLogPanelOpen(true);

      // 생성된 Job을 자동 선택하여 실행 진행 상황을 추적
      if (res.data) {
        const jobDetailRes = await service.Job_상세를_조회한다(res.data.jobId);
        if (jobDetailRes.data) {
          setSelectedJob(jobDetailRes.data);
          setConsoleMode({ type: 'job', job: jobDetailRes.data });
        }
      }
    } else {
      toast.error(res.message);
    }
  }, [selectedPipelineId, service, profileMissing]);

  const handleSetDeployment = useCallback(async (active: boolean) => {
    if (!selectedPipelineId) return;
    if (!active && selectedPipeline) {
      setUndeployTarget(selectedPipeline);
      return;
    }
    setDeploymentSaving(true);
    const res = await service.파이프라인_배포상태를_변경한다(selectedPipelineId, active);
    setDeploymentSaving(false);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    await refreshActivationRules();
    toast.success(active ? 'Automatic execution link activated.' : 'Automatic execution link deactivated.');
  }, [service, selectedPipelineId, selectedPipeline, refreshActivationRules]);

  const handleConfirmUndeploy = useCallback(async () => {
    if (!undeployTarget) return;
    setDeploymentSaving(true);
    const res = await service.파이프라인_배포상태를_변경한다(undeployTarget.id, false);
    setDeploymentSaving(false);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    setUndeployTarget(null);
    await refreshActivationRules();
    toast.success('Automatic execution link deactivated.');
  }, [service, undeployTarget, refreshActivationRules]);

  const handleSelectJobFromSidebar = useCallback(async (jobId: string) => {
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
        ...selectedPipeline.steps.map(toStepUpdate),
        newStep,
      ];
      const newOrder = newSteps.length;
      const beforeOrder = consoleMode.type === 'addStep' ? consoleMode.beforeOrder : undefined;
      const asSeparateStart = consoleMode.type === 'addStep' ? consoleMode.asSeparateStart === true : false;
      let newEdges = [...selectedPipeline.edges];
      if (asSeparateStart) {
        // 우상단 + 버튼은 기존 DAG와 분리된 새로운 시작 노드를 만든다.
      } else if (beforeOrder !== undefined) {
        if (afterOrder > 0) {
          newEdges = newEdges.filter((e) => !(e.source === afterOrder && e.target === beforeOrder));
          newEdges.push({ source: afterOrder, target: newOrder });
        }
        newEdges.push({ source: newOrder, target: beforeOrder });
      } else {
        if (afterOrder > 0) {
          newEdges.push({ source: afterOrder, target: newOrder });
        }
      }
      updatePipeline({ steps: newSteps, edges: newEdges });
      setConsoleMode({ type: 'idle' });
      setRightCollapsed(true);
    },
    [selectedPipeline, updatePipeline, consoleMode, toStepUpdate],
  );

  const handleSaveNode = useCallback(
    (updated: PipelineStepDefinition) => {
      if (!selectedPipeline) return;
      const newSteps = selectedPipeline.steps.map((s) =>
        s.order === updated.order
          ? toStepUpdate(updated)
          : toStepUpdate(s),
      );
      updatePipeline({ steps: newSteps });
    },
    [selectedPipeline, updatePipeline, toStepUpdate],
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
      ? `after ${fileInput.inputLevel.replace('LEVEL_', 'L')} input`
      : 'from the beginning';
    const res = await service.Job을_재처리한다(jobId);
    if (res.success) {
      toast.success(`Job ${jobId} full reprocess started ${startLabel}.`);
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
      toast.success(`Job ${jobId} reprocess started from ${sarStage} · ${stageLabel}.`);
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

  const handleArchivePipeline = useCallback(async (id: string, reason: string) => {
    if (!canManage) return;
    const res = await service.파이프라인을_아카이브한다(id, true, reason);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    toast.success('Pipeline archived.');
    setPipelines((prev) => prev.filter((p) => p.id !== id));
    await refreshActivationRules();
    if (selectedPipelineId === id) {
      setSelectedPipelineId(null);
      setSelectedJob(null);
      setActiveStepOrder(null);
      setConsoleMode({ type: 'idle' });
      updateJobIdParam(null);
    }
    setArchivePipelineTarget(null);
  }, [service, selectedPipelineId, updateJobIdParam, canManage, refreshActivationRules]);

  const handleDeletePipeline = useCallback(async (id: string) => {
    if (!canManage) return;
    const res = await service.파이프라인을_삭제한다(id);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    toast.success('Pipeline deleted.');
    setPipelines((prev) => prev.filter((p) => p.id !== id));
    await refreshActivationRules();
    if (selectedPipelineId === id) {
      setSelectedPipelineId(null);
      setSelectedJob(null);
      setActiveStepOrder(null);
      setConsoleMode({ type: 'idle' });
      updateJobIdParam(null);
    }
    setDeletePipelineTarget(null);
  }, [service, selectedPipelineId, updateJobIdParam, canManage, refreshActivationRules]);

  const handleCreatePipeline = useCallback(() => {
    if (!canManage) return;
    setSelectedPipelineId(null);
    setSelectedJob(null);
    setActiveStepOrder(null);
    setConsoleMode({ type: 'idle' });
    setRightCollapsed(true);
    setCreateStep('step1');
  }, [canManage]);

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
      await refreshActivationRules();
      setFocusEntryTrigger((n) => n + 1);
    }
    setCreateBasicData(null);
  }, [service, createBasicData, refreshActivationRules]);

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
      if (s.kind === 'TRIGGER') { label = 'Raw Data Receive Trigger'; csc = 'EI-01'; }
      else if (s.kind === 'FILE_INPUT') { label = 'Result File Input'; csc = 'SI-07'; }
      else if (s.kind === 'JOB_INIT') { label = 'Job Initialization'; csc = 'CSC-08.02'; }
      else if (s.kind === 'CATALOG') { label = 'Catalog Registration'; csc = 'CSC-07'; }
      else if (s.kind === 'SAR' && s.sarStage) { label = SAR_STAGE_LABELS[s.sarStage]; csc = SAR_STAGE_TO_CSC[s.sarStage]; }
      else { label = 'Node'; csc = '—'; }
      results.push({ order: s.order, kind: s.kind, sarStage: s.sarStage, inputLevel: s.inputLevel, label, csc });
    }
    return results;
  }, [selectedPipeline]);

  const handleRenamePipeline = useCallback(async (newName: string) => {
    if (!selectedPipelineId) return;
    const res = await service.파이프라인을_수정한다(selectedPipelineId, { name: newName });
    if (res.success && res.data) {
      setPipelines((prev) => prev.map((p) => (p.id === selectedPipelineId ? { ...p, name: res.data!.name } : p)));
      await refreshActivationRules();
      toast.success('Pipeline name changed.');
    } else {
      toast.error(res.message);
    }
  }, [service, selectedPipelineId, refreshActivationRules]);

  const handleOpenNodesPanel = useCallback(() => {
    if (!selectedPipeline || selectedPipeline.steps.length === 0) return;
    setConsoleMode({ type: 'addStep', afterOrder: 0, asSeparateStart: true });
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
      await refreshActivationRules();
    }
    setFileInputConfigStep(null);
  }, [selectedPipelineId, fileInputConfigStep, selectedPipeline, service, refreshActivationRules]);

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
          updateJobIdParam(null);
        }}
        onCreatePipeline={handleCreatePipeline}
        onDeletePipeline={(id) => {
          const target = pipelines.find((p) => p.id === id);
          if (target) setDeletePipelineTarget(target);
        }}
        canManagePipelines={canManage}
        activePage="console"
      />

      {/* Center: Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5 shrink-0">
            <PipelineManagementTabs active="pipelines" counts={{ pipelines: pipelines.length }} />
            <div className="flex items-center gap-2">
              {canManage && (
                <button
                  type="button"
                  onClick={handleCreatePipeline}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[11px] font-semibold text-accent-foreground transition-colors hover:brightness-110"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Pipeline
                </button>
              )}
              {canManage && selectedPipeline && (
                <button
                  type="button"
                  onClick={() => setArchivePipelineTarget(selectedPipeline)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-warning/45 hover:bg-warning/10 hover:text-warning"
                >
                  <Archive className="h-3.5 w-3.5" />
                  Archive Pipeline
                </button>
              )}
            </div>
          </div>
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
                jobInitWarningReason={jobInitWarningReason}
                focusEntryTrigger={focusEntryTrigger}
                onNodeOpenDetail={handleNodeOpenDetail}
                disabledNodeOrders={disabledNodeOrders}
                onToggleNodeActive={handleToggleNodeActive}
              />
              {/* 캔버스 좌측 상단 — 파이프라인 이름 */}
              {selectedPipeline && (
                <PipelineNameBadge
                  name={selectedPipeline.name}
                  editable={canvasEditable}
                  onRename={handleRenamePipeline}
                />
              )}
              {selectedPipeline && !selectedJob && (
                <PipelineActivationPanel
                  rules={selectedActivationRules}
                  canManage={canManage}
                  deploying={deploymentSaving}
                  onSetDeployment={handleSetDeployment}
                />
              )}
              {/* 캔버스 우측 상단 툴바 — 세로 정렬 */}
              <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5">
                {canvasEditable && selectedPipeline && (
                  <button
                    type="button"
                    onClick={handleOpenNodesPanel}
                    className="p-1.5 rounded-md bg-card/80 backdrop-blur-sm border border-border shadow-sm
                               text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    title="Add node"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 relative flex items-center justify-center bg-background">
              <div className="flex items-center gap-6">
                {canManage && (
                  <>
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
                        Create Pipeline
                      </span>
                    </button>

                    <span className="text-sm text-muted-foreground/40">or</span>
                  </>
                )}

                {/* Select existing pipeline */}
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
                    Open Pipeline
                  </span>
                </button>
              </div>
            </div>
          )}

        </div>

      {/* Right: Tabbed Panel */}
      <RightTabbedPanel
          collapsed={rightCollapsed}
          onToggle={() => {
            setRightCollapsed(true);
            setConsoleMode({ type: 'idle' });
          }}
          showCollapsedToggle={false}
          title="Add Node"
        >
          <ConsoleTab
            mode={consoleMode}
            onSaveNode={handleSaveNode}
            onDeleteNode={handleDeleteNode}
            onConfirmAddStep={handleConfirmAddStep}
            onReprocessJob={handleReprocessJob}
            onPartialReprocess={handlePartialReprocess}
            onCancelJob={handleCancelJob}
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
      {canManage && createStep === 'step1' && (
        <CreatePipelineDialog
          onNext={handleCreateStep1Next}
          onCancel={handleCreateCancel}
        />
      )}

      {/* 파이프라인 생성 2단계 — 시작 노드 선택 */}
      {canManage && createStep === 'step2' && createBasicData && (
        <SelectStartNodeDialog
          pipelineName={createBasicData.name}
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
          satelliteId={undefined}
          mode={undefined}
          prevNodes={getPrevNodes(nodeDetailStep.order)}
        />
      )}

      {archivePipelineTarget && (
        <PipelineArchiveConfirmDialog
          pipelineName={archivePipelineTarget.name}
          onConfirm={(reason) => handleArchivePipeline(archivePipelineTarget.id, reason)}
          onCancel={() => setArchivePipelineTarget(null)}
        />
      )}

      {deletePipelineTarget && (
        <PipelineDeleteConfirmDialog
          pipelineName={deletePipelineTarget.name}
          onConfirm={() => handleDeletePipeline(deletePipelineTarget.id)}
          onCancel={() => setDeletePipelineTarget(null)}
        />
      )}

      {undeployTarget && (
        <PipelineUndeployConfirmDialog
          pipelineName={undeployTarget.name}
          onConfirm={handleConfirmUndeploy}
          onCancel={() => setUndeployTarget(null)}
        />
      )}

    </div>
  );
}
