'use client';

import { useMemo } from 'react';
import { formatDuration, formatKST } from '@/lib/utils';
import { StepStatusBadge } from '@/components/ui/StatusBadge';
import type { PipelineStep, JobDetail, ExecutionLog, LogLevel } from '@/types/pipeline';
import {
  SAR_STAGE_LABELS, SAR_STAGE_TASKS, SAR_STAGE_TO_LEVEL, SAR_STAGE_DESCRIPTIONS,
  PRODUCT_LEVEL_LABELS, NODE_KIND_INFO,
} from '@/types/pipeline';
import { X, AlertCircle, AlertTriangle, Info, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepDetailPopoverProps {
  step: PipelineStep;
  job: JobDetail;
  logs: ExecutionLog[];
  onClose: () => void;
  /** 클릭한 카드의 viewport top — 캔버스 기준 상대 위치 계산에 사용 */
  topOffset?: number;
  /** 캔버스 컨테이너 높이 — 하단 클램핑에 사용 */
  containerHeight?: number;
}

const LOG_LEVEL_STYLE: Record<LogLevel, { icon: React.ElementType; color: string }> = {
  ERROR: { icon: AlertCircle, color: 'text-destructive' },
  WARN: { icon: AlertTriangle, color: 'text-amber-500' },
  INFO: { icon: Info, color: 'text-muted-foreground' },
};

function formatLogTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function getStepLabel(step: PipelineStep): string {
  if (step.kind === 'SAR' && step.sarStage) return `${step.sarStage} · ${SAR_STAGE_LABELS[step.sarStage]}`;
  if (step.kind === 'TRIGGER') return 'Raw Data Reception Trigger';
  if (step.kind === 'FILE_INPUT') return `${PRODUCT_LEVEL_LABELS[step.productLevel] ?? 'L?'} Result Input`;
  if (step.kind === 'JOB_INIT') return 'Job Initialization';
  if (step.kind === 'CATALOG') return 'Catalog Registration';
  if (step.kind === 'THUMBNAIL') return 'Quick-look Generation';
  return step.targetCsc;
}

function getStepDescription(step: PipelineStep): string {
  if (step.kind === 'SAR' && step.sarStage) return SAR_STAGE_DESCRIPTIONS[step.sarStage];
  const info = NODE_KIND_INFO[step.kind!];
  return info?.description ?? '';
}

const POPOVER_HEIGHT = 520;
const BOTTOM_MARGIN = 12;
const TOP_MARGIN = 8;

export default function StepDetailPopover({ step, job, logs, onClose, topOffset = 0, containerHeight = 600 }: StepDetailPopoverProps) {
  const sourceKey = step.sarStage ?? step.kind ?? 'SYSTEM';

  const stepLogs = useMemo(
    () => logs.filter((l) => l.jobId === job.jobId && l.source === sourceKey),
    [logs, job.jobId, sourceKey],
  );

  const errorLogs = useMemo(() => stepLogs.filter((l) => l.level === 'ERROR'), [stepLogs]);
  const warnLogs = useMemo(() => stepLogs.filter((l) => l.level === 'WARN'), [stepLogs]);

  const isSAR = step.kind === 'SAR' && step.sarStage;
  const isSpecialNode = step.kind === 'TRIGGER' || step.kind === 'FILE_INPUT' || step.kind === 'JOB_INIT' || step.kind === 'CATALOG' || step.kind === 'THUMBNAIL';
  const kindInfo = isSpecialNode ? NODE_KIND_INFO[step.kind!] : undefined;

  // Input: previous step's output or rawDataPath for L0
  const stepIdx = job.steps.findIndex((s) => s.order === step.order);
  const prevStep = stepIdx > 0 ? job.steps[stepIdx - 1] : undefined;
  const inputPath =
    step.kind === 'TRIGGER' || step.kind === 'FILE_INPUT' || step.kind === 'JOB_INIT'
      ? undefined
      : prevStep?.outputPath ?? (isSAR && step.sarStage === 'L0' ? job.rawDataPath : undefined);

  const label = getStepLabel(step);
  const description = getStepDescription(step);
  const levelLabel = isSAR
    ? PRODUCT_LEVEL_LABELS[SAR_STAGE_TO_LEVEL[step.sarStage!]]
    : step.productLevel;

  return (
    <div
      className="absolute right-3 z-30 pointer-events-none"
      style={{
        top: Math.min(topOffset, Math.max(TOP_MARGIN, containerHeight - POPOVER_HEIGHT - BOTTOM_MARGIN)),
        height: POPOVER_HEIGHT,
      }}
    >
      <div
        className="pointer-events-auto w-[400px] h-full flex flex-col bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">{label}</span>
            <StepStatusBadge status={step.status} />
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted/50 transition-colors shrink-0 ml-2"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {/* Description */}
          {description && (
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <MetaRow label="Level" value={levelLabel} />
            <MetaRow label="CSC" value={step.targetCsc} />
            {step.durationMs !== undefined && (
              <MetaRow label="Duration" value={formatDuration(step.durationMs)} />
            )}
            {step.startedAt && <MetaRow label="Started" value={formatKST(step.startedAt)} />}
            {step.finishedAt && <MetaRow label="Finished" value={formatKST(step.finishedAt)} />}
          </div>

          {/* Tasks / Processes */}
          {kindInfo && step.status === 'COMPLETED' && (
            <Section title="Processes">
              <div className="flex flex-wrap gap-1.5">
                {kindInfo.processes.map((proc) => (
                  <span key={proc} className="text-[11px] rounded-md px-1.5 py-0.5 bg-success/10 text-success">{proc}</span>
                ))}
              </div>
            </Section>
          )}
          {isSAR && step.sarStage && (step.status === 'COMPLETED' || step.status === 'RUNNING') && (
            <Section title="Tasks">
              <div className="flex flex-wrap gap-1.5">
                {SAR_STAGE_TASKS[step.sarStage].map((task) => {
                  const active = !step.enabledTasks || step.enabledTasks.includes(task);
                  return (
                    <span
                      key={task}
                      className={cn(
                        'text-[11px] rounded-md px-1.5 py-0.5',
                        active ? 'bg-success/10 text-success' : 'bg-muted/50 text-muted-foreground/40 line-through',
                      )}
                    >{task}</span>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Input / Output */}
          <Section title="I/O">
            <div className="space-y-2">
              {inputPath && (
                <IORow direction="Input" path={inputPath} />
              )}
              <IORow
                direction="Output"
                path={step.outputPath}
                placeholder={
                  step.status === 'FAILED' ? 'Processing failed - no output produced'
                  : step.status === 'RUNNING' ? 'Processing...'
                  : step.status === 'PENDING' || step.status === 'CANCELED' ? 'Waiting for execution'
                  : undefined
                }
              />
            </div>
          </Section>

          {/* Errors */}
          {errorLogs.length > 0 && (
            <Section title={`Errors (${errorLogs.length})`} titleColor="text-destructive">
              <div className="space-y-1.5">
                {errorLogs.map((log) => (
                  <div key={log.id} className="bg-destructive/5 border border-destructive/15 rounded-md px-3 py-2">
                    <div className="text-xs text-destructive/90 break-all">{log.message}</div>
                    {log.detail && (
                      <div className="text-[11px] text-destructive/60 mt-1 font-mono break-all">{log.detail}</div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Warnings */}
          {warnLogs.length > 0 && (
            <Section title={`Warnings (${warnLogs.length})`} titleColor="text-amber-500">
              <div className="space-y-1.5">
                {warnLogs.map((log) => (
                  <div key={log.id} className="bg-amber-500/5 border border-amber-500/15 rounded-md px-3 py-2 text-xs text-amber-400/80 break-all">
                    {log.message}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* All Logs */}
          {stepLogs.length > 0 && (
            <Section title={`Execution Logs (${stepLogs.length})`}>
              <div className="max-h-[180px] overflow-y-auto space-y-0.5 rounded-md bg-background/50 border border-border/30 px-3 py-2">
                {stepLogs.map((log) => {
                  const style = LOG_LEVEL_STYLE[log.level];
                  const LevelIcon = style.icon;
                  return (
                    <div key={log.id} className="flex items-start gap-1.5 text-[11px] leading-[16px]">
                      <span className="text-muted-foreground/50 shrink-0 font-mono">{formatLogTime(log.timestamp)}</span>
                      <LevelIcon className={cn('w-3 h-3 mt-[1px] shrink-0', style.color)} />
                      <span className={cn(
                        'break-all',
                        log.level === 'ERROR' ? 'text-destructive/80'
                        : log.level === 'WARN' ? 'text-amber-400/70'
                        : 'text-foreground/60',
                      )}>
                        {log.message}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {stepLogs.length === 0 && (
            <div className="text-xs text-muted-foreground/50 text-center py-3">
              No logs are available for this step.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, titleColor, children }: { title: string; titleColor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className={cn('text-xs font-semibold', titleColor ?? 'text-muted-foreground')}>{title}</div>
      {children}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground/60">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function IORow({ direction, path, placeholder }: { direction: string; path?: string; placeholder?: string }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className={cn(
        'shrink-0 flex items-center gap-1 font-medium mt-0.5',
        direction === 'Input' ? 'text-blue-400/70' : 'text-accent/70',
      )}>
        <ArrowRight className={cn('w-3 h-3', direction === 'Input' && 'rotate-180')} />
        {direction}
      </span>
      {path ? (
        <span className="font-mono text-foreground/70 break-all">{path}</span>
      ) : placeholder ? (
        <span className="text-muted-foreground/40 italic">{placeholder}</span>
      ) : null}
    </div>
  );
}
