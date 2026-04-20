'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Activity, GitBranch, GripVertical, ServerCog, Unplug, ExternalLink, TerminalSquare, X } from 'lucide-react';
import LeftSidebar from '@/components/panels/LeftSidebar';
import { useMockRole } from '@/components/auth/RolePreviewSelect';
import PipelineUndeployConfirmDialog from '@/components/panels/PipelineUndeployConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import type { ExecutionLog, JobSummary, LogLevel, PipelineActivationRule, PipelineDefinition } from '@/types/pipeline';
import {
  PIPELINE_EVENT_TYPE_LABELS,
  PRODUCT_LEVEL_LABELS,
  TRIGGER_SOURCE_LABELS,
} from '@/types/pipeline';

function ruleConditions(rule: PipelineActivationRule): string[] {
  return [
    rule.match.satelliteId,
    rule.match.mode,
    rule.match.polarization,
    rule.match.inputLevel ? PRODUCT_LEVEL_LABELS[rule.match.inputLevel] : undefined,
  ].filter((condition): condition is string => typeof condition === 'string' && condition.length > 0);
}

function routeKey(rule: PipelineActivationRule): string {
  return [
    rule.sourceQueue,
    rule.eventType,
    rule.match.satelliteId ?? '*',
    rule.match.mode ?? '*',
    rule.match.polarization ?? '*',
    rule.match.inputLevel ?? '*',
  ].join('|');
}

function formatDate(value?: string): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

const LOG_LEVEL_CLASS: Record<LogLevel, string> = {
  ERROR: 'text-red-300',
  WARN: 'text-yellow-300',
  INFO: 'text-emerald-300',
};

