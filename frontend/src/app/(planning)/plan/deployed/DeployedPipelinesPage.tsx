'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GitBranch,
  Loader2,
  Plus,
  Power,
  ServerCog,
  X,
} from 'lucide-react';
import LeftSidebar from '@/components/panels/LeftSidebar';
import PipelineExecutionTabs from '@/components/panels/PipelineExecutionTabs';
import ExecutionLogPanel from '@/components/panels/ExecutionLogPanel';
import { useMockRole } from '@/components/auth/RolePreviewSelect';
import { toast } from '@/components/ui/Toast';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import type {
  ExecutionLog,
  JobSummary,
  PipelineActivationRule,
  PipelineDefinition,
  PipelineEventType,
  PipelineStep,
  ProductLevel,
  SavePipelineActivationRuleData,
  TriggerSource,
} from '@/types/pipeline';
import {
  PGMQ_EVENT_TBD_QUEUE,
  PIPELINE_EVENT_SOURCE_QUEUE,
  PIPELINE_EVENT_TYPE_LABELS,
  POLARIZATION_OPTIONS,
  PRODUCT_LEVEL_LABELS,
  SATELLITE_OPTIONS,
  MODE_OPTIONS,
  SAR_STAGE_TO_CSC,
  SAR_STAGE_TO_LEVEL,
  TRIGGER_SOURCE_LABELS,
} from '@/types/pipeline';

const CanvasGraph = dynamic(() => import('@/components/graph/CanvasGraph'), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 items-center justify-center rounded-lg border border-border bg-background/50 text-sm text-muted-foreground">
      Loading pipeline UI...
    </div>
  ),
});

