'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ExternalLink, FolderOpen, History, Image as ImageIcon, Radio, Sparkles } from 'lucide-react';
import type { ExecutionLog, JobSummary, PipelineActivationRule, PipelineDefinition, PipelineStep, Product } from '@/types/pipeline';
import {
  CSC_VT_SECONDS,
  PRODUCT_LEVEL_LABELS,
  SAR_STAGE_LABELS,
  SAR_STAGE_TO_LEVEL,
} from '@/types/pipeline';
import { JobStatusBadge, StepStatusBadge } from '@/components/ui/StatusBadge';
import { formatDuration, formatKST } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface AutomaticPipelineDetailPanelProps {
  rule: PipelineActivationRule | null;
  pipeline: PipelineDefinition | null;
  detailJob: { summary: JobSummary; steps: PipelineStep[] } | null;
  pipelineJobs: JobSummary[];
  selectedJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
  products: Product[];
  productsLoading: boolean;
  errorLogs: ExecutionLog[];
  dataCatalogBasePath: string;
}

type DetailTabId = 'history' | 'execution' | 'outputs';

interface DetailTab {
  id: DetailTabId;
  label: string;
  icon: React.ElementType;
}

const DETAIL_TABS = [
  { id: 'history',   label: 'History',   icon: History },
  { id: 'execution', label: 'Execution', icon: Sparkles },
  { id: 'outputs',   label: 'Outputs',   icon: FolderOpen },
] as const satisfies readonly DetailTab[];