const MIN_LOG_PANEL_WIDTH = 320;
const DEFAULT_LOG_PANEL_WIDTH = 420;
const MIN_CONTENT_WIDTH = 940;
const DEPLOYMENT_TABLE_WIDTH = 1302;

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
  const [undeployTarget, setUndeployTarget] = useState<PipelineDefinition | null>(null);
  const [savingPipelineId, setSavingPipelineId] = useState<string | null>(null);
  const [logPanelWidth, setLogPanelWidth] = useState(DEFAULT_LOG_PANEL_WIDTH);

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

  const deployedRules = useMemo(
    () => rules.filter((rule) => rule.active),
    [rules],
  );
  const deployedPipelineIds = new Set(deployedRules.map((rule) => rule.pipelineId));
  const deployableDrafts = pipelines.filter((pipeline) => !deployedPipelineIds.has(pipeline.id));
  const sourceQueueGroups = Array.from(
    deployedRules.reduce((map, rule) => {
      const current = map.get(rule.sourceQueue) ?? [];
      current.push(rule);
      map.set(rule.sourceQueue, current);
      return map;
    }, new Map<string, PipelineActivationRule[]>()).entries(),
  );
  const duplicateRouteKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rule of deployedRules) {
      const key = routeKey(rule);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
  }, [deployedRules]);

  const pipelineById = useMemo(() => {
    const map = new Map<string, PipelineDefinition>();
    for (const pipeline of pipelines) map.set(pipeline.id, pipeline);
    return map;
  }, [pipelines]);

  const selectedRule = selectedRuleId
    ? deployedRules.find((rule) => rule.id === selectedRuleId) ?? null
    : null;
  const selectedPipeline = selectedRule ? pipelineById.get(selectedRule.pipelineId) ?? null : null;
  const selectedPipelineJobIds = useMemo(() => {
    if (!selectedRule) return new Set<string>();
    return new Set(jobs.filter((job) => job.pipelineId === selectedRule.pipelineId).map((job) => job.jobId));
  }, [jobs, selectedRule]);
  const selectedServerLogs = useMemo(() => {
    if (!selectedRule) return [];
    const matched = executionLogs.filter((log) => log.jobId && selectedPipelineJobIds.has(log.jobId));
    return matched.length > 0 ? matched : executionLogs.slice(0, 80);
  }, [executionLogs, selectedPipelineJobIds, selectedRule]);

  const handleUndeployConfirm = useCallback(async () => {
    if (!undeployTarget) return;
    setSavingPipelineId(undeployTarget.id);
    const res = await service.파이프라인_배포상태를_변경한다(undeployTarget.id, false);
    setSavingPipelineId(null);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    setUndeployTarget(null);
    await refresh();
    toast.success('파이프라인 배포를 해제했습니다');
  }, [service, refresh, undeployTarget]);

  const handleOpenPipeline = useCallback((pipelineId: string) => {
    router.push(`${base}/console?pipelineId=${encodeURIComponent(pipelineId)}`);
  }, [router, base]);

  const handleResizePointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = logPanelWidth;
    const sidebarWidth = sidebarCollapsed ? 48 : 224;
    const maxWidth = Math.max(MIN_LOG_PANEL_WIDTH, window.innerWidth - sidebarWidth - MIN_CONTENT_WIDTH);

    const onMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      const next = Math.max(MIN_LOG_PANEL_WIDTH, Math.min(maxWidth, startWidth + delta));
      setLogPanelWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [logPanelWidth, sidebarCollapsed]);

  return (
    <div className="h-full flex overflow-hidden bg-background">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        activePage="deployed"
      />

      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="min-h-full px-8 py-7">
          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">미배포 파이프라인 정의</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">{deployableDrafts.length}</span>
              </div>
              <div className="max-h-40 overflow-y-auto divide-y divide-border/70">
                {deployableDrafts.length === 0 ? (
                  <div className="px-4 py-4 text-xs text-muted-foreground">대기 중인 파이프라인 정의가 없습니다</div>
                ) : deployableDrafts.map((pipeline) => (
                  <button
                    key={pipeline.id}
                    type="button"
                    onClick={() => handleOpenPipeline(pipeline.id)}
                    className="w-full grid grid-cols-[1fr_150px] gap-3 px-4 py-2.5 text-left hover:bg-muted/25 transition-colors cursor-pointer"
                  >
                    <span className="text-xs font-medium text-foreground truncate">{pipeline.name}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{pipeline.satelliteId} · {pipeline.mode}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <ServerCog className="w-4 h-4 text-accent" />
                  <span className="text-xs font-semibold text-foreground">이벤트 수신 소스</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">{sourceQueueGroups.length}</span>
              </div>
              <div className="max-h-40 overflow-y-auto divide-y divide-border/70">
                {sourceQueueGroups.length === 0 ? (
                  <div className="px-4 py-4 text-xs text-muted-foreground">연결된 pgmq 이벤트 소스가 없습니다</div>
                ) : sourceQueueGroups.map(([queue, queueRules]) => (
                  <button
                    key={queue}
                    type="button"
                    onClick={() => handleOpenPipeline(queueRules[0]!.pipelineId)}
                    className="w-full grid grid-cols-[1fr_120px] gap-3 px-4 py-2.5 text-left hover:bg-muted/25 transition-colors cursor-pointer"
                  >
                    <span className="text-[10px] font-mono text-foreground truncate">{queue}</span>
                    <span className="text-[10px] text-muted-foreground text-right">{queueRules.length} routes</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-lg border border-border bg-card overflow-x-auto overflow-y-hidden">
            {deployedRules.length === 0 ? (
              <div className="px-4 py-16 text-center">
                <Activity className="w-10 h-10 mx-auto text-muted-foreground/30" />
                <p className="mt-3 text-sm font-medium text-foreground">배포된 파이프라인이 없습니다</p>
                <p className="mt-1 text-xs text-muted-foreground">파이프라인 화면에서 배포하면 이 목록에 표시됩니다.</p>
              </div>
            ) : (
              <div className="max-w-none" style={{ width: DEPLOYMENT_TABLE_WIDTH }}>
                <div className="grid grid-cols-[230px_170px_250px_130px_270px_160px] gap-3 px-4 py-2.5 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  <span>수신 이벤트 소스</span>
                  <span>이벤트 유형</span>
                  <span>매칭 조건</span>
                  <span>실행 출처</span>
                  <span>실행 파이프라인</span>
                  <span className="text-right">작업</span>
                </div>
                <div className="divide-y divide-border/70">
                  {deployedRules.map((rule) => {
                    const pipeline = pipelineById.get(rule.pipelineId);
                    const conditions = ruleConditions(rule);
                    const hasDuplicateRoute = duplicateRouteKeys.has(routeKey(rule));
                    return (
                      <div
                        key={rule.id}
                        onClick={() => setSelectedRuleId(rule.id)}
                        className="relative grid grid-cols-[230px_170px_250px_130px_270px_160px] gap-3 px-4 py-3 items-center cursor-pointer whitespace-nowrap group"
                      >
                      <div className={`absolute inset-0 transition-colors pointer-events-none ${
                        selectedRule?.id === rule.id ? 'bg-accent/10' : 'group-hover:bg-muted/20'
                      }`} />
                      <div className="relative min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_12px_rgba(52,211,153,0.7)]" />
                          <span className="text-[10px] font-mono text-foreground truncate">{rule.sourceQueue}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground truncate">pgmq message source</p>
                      </div>

                      <div className="relative min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{PIPELINE_EVENT_TYPE_LABELS[rule.eventType]}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground truncate">{rule.eventType}</p>
                      </div>

                      <div className="relative flex gap-1.5 overflow-hidden">
                        {conditions.map((condition) => (
                          <span key={condition} className="rounded bg-muted/55 px-1.5 py-0.5 text-[10px] text-foreground truncate shrink-0 max-w-[92px]">
                            {condition}
                          </span>
                        ))}
                      </div>

                      <span className="relative rounded border border-border px-1.5 py-0.5 text-[10px] text-accent truncate max-w-[120px]">
                        {TRIGGER_SOURCE_LABELS[rule.triggerSource]}
                      </span>

                      <div className="relative min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {pipeline?.name ?? rule.pipelineId}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground truncate">
                          {hasDuplicateRoute
                            ? '중복 라우트 확인 필요'
                            : pipeline ? `${pipeline.satelliteId} · ${pipeline.mode}` : `deployed ${formatDate(rule.deployedAt)}`}
                        </p>
                      </div>

                      <div className="relative flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenPipeline(rule.pipelineId);
                          }}
                          className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          콘솔
                        </button>
                        {canManage && (
                          <button
                            type="button"
                            disabled={savingPipelineId === rule.pipelineId}
                            onClick={(event) => {
                              event.stopPropagation();
                              const pipeline = pipelineById.get(rule.pipelineId);
                              if (pipeline) setUndeployTarget(pipeline);
                            }}
                            className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                          >
                            <Unplug className="w-3 h-3" />
                            해제
                          </button>
                        )}
                      </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      <aside
        className="relative border-l border-black bg-[#050807] flex flex-col overflow-hidden shadow-[-18px_0_42px_rgba(0,0,0,0.35)] shrink-0"
        style={{ width: logPanelWidth }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={handleResizePointerDown}
          className="absolute left-0 top-0 bottom-0 z-20 w-2 -translate-x-1 cursor-ew-resize flex items-center justify-center hover:bg-emerald-500/10"
          title="서버 로그 패널 크기 조절"
        >
          <GripVertical className="w-3 h-5 text-emerald-100/30" />
        </div>
        <div className="h-10 px-3 border-b border-emerald-900/50 flex items-center justify-between bg-[#111611]">
          <div className="flex items-center gap-2 min-w-0">
            <TerminalSquare className="w-3.5 h-3.5 text-emerald-300 shrink-0 ml-1" />
            <span className="text-[11px] font-mono text-emerald-100/85 truncate">sdpe-prod-shell</span>
          </div>
          {selectedRule && (
            <button
              type="button"
              onClick={() => setSelectedRuleId(null)}
              className="p-1 rounded-md text-emerald-100/45 hover:bg-emerald-500/10 hover:text-emerald-100 transition-colors"
              title="선택 해제"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {selectedRule ? (
          <>
            <div className="px-4 py-3 border-b border-border bg-background/35">
              <div className="font-mono text-[11px] leading-5">
                <p className="text-emerald-300">
                  <span className="text-emerald-500">operator@sdpe-prod</span>
                  <span className="text-emerald-100/50">:</span>
                  <span className="text-sky-300">~</span>
                  <span className="text-emerald-100/50">$ </span>
                  aws logs tail /sdpe/pipeline-workflow --follow
                </p>
                <p className="text-emerald-100/55 truncate">
                  target={selectedPipeline?.name ?? selectedRule.pipelineId} jobs={selectedPipelineJobIds.size || 'sample'}
                </p>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto font-mono text-[11px] bg-[#050807] text-emerald-50/80">
              {selectedServerLogs.length === 0 ? (
                <div className="h-full min-h-[180px] flex items-center justify-center text-xs text-emerald-100/40">
                  no log events
                </div>
              ) : selectedServerLogs.map((log) => (
                <div key={log.id} className="px-3 py-1.5 border-b border-emerald-950/60 hover:bg-emerald-400/[0.04] transition-colors">
                  <p className="leading-5 break-words">
                    <span className="text-emerald-100/40">{new Date(log.timestamp).toISOString()}</span>
                    <span className={`ml-2 font-semibold ${LOG_LEVEL_CLASS[log.level]}`}>{log.level}</span>
                    <span className="ml-2 text-sky-300">[{log.source}]</span>
                    {log.jobId && <span className="ml-2 text-emerald-100/50">{log.jobId}</span>}
                    <span className="ml-2 text-emerald-50/85">{log.message}</span>
                  </p>
                  {log.detail && <p className="pl-4 text-emerald-100/42 break-words">`-- {log.detail}</p>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 min-h-0 flex items-center justify-center px-8 text-center font-mono text-xs text-emerald-100/45">
            select pipeline to tail logs
          </div>
        )}
      </aside>

      {undeployTarget && (
        <PipelineUndeployConfirmDialog
          pipelineName={undeployTarget.name}
          satelliteId={undeployTarget.satelliteId}
          mode={undeployTarget.mode}
          onConfirm={handleUndeployConfirm}
          onCancel={() => setUndeployTarget(null)}
        />
      )}
    </div>
  );
}