const DEPLOYMENT_TABLE_WIDTH = 1380;
const DEPLOYMENT_TABLE_GRID = '92px 220px 220px 250px 150px minmax(220px,1fr) 116px';
const EVENT_TYPE_OPTIONS: PipelineEventType[] = ['RAW_DATA_RECEIVED', 'PARTIAL_REPROCESS_REQUESTED', 'PRODUCT_REPROCESS_REQUESTED'];
const PRODUCT_LEVEL_OPTIONS: ProductLevel[] = ['LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];

type RuleFormState = {
  id: string | null;
  pipelineId: string;
  active: boolean;
  eventType: PipelineEventType;
  sourceQueue: string;
  satelliteId: string;
  mode: string;
  polarization: string;
  inputLevel: ProductLevel | '';
  triggerSource: TriggerSource;
  description: string;
};

function makeEmptyRuleForm(): RuleFormState {
  const eventType: PipelineEventType = 'RAW_DATA_RECEIVED';
  return {
    id: null,
    pipelineId: '',
    active: true,
    eventType,
    sourceQueue: PIPELINE_EVENT_SOURCE_QUEUE[eventType],
    satelliteId: '',
    mode: '',
    polarization: '',
    inputLevel: '',
    triggerSource: 'PIPELINE_AUTO',
    description: 'Automatically runs the selected pipeline when an incoming pgmq event matches the conditions.',
  };
}

function ruleToForm(rule: PipelineActivationRule): RuleFormState {
  return {
    id: rule.id,
    pipelineId: rule.pipelineId,
    active: rule.active,
    eventType: rule.eventType,
    sourceQueue: PIPELINE_EVENT_SOURCE_QUEUE[rule.eventType],
    satelliteId: rule.match.satelliteIds?.[0] ?? '',
    mode: rule.match.modes?.[0] ?? '',
    polarization: rule.match.polarizations?.[0] ?? '',
    inputLevel: rule.match.inputLevel ?? '',
    triggerSource: rule.triggerSource,
    description: rule.description,
  };
}

function ruleConditions(rule: PipelineActivationRule): string[] {
  return [
    ...(rule.match.satelliteIds ?? []),
    ...(rule.match.modes ?? []),
    ...(rule.match.polarizations ?? []),
    rule.match.inputLevel ? PRODUCT_LEVEL_LABELS[rule.match.inputLevel] : undefined,
  ].filter((condition): condition is string => typeof condition === 'string' && condition.length > 0);
}

function eventQueueKey(sourceQueue: string, eventType: PipelineEventType): string {
  return `${sourceQueue}|${eventType}`;
}

function ruleEventQueueKey(rule: PipelineActivationRule): string {
  return eventQueueKey(rule.sourceQueue, rule.eventType);
}

function formEventQueueKey(form: RuleFormState): string {
  return eventQueueKey(form.sourceQueue, form.eventType);
}

function toPreviewSteps(pipeline: PipelineDefinition): PipelineStep[] {
  return pipeline.steps.map((step) => ({
    order: step.order,
    kind: step.kind,
    sarStage: step.sarStage,
    inputLevel: step.inputLevel,
    targetCsc: step.kind === 'SAR' && step.sarStage
      ? SAR_STAGE_TO_CSC[step.sarStage]
      : step.kind === 'JOB_INIT'
        ? 'CSC-08'
        : step.kind === 'CATALOG' || step.kind === 'THUMBNAIL'
          ? 'CSC-07'
          : 'CSC-02',
    productLevel: step.kind === 'SAR' && step.sarStage
      ? SAR_STAGE_TO_LEVEL[step.sarStage]
      : step.inputLevel ?? 'LEVEL_0',
    status: 'PENDING',
    enabledTasks: step.enabledTasks,
  }));
}

function BadgeButton({
  active,
  children,
  disabled,
  onClick,
  title,
}: {
  active: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? 'border-accent/40 bg-accent/15 text-accent'
          : 'border-border bg-background text-muted-foreground hover:bg-muted/45 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

export default function DeployedPipelinesPage() {
  const service = usePipelineService();
  const router = useRouter();
  const pathname = usePathname();
  const base = pathname.startsWith('/current') ? '/current' : '/plan';
  const [previewRole] = useMockRole();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [rules, setRules] = useState<PipelineActivationRule[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(() => makeEmptyRuleForm());
  const [savingPipelineId, setSavingPipelineId] = useState<string | null>(null);
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [toggleConfirmRule, setToggleConfirmRule] = useState<PipelineActivationRule | null>(null);
  const [automating, setAutomating] = useState(false);
  const [logPanelOpen, setLogPanelOpen] = useState(false);

  const canManage = previewRole === 'Administrator';

  const refresh = useCallback(async () => {
    const [pipelineRes, ruleRes] = await Promise.all([
      service.파이프라인_목록을_조회한다(),
      service.파이프라인_자동실행규칙을_조회한다(),
    ]);
    if (pipelineRes.data) setPipelines(pipelineRes.data);
    if (ruleRes.data) setRules(ruleRes.data);
  }, [service]);

  useEffect(() => {
    (async () => {
      const [pipelineRes, ruleRes, jobsRes, logsRes] = await Promise.all([
        service.파이프라인_목록을_조회한다(),
        service.파이프라인_자동실행규칙을_조회한다(),
        service.Job_목록을_조회한다({ limit: 100 }),
        service.실행_로그를_조회한다({ limit: 300 }),
      ]);
      if (pipelineRes.data) setPipelines(pipelineRes.data);
      if (ruleRes.data) setRules(ruleRes.data);
      if (jobsRes.data) setJobs(jobsRes.data.items);
      if (logsRes.data) setExecutionLogs(logsRes.data);
    })();
  }, [service]);

  const deployedRules = useMemo(() => rules.filter((rule) => rule.active), [rules]);
  const matchingRules = useMemo(
    () => [...rules].sort((a, b) => Number(b.active) - Number(a.active) || a.sourceQueue.localeCompare(b.sourceQueue)),
    [rules],
  );
  const activePipelineIds = useMemo(
    () => new Set(deployedRules.map((rule) => rule.pipelineId)),
    [deployedRules],
  );
  const automationTargetPipelines = useMemo(
    () => pipelines.filter((pipeline) => activePipelineIds.has(pipeline.id)),
    [activePipelineIds, pipelines],
  );
  const pipelineById = useMemo(() => {
    const map = new Map<string, PipelineDefinition>();
    for (const pipeline of pipelines) map.set(pipeline.id, pipeline);
    return map;
  }, [pipelines]);
  const satelliteOptions = useMemo(
    () => [...SATELLITE_OPTIONS],
    [],
  );
  const modeOptions = useMemo(
    () => [...MODE_OPTIONS],
    [],
  );
  const selectedRule = selectedRuleId ? rules.find((rule) => rule.id === selectedRuleId) ?? null : null;
  const selectedFormPipeline = ruleForm.pipelineId ? pipelineById.get(ruleForm.pipelineId) ?? null : null;
  const selectedFormPreviewSteps = selectedFormPipeline ? toPreviewSteps(selectedFormPipeline) : [];
  const duplicateFormRule = useMemo(() => (
    rules.find((rule) => rule.active && rule.id !== ruleForm.id && ruleEventQueueKey(rule) === formEventQueueKey(ruleForm)) ?? null
  ), [ruleForm, rules]);
  const missingAutomationSelections = useMemo(() => [
    !ruleForm.inputLevel ? 'Input Level' : null,
    !ruleForm.pipelineId ? 'Active Pipeline' : null,
  ].filter((selection): selection is string => selection !== null), [ruleForm.inputLevel, ruleForm.pipelineId]);
  const selectedPipelineJobIds = useMemo(() => {
    if (!selectedRule) return new Set<string>();
    return new Set(jobs.filter((job) => job.pipelineId === selectedRule.pipelineId).map((job) => job.jobId));
  }, [jobs, selectedRule]);
  const automaticPipelineLogs = useMemo(() => {
    if (!selectedRule) return executionLogs;
    const matched = executionLogs.filter((log) => log.jobId && selectedPipelineJobIds.has(log.jobId));
    return matched.length > 0 ? matched : executionLogs.slice(0, 80);
  }, [executionLogs, selectedPipelineJobIds, selectedRule]);

  const handleOpenPipeline = useCallback((pipelineId: string) => {
    router.push(`${base}/console?pipelineId=${encodeURIComponent(pipelineId)}`);
  }, [router, base]);

  const handleSaveRule = useCallback(async (form: RuleFormState, options?: { requireInputLevel?: boolean }) => {
    if (!form.pipelineId) {
      toast.error('Select a pipeline to automate');
      return null;
    }
    if (options?.requireInputLevel && !form.inputLevel) {
      toast.error('Select an input level condition');
      return null;
    }

    const payload: SavePipelineActivationRuleData = {
      id: form.id ?? undefined,
      pipelineId: form.pipelineId,
      active: form.active,
      eventType: form.eventType,
      sourceQueue: form.sourceQueue,
      match: {
        satelliteIds: form.satelliteId ? [form.satelliteId] : undefined,
        modes: form.mode ? [form.mode] : undefined,
        polarizations: form.polarization ? [form.polarization] : undefined,
        inputLevel: form.inputLevel || undefined,
      },
      triggerSource: form.triggerSource,
      description: form.description,
    };
    const payloadEventQueueKey = eventQueueKey(payload.sourceQueue, payload.eventType);
    const duplicateRule = payload.active
      ? rules.find((rule) => rule.active && rule.id !== payload.id && ruleEventQueueKey(rule) === payloadEventQueueKey)
      : undefined;
    if (duplicateRule) {
      toast.error('동일한 이벤트와 큐가 이미 활성화되어 있습니다.');
      return null;
    }

    setSavingPipelineId(form.pipelineId);
    const res = await service.파이프라인_자동실행규칙을_저장한다(payload);
    setSavingPipelineId(null);
    if (!res.success) {
      toast.error(res.message);
      return null;
    }
    await refresh();
    if (res.data) {
      setSelectedRuleId(res.data.id);
      setRuleForm(ruleToForm(res.data));
    }
    return res.data ?? null;
  }, [service, refresh, rules]);

  const handleAutomate = useCallback(async () => {
    setAutomating(true);
    await new Promise((resolve) => setTimeout(resolve, 720));
    const result = await handleSaveRule({ ...ruleForm, active: true }, { requireInputLevel: true });
    setAutomating(false);
    if (!result) return;
    setMappingModalOpen(false);
    toast.success('Automation pipeline added');
  }, [handleSaveRule, ruleForm]);

  const handleToggleRuleActive = useCallback((rule: PipelineActivationRule) => {
    setToggleConfirmRule(rule);
  }, []);

  const handleConfirmToggleRuleActive = useCallback(async () => {
    if (!toggleConfirmRule) return;
    const nextActive = !toggleConfirmRule.active;
    const result = await handleSaveRule({ ...ruleToForm(toggleConfirmRule), active: nextActive });
    if (!result) return;
    setToggleConfirmRule(null);
    toast.success(nextActive ? 'Automation rule activated.' : 'Automation rule deactivated.');
  }, [handleSaveRule, toggleConfirmRule]);

  const handleOpenNewRuleModal = useCallback(() => {
    setRuleForm(makeEmptyRuleForm());
    setMappingModalOpen(true);
  }, []);

  const handleRowClick = useCallback((rule: PipelineActivationRule) => {
    setRuleForm(ruleToForm(rule));
    setSelectedRuleId(rule.id);
    setExpandedRuleId((prev) => (prev === rule.id ? null : rule.id));
  }, []);

  return (
    <div className="h-full flex overflow-hidden bg-background">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        activePage="deployed"
      />

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background px-5 py-2.5">
          <PipelineExecutionTabs active="auto" counts={{ auto: matchingRules.length, manual: jobs.length }} />
          {canManage && (
            <button
              type="button"
              onClick={handleOpenNewRuleModal}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[11px] font-semibold text-accent-foreground transition-colors hover:brightness-110"
            >
              <Plus className="h-3.5 w-3.5" />
              Auto-Run Mapping Rule
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          <section className="min-h-[calc(100vh-128px)] rounded-lg border border-border bg-card overflow-x-auto overflow-y-hidden">
            {matchingRules.length === 0 ? (
              <div className="px-4 py-24 text-center">
                <Activity className="w-10 h-10 mx-auto text-muted-foreground/30" />
                <p className="mt-3 text-sm font-medium text-foreground">No automation matching rules</p>
                <p className="mt-1 text-xs text-muted-foreground">Use the button at the top right to link a pgmq event condition to an execution pipeline.</p>
              </div>
            ) : (
              <div className="max-w-none" style={{ width: `max(100%, ${DEPLOYMENT_TABLE_WIDTH}px)` }}>
                <div
                  className="grid gap-3 px-4 py-2.5 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                  style={{ gridTemplateColumns: DEPLOYMENT_TABLE_GRID }}
                >
                  <span>Status</span>
                  <span>pgmq Incoming Event</span>
                  <span>Source Queue</span>
                  <span>Match Conditions</span>
                  <span>Processing Flow</span>
                  <span>Execution Pipeline</span>
                  <span className="text-right">Actions</span>
                </div>
                <div className="divide-y divide-border/70">
                  {matchingRules.map((rule) => {
                    const pipeline = pipelineById.get(rule.pipelineId);
                    const conditions = ruleConditions(rule);
                    const hasActiveEventQueueDuplicate = !rule.active && rules.some((item) => (
                      item.active
                        && item.id !== rule.id
                        && ruleEventQueueKey(item) === ruleEventQueueKey(rule)
                    ));
                    const previewSteps = pipeline ? toPreviewSteps(pipeline) : [];
                    const expanded = expandedRuleId === rule.id;
                    return (
                      <div key={rule.id}>
                        <div
                          onClick={() => handleRowClick(rule)}
                          className="relative grid gap-3 px-4 py-3 items-center cursor-pointer whitespace-nowrap group"
                          style={{ gridTemplateColumns: DEPLOYMENT_TABLE_GRID }}
                        >
                          <div className={`absolute inset-0 transition-colors pointer-events-none ${
                            selectedRule?.id === rule.id ? 'bg-accent/10' : 'group-hover:bg-muted/20'
                          }`} />
                          <div className="relative min-w-0">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold ${
                              rule.active ? 'bg-success/10 text-success' : 'bg-muted/60 text-muted-foreground'
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${rule.active ? 'bg-success' : 'bg-muted-foreground/50'}`} />
                              {rule.active ? 'Active' : 'Inactive'}
                            </span>
                          </div>

                          <div className="relative min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{PIPELINE_EVENT_TYPE_LABELS[rule.eventType]}</p>
                          </div>

                          <div className="relative min-w-0">
                            <p className="font-mono text-[10px] text-muted-foreground truncate">{rule.sourceQueue}</p>
                          </div>

                          <div className="relative flex gap-1.5 overflow-hidden">
                            {conditions.length === 0 ? (
                              <span className="rounded bg-muted/55 px-1.5 py-0.5 text-[10px] text-muted-foreground">All conditions</span>
                            ) : conditions.map((condition) => (
                              <span key={condition} className="rounded bg-muted/55 px-1.5 py-0.5 text-[10px] text-foreground truncate shrink-0 max-w-[88px]">
                                {condition}
                              </span>
                            ))}
                          </div>

                          <span className="relative px-1.5 py-0.5 text-[10px] text-accent truncate max-w-[140px]">
                            {TRIGGER_SOURCE_LABELS[rule.triggerSource]}
                          </span>

                          <div className="relative min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium text-foreground truncate">{pipeline?.name ?? rule.pipelineId}</p>
                              {expanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                            </div>
                          </div>

                          <div className="relative flex justify-end gap-1.5">
                            {canManage && (
                              <button
                                type="button"
                                disabled={savingPipelineId === rule.pipelineId || hasActiveEventQueueDuplicate}
                                title={hasActiveEventQueueDuplicate ? 'An active rule already uses this event and source queue.' : undefined}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleToggleRuleActive(rule);
                                }}
                                className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed ${
                                  rule.active
                                    ? 'border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                                    : 'border-accent/25 bg-accent/10 text-accent hover:bg-accent/15'
                                }`}
                              >
                                {rule.active ? 'Deactivate' : 'Activate'}
                              </button>
                            )}
                          </div>
                        </div>
                        {expanded && pipeline && (
                          <div className="border-t border-border bg-muted/15 px-4 py-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-foreground">Linked Pipeline UI</div>
                                <div className="mt-1 text-[11px] text-muted-foreground">{pipeline.name}</div>
                              </div>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleOpenPipeline(pipeline.id);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/40"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Open pipeline
                              </button>
                            </div>
                            <div className="deployed-preview-flow h-64 overflow-hidden rounded-lg border border-border bg-card">
                              <CanvasGraph
                                pipelineId={`deployed-preview-${pipeline.id}`}
                                steps={previewSteps}
                                pipelineEdges={pipeline.edges}
                                editable={false}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>

        <ExecutionLogPanel
          logs={automaticPipelineLogs}
          selectedJobId={null}
          open={logPanelOpen}
          onToggle={() => setLogPanelOpen((value) => !value)}
        />
      </main>

      {mappingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5 py-3" onClick={() => !automating && setMappingModalOpen(false)}>
          <div
            className={`flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl transition-[max-width] duration-200 ${
              selectedFormPipeline ? 'h-[calc(100vh-24px)] max-w-7xl' : 'max-h-[calc(100vh-24px)] max-w-5xl'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <ServerCog className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-semibold text-foreground">Auto-Run Mapping Rule</h2>
              </div>
              <button
                type="button"
                disabled={automating}
                onClick={() => setMappingModalOpen(false)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="grid h-72 min-h-0 shrink-0 grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)] overflow-hidden border-b border-border">
                <div className="min-h-0 overflow-y-auto border-r border-border px-5 py-4">
                  <div className="space-y-5">
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">pgmq Event</p>
                      <div className="flex flex-wrap gap-2">
                        {EVENT_TYPE_OPTIONS.map((eventType) => (
                          <BadgeButton
                            key={eventType}
                            active={ruleForm.eventType === eventType}
                            disabled={automating}
                            onClick={() => setRuleForm((prev) => ({
                              ...prev,
                              eventType,
                              sourceQueue: PIPELINE_EVENT_SOURCE_QUEUE[eventType],
                            }))}
                          >
                            {PIPELINE_EVENT_TYPE_LABELS[eventType]}
                          </BadgeButton>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-semibold uppercase">Source Queue</span>
                        <span className={`rounded-full border px-2 py-0.5 font-mono ${
                          ruleForm.sourceQueue === PGMQ_EVENT_TBD_QUEUE
                            ? 'border-dashed border-muted-foreground/40 text-muted-foreground'
                            : 'border-border bg-muted/40 text-foreground'
                        }`}>
                          {ruleForm.sourceQueue}
                        </span>
                        {ruleForm.sourceQueue === PGMQ_EVENT_TBD_QUEUE && (
                          <span className="text-[10px] text-muted-foreground/80">SI-07 transport TBC</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Input Level</p>
                      <div className="flex flex-wrap gap-2">
                        {PRODUCT_LEVEL_OPTIONS.map((inputLevel) => (
                          <BadgeButton
                            key={inputLevel}
                            active={ruleForm.inputLevel === inputLevel}
                            disabled={automating}
                            onClick={() => setRuleForm((prev) => ({ ...prev, inputLevel }))}
                          >
                            {PRODUCT_LEVEL_LABELS[inputLevel]}
                          </BadgeButton>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Satellite</p>
                      <div className="flex flex-wrap gap-2">
                        {satelliteOptions.map((satelliteId) => (
                          <BadgeButton
                            key={satelliteId}
                            active={ruleForm.satelliteId === satelliteId}
                            disabled={automating}
                            onClick={() => setRuleForm((prev) => ({
                              ...prev,
                              satelliteId: prev.satelliteId === satelliteId ? '' : satelliteId,
                            }))}
                          >
                            {satelliteId}
                          </BadgeButton>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Mode</p>
                      <div className="flex flex-wrap gap-2">
                        {modeOptions.map((mode) => (
                          <BadgeButton
                          key={mode}
                          active={ruleForm.mode === mode}
                          disabled={automating}
                          onClick={() => setRuleForm((prev) => ({
                            ...prev,
                            mode: prev.mode === mode ? '' : mode,
                          }))}
                        >
                          {mode}
                        </BadgeButton>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Polarization</p>
                      <div className="flex flex-wrap gap-2">
                        {POLARIZATION_OPTIONS.map((polarization) => (
                          <BadgeButton
                          key={polarization}
                          active={ruleForm.polarization === polarization}
                          disabled={automating}
                          onClick={() => setRuleForm((prev) => ({
                            ...prev,
                            polarization: prev.polarization === polarization ? '' : polarization,
                          }))}
                        >
                          {polarization}
                        </BadgeButton>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>

                <div className="min-h-0 overflow-y-auto px-5 py-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">Active Pipelines</p>
                    <span className="rounded-full bg-muted/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{automationTargetPipelines.length}</span>
                  </div>
                  {automationTargetPipelines.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center">
                      <GitBranch className="mx-auto h-8 w-8 text-muted-foreground/35" />
                      <p className="mt-3 text-xs text-muted-foreground">No pipelines have been activated in pipeline management</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {automationTargetPipelines.map((pipeline) => {
                        const selected = ruleForm.pipelineId === pipeline.id;
                        return (
                          <button
                            key={pipeline.id}
                            type="button"
                            disabled={automating}
                            onClick={() => setRuleForm((prev) => ({
                              ...prev,
                              pipelineId: pipeline.id,
                            }))}
                            className={`w-full rounded-lg border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                              selected
                                ? 'border-accent/45 bg-accent/10'
                                : 'border-border bg-background hover:bg-muted/35'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">{pipeline.name}</p>
                              </div>
                              {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {selectedFormPipeline && (
                <div className="flex min-h-0 flex-1 flex-col bg-muted/10 px-5 py-4">
                  <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Pipeline Preview</p>
                      <p className="mt-1 truncate text-xs font-semibold text-foreground">{selectedFormPipeline.name}</p>
                    </div>
                    <span className="rounded-full bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      {selectedFormPipeline.steps.length} steps
                    </span>
                  </div>
                  <div className="deployed-preview-flow min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-background">
                    <CanvasGraph
                      key={`automation-modal-graph-${selectedFormPipeline.id}`}
                      pipelineId={`automation-modal-${selectedFormPipeline.id}`}
                      steps={selectedFormPreviewSteps}
                      pipelineEdges={selectedFormPipeline.edges}
                      editable={false}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border bg-muted/10 px-5 py-4">
              <div className="mb-3 rounded-lg border border-border bg-background px-3 py-3">
                <p className="mb-2 text-[10px] font-semibold text-muted-foreground">Selected Final Auto Pipeline</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border bg-muted/45 px-2.5 py-1 font-mono text-[10px] text-foreground">
                    {ruleForm.sourceQueue}
                  </span>
                  <span className="rounded-full border border-border bg-muted/45 px-2.5 py-1 text-[10px] text-foreground">
                    {PIPELINE_EVENT_TYPE_LABELS[ruleForm.eventType]}
                  </span>
                  {[
                    ruleForm.satelliteId,
                    ruleForm.mode,
                    ruleForm.polarization,
                    ruleForm.inputLevel ? PRODUCT_LEVEL_LABELS[ruleForm.inputLevel] : '',
                  ].filter(Boolean).map((label) => (
                    <span key={label} className="rounded-full border border-border bg-muted/45 px-2.5 py-1 text-[10px] text-foreground">
                      {label}
                    </span>
                  ))}
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                  <span className="rounded-full border border-accent/35 bg-accent/10 px-3 py-1 text-[10px] font-semibold text-accent">
                    {selectedFormPipeline?.name ?? 'No pipeline selected'}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {missingAutomationSelections.length > 0
                      ? `Additional selections required: ${missingAutomationSelections.join(', ')}`
                      : 'Ready to automate'}
                  </p>
                  {duplicateFormRule && (
                    <p className="mt-1 text-xs font-medium text-destructive">The selected event and source queue are already active.</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={automating}
                    onClick={() => setMappingModalOpen(false)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/45 hover:text-foreground disabled:opacity-45"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={automating || missingAutomationSelections.length > 0 || Boolean(duplicateFormRule)}
                    onClick={handleAutomate}
                    className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {automating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                    {automating ? 'Adding automation' : 'Automate'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {toggleConfirmRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5 py-4" onClick={() => setToggleConfirmRule(null)}>
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">
                {toggleConfirmRule.active ? '비활성화 하시겠습니까?' : '활성화 하시겠습니까?'}
              </h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {pipelineById.get(toggleConfirmRule.pipelineId)?.name ?? toggleConfirmRule.pipelineId}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <button
                type="button"
                disabled={savingPipelineId === toggleConfirmRule.pipelineId}
                onClick={() => setToggleConfirmRule(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/45 hover:text-foreground disabled:opacity-45"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingPipelineId === toggleConfirmRule.pipelineId}
                onClick={handleConfirmToggleRuleActive}
                className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  toggleConfirmRule.active
                    ? 'bg-destructive text-white hover:brightness-110'
                    : 'bg-accent text-accent-foreground hover:brightness-110'
                }`}
              >
                {toggleConfirmRule.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .deployed-preview-flow .react-flow__controls,
        .deployed-preview-flow .react-flow__minimap {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