export default function AutomaticPipelineDetailPanel({
  rule,
  pipeline,
  detailJob,
  pipelineJobs,
  selectedJobId,
  onSelectJob,
  products,
  productsLoading,
  errorLogs,
  dataCatalogBasePath,
}: AutomaticPipelineDetailPanelProps) {
  // 기본 탭은 Execution — 패널을 열자마자 "지금 어디 돌고 있나?" 가 자동 선택된 최신 잡 기준으로 즉시 보임.
  // 다른 잡으로 컨텍스트를 바꾸려면 History 탭으로 이동.
  const [activeTab, setActiveTab] = useState<DetailTabId>('execution');
  // History → Execution 자동 전환 직후 잠깐 Execution 탭 버튼을 강조해
  // "탭이 방금 바뀌었다" 를 사용자가 명확히 인지하도록 한다 (~900ms ring pulse).
  const [tabAutoSwitchPulse, setTabAutoSwitchPulse] = useState(false);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
  }, []);

  if (!rule || !pipeline) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <Radio className="h-8 w-8 text-muted-foreground/40" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Select a rule to inspect</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Pick an automation rule on the left to see its current step, NAS output paths,
            output products, and recent error logs in one place.
          </p>
        </div>
      </div>
    );
  }

  const summary = detailJob?.summary;
  const steps = detailJob?.steps ?? [];
  const runningStep = steps.find((step) => step.status === 'RUNNING') ?? null;
  const lastFailedStep = [...steps].reverse().find((step) => step.status === 'FAILED') ?? null;
  const productsByLevel = ['LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'] as const;

  // 탭별 카운트 배지 — 운영자가 탭을 열기 전에 "여기 볼 게 있는가" 를 알 수 있게 한다.
  // outputs 탭은 ERROR 가 있을 때 그 카운트를 destructive 로 표시 (산출물 카운트는 안에서 chip 으로 노출되므로 중복 회피).
  const tabBadgeCounts: Partial<Record<DetailTabId, number>> = {
    history: pipelineJobs.length,
    outputs: errorLogs.length,
  };
  const tabBadgeIsDestructive: Partial<Record<DetailTabId, boolean>> = {
    outputs: errorLogs.length > 0,
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 파이프라인 컨텍스트 헤더(이름/Active 배지/sourceQueue) 는 RightTabbedPanel 의 title 슬롯이
          담당한다 — 패널 자체 헤더가 두 번 나오는 시각 노이즈를 피하기 위함. */}

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Pipeline detail sections"
        className="flex flex-shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-border bg-background/60 px-2 py-1.5"
      >
        {DETAIL_TABS.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          const count = tabBadgeCounts[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`detail-tabpanel-${tab.id}`}
              id={`detail-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`detail-tab-${tab.id}`}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium transition-colors',
                isActive
                  ? 'bg-accent/12 text-accent'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                // History → Execution 자동 전환 시 Execution 탭만 잠깐 ring 강조 (사용자가 탭 전환을 인지하도록)
                tabAutoSwitchPulse && tab.id === 'execution' && 'ring-2 ring-accent/55 animate-pulse',
              )}
            >
              <TabIcon className="h-3 w-3" />
              <span>{tab.label}</span>
              {count !== undefined && count > 0 && (
                <span
                  className={cn(
                    'ml-0.5 inline-flex min-w-[1.25rem] justify-center rounded-full px-1 py-px font-mono text-[9px] leading-none',
                    tabBadgeIsDestructive[tab.id]
                      ? 'bg-destructive/15 text-destructive'
                      : isActive
                        ? 'bg-accent/15 text-accent'
                        : 'bg-muted/60 text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      <div
        role="tabpanel"
        id={`detail-tabpanel-${activeTab}`}
        aria-labelledby={`detail-tab-${activeTab}`}
        className="flex-1 min-h-0 overflow-y-auto"
      >
        {activeTab === 'history' && (
          <Section title="Job history" icon={History}>
            {pipelineJobs.length === 0 ? (
              <EmptyState>No jobs have been triggered for this pipeline yet.</EmptyState>
            ) : (
              <>
                <ul className="space-y-1">
                  {pipelineJobs.slice(0, 10).map((job) => {
                    const isSelected = (selectedJobId ?? pipelineJobs[0]?.jobId) === job.jobId;
                    return (
                      <li key={job.jobId}>
                        <button
                          type="button"
                          onClick={() => {
                            // 잡 클릭 → 디테일을 즉시 보여주기 위해 Execution 탭으로 자동 전환.
                            // 같은 잡 재클릭 시 (다른 잡이 여러 개 있을 때) 선택 해제 — latest 로 fallback.
                            onSelectJob(isSelected && pipelineJobs.length > 1 ? null : job.jobId);
                            setActiveTab('execution');
                            // 탭 전환을 사용자가 인지하도록 Execution 탭에 잠깐 ring pulse.
                            setTabAutoSwitchPulse(true);
                            if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
                            pulseTimerRef.current = setTimeout(() => setTabAutoSwitchPulse(false), 900);
                          }}
                          className={cn(
                            'group relative flex w-full items-center gap-2 overflow-hidden rounded-md border px-2.5 py-1.5 pl-3 text-left transition-colors',
                            isSelected
                              ? 'border-accent/55 bg-accent/[0.08] before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-accent'
                              : 'border-border bg-background hover:border-accent/30 hover:bg-muted/30',
                          )}
                          title={`Show details for ${job.jobId} in Execution tab`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[11px] font-semibold text-foreground">{job.jobId}</span>
                              {isSelected && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-accent/15 px-1 py-px text-[8.5px] font-semibold uppercase tracking-wider text-accent">
                                  Viewing
                                  <ArrowRight className="h-2.5 w-2.5" />
                                </span>
                              )}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {job.sceneId} · {formatKST(job.updatedAt)}
                            </div>
                          </div>
                          <JobStatusBadge status={job.status} retryCount={job.retryCount} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {pipelineJobs.length > 10 && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground/80">Showing 10 of {pipelineJobs.length} jobs.</p>
                )}
              </>
            )}
          </Section>
        )}

        {activeTab === 'execution' && (
          <>
            <Section title="Latest execution" icon={Sparkles}>
              {summary ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-semibold text-foreground">{summary.jobId}</span>
                    <JobStatusBadge status={summary.status} retryCount={summary.retryCount} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px]">
                    <InfoCell label="Scene">{summary.sceneId}</InfoCell>
                    <InfoCell label="Started">{formatKST(summary.startedAt)}</InfoCell>
                    <InfoCell label="Updated">{formatKST(summary.updatedAt)}</InfoCell>
                    <InfoCell label="Total jobs">{pipelineJobs.length}</InfoCell>
                  </div>
                  {runningStep && (
                    <div className="rounded-md border border-accent/35 bg-accent/8 px-2.5 py-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
                          <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                        </span>
                        Currently running
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-foreground">{stepLabel(runningStep)}</div>
                      {runningStep.startedAt && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          started {formatKST(runningStep.startedAt)}
                        </div>
                      )}
                    </div>
                  )}
                  {!runningStep && lastFailedStep && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/8 px-2.5 py-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        Last failure
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-foreground">{stepLabel(lastFailedStep)}</div>
                      {lastFailedStep.errorMessage && (
                        <div className="mt-1 text-[10px] leading-snug text-destructive/90">
                          {lastFailedStep.errorMessage}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState>No job has been executed for this pipeline yet.</EmptyState>
              )}
            </Section>

            <Section title="Step progress · NAS outputs" icon={FolderOpen}>
              {steps.length === 0 ? (
                <EmptyState>No step information available yet.</EmptyState>
              ) : (
                <ol className="space-y-2">
                  {steps.map((step, idx) => {
                    const vtBudget = step.targetCsc ? CSC_VT_SECONDS[step.targetCsc] : undefined;
                    const vtExceeded =
                      vtBudget !== undefined && step.durationMs !== undefined && step.durationMs > vtBudget * 1000;
                    return (
                      <li
                        key={step.order}
                        className={cn(
                          'overflow-hidden rounded-lg border bg-card',
                          step.status === 'RUNNING'
                            ? 'border-accent/40 shadow-[0_0_0_1px_rgba(2,159,231,0.15)]'
                            : step.status === 'FAILED'
                              ? 'border-destructive/40'
                              : step.status === 'COMPLETED'
                                ? 'border-success/30'
                                : 'border-border',
                        )}
                      >
                        {/* Header row: step number + label + duration + status */}
                        <div className="flex items-center gap-2 px-3 py-2">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted/60 font-mono text-[9.5px] tabular-nums text-muted-foreground">
                            {idx + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-foreground" title={stepLabel(step)}>
                            {stepLabel(step)}
                          </span>
                          {step.durationMs !== undefined && (
                            <span className="shrink-0 font-mono text-[9.5px] tabular-nums text-muted-foreground">
                              {formatDuration(step.durationMs)}
                            </span>
                          )}
                          <StepStatusBadge status={step.status} />
                        </div>

                        {/* VT-exceeded callout (rare) */}
                        {vtExceeded && (
                          <div className="flex items-center gap-1 border-t border-border/40 bg-background/40 px-3 py-1.5">
                            <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-destructive">
                              VT exceeded
                            </span>
                          </div>
                        )}

                        {/* NAS output section */}
                        {step.outputPath && (
                          <div className="border-t border-border/40 bg-muted/15 px-3 py-2">
                            <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                              <FolderOpen className="h-2.5 w-2.5" />
                              NAS output
                            </div>
                            <div
                              className="break-all font-mono text-[10.5px] leading-relaxed text-foreground"
                              title={step.outputPath}
                            >
                              {step.outputPath}
                            </div>
                          </div>
                        )}

                        {/* Error section */}
                        {step.errorMessage && (
                          <div className="border-t border-destructive/30 bg-destructive/[0.06] px-3 py-2">
                            <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-destructive">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Error
                            </div>
                            <div className="text-[10.5px] leading-snug text-destructive/90">{step.errorMessage}</div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </Section>
          </>
        )}

        {activeTab === 'outputs' && (
          <>
            <Section title="Output products" icon={ImageIcon}>
              {productsLoading ? (
                <EmptyState>Loading products…</EmptyState>
              ) : products.length === 0 ? (
                <EmptyState>No products have been generated for this pipeline yet.</EmptyState>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {products.slice(0, 6).map((product) => (
                      <Link
                        key={product.id}
                        href={`${dataCatalogBasePath}?productId=${encodeURIComponent(product.id)}`}
                        className="group flex flex-col gap-1 rounded-md border border-border bg-background p-1.5 transition-colors hover:border-accent/50 hover:bg-accent/5"
                        title={`Click to open ${product.id} on the Data Catalog page`}
                      >
                        <div className="flex aspect-square items-center justify-center rounded bg-muted/40 text-muted-foreground/60 transition-colors group-hover:text-accent">
                          <ImageIcon className="h-6 w-6" />
                        </div>
                        <div className="flex items-center justify-between gap-1 text-[9.5px]">
                          <span className="font-mono font-semibold text-foreground">{PRODUCT_LEVEL_LABELS[product.level]}</span>
                          <span className="truncate text-muted-foreground">{product.polarization}</span>
                        </div>
                        <div className="truncate font-mono text-[8.5px] text-muted-foreground/80" title={product.id}>
                          {product.id}
                        </div>
                        <div className="flex items-center justify-end gap-0.5 text-[9px] text-accent opacity-0 transition-opacity group-hover:opacity-100">
                          Open in Data Catalog
                          <ExternalLink className="h-2.5 w-2.5" />
                        </div>
                      </Link>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1 text-[10px]">
                    <div className="flex flex-wrap items-center gap-1">
                      {productsByLevel.map((level) => {
                        const count = products.filter((p) => p.level === level).length;
                        if (count === 0) return null;
                        return (
                          <span key={level} className="rounded-full bg-muted/60 px-1.5 py-0.5 font-mono text-muted-foreground">
                            {PRODUCT_LEVEL_LABELS[level]} · {count}
                          </span>
                        );
                      })}
                    </div>
                    <Link
                      href={`${dataCatalogBasePath}?pipelineId=${encodeURIComponent(pipeline.id)}`}
                      className="inline-flex items-center gap-1 text-accent hover:underline"
                    >
                      Open Data Catalog
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              )}
            </Section>

            <Section title="Recent error logs" icon={AlertTriangle}>
              {errorLogs.length === 0 ? (
                <EmptyState>No recent error logs for this pipeline.</EmptyState>
              ) : (
                <ul className="space-y-1">
                  {errorLogs.slice(0, 8).map((log) => (
                    <li key={log.id} className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5">
                      <div className="flex items-center justify-between gap-2 text-[10px] text-destructive/90">
                        <span className="font-mono">{log.jobId ?? '—'}</span>
                        <span>{formatKST(log.timestamp)}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-foreground">{log.message}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border/60 px-4 py-3 last:border-b-0">
      <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function InfoCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 truncate">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right text-foreground">{children}</span>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/15 px-3 py-3 text-center text-[10.5px] text-muted-foreground">
      {children}
    </div>
  );
}

function stepLabel(step: PipelineStep): string {
  if (step.kind === 'SAR' && step.sarStage) {
    return `${step.sarStage} · ${SAR_STAGE_LABELS[step.sarStage]}`;
  }
  if (step.kind === 'TRIGGER') return 'Raw Data Reception Trigger';
  if (step.kind === 'FILE_INPUT') {
    const lvl = step.inputLevel ?? step.productLevel;
    return `${PRODUCT_LEVEL_LABELS[lvl]} Result Input`;
  }
  if (step.kind === 'JOB_INIT') return 'Job Initialization';
  if (step.kind === 'CATALOG') return 'Catalog Registration';
  if (step.kind === 'THUMBNAIL') return 'Quick-look Generation';
  return step.targetCsc ?? `Step ${step.order}`;
}

