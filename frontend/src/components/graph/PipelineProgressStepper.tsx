'use client';

import { useMemo } from 'react';
import { Ban, CheckCircle, Circle, Loader, XCircle, ChevronRight } from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';
import type { PipelineStep, StepStatus } from '@/types/pipeline';
import { CSC_PROCESSING_LEVELS } from '@/types/pipeline';

// ─── 스테퍼 그룹 정의 ────────────────────────────────────────────────────────

interface StepperGroup {
  id: string;
  label: string;
  cscLabel: string;
  vtSeconds?: number;
  status: StepStatus;
  durationMs?: number;
  startedAt?: string;
}

function buildGroups(steps: PipelineStep[]): StepperGroup[] {
  const groups: StepperGroup[] = [];

  // ① 원시 데이터 수신 트리거 (TRIGGER)
  const triggerStep = steps.find((s) => s.kind === 'TRIGGER');
  if (triggerStep) {
    groups.push({
      id: 'trigger',
      label: '수신 트리거',
      cscLabel: 'EI-01',
      status: triggerStep.status,
      durationMs: triggerStep.durationMs,
      startedAt: triggerStep.startedAt,
    });
  }

  // ② 작업 초기화 (JOB_INIT)
  const initStep = steps.find((s) => s.kind === 'JOB_INIT');
  if (initStep) {
    groups.push({
      id: 'jobInit',
      label: '초기화',
      cscLabel: 'CSU-08.02',
      status: initStep.status,
      durationMs: initStep.durationMs,
      startedAt: initStep.startedAt,
    });
  }

  // ③ SAR 처리 레벨별 그룹 (L0/L1/L2/L3)
  for (const levelDef of CSC_PROCESSING_LEVELS) {
    const matching = steps.filter(
      (s) => s.kind === 'SAR' && s.sarStage !== undefined && levelDef.stages.includes(s.sarStage as typeof levelDef.stages[number]),
    );
    if (matching.length === 0) continue;

    // 집계 상태: FAILED > RUNNING > COMPLETED > CANCELED > PENDING
    let groupStatus: StepStatus = 'PENDING';
    if (matching.some((s) => s.status === 'FAILED')) groupStatus = 'FAILED';
    else if (matching.some((s) => s.status === 'RUNNING')) groupStatus = 'RUNNING';
    else if (matching.every((s) => s.status === 'COMPLETED' || s.status === 'SKIPPED')) groupStatus = 'COMPLETED';
    else if (matching.some((s) => s.status === 'CANCELED')) groupStatus = 'CANCELED';

    const totalDuration = matching.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
    const firstStarted = matching
      .map((s) => s.startedAt)
      .filter(Boolean)
      .sort()[0];

    groups.push({
      id: levelDef.csc,
      label: levelDef.label,
      cscLabel: levelDef.csc,
      vtSeconds: levelDef.vtSeconds,
      status: groupStatus,
      durationMs: groupStatus === 'COMPLETED' ? totalDuration : undefined,
      startedAt: firstStarted,
    });
  }

  // ④ 카탈로그 등록 (CATALOG)
  const catalogStep = steps.find((s) => s.kind === 'CATALOG');
  if (catalogStep) {
    groups.push({
      id: 'catalog',
      label: '카탈로그',
      cscLabel: 'CSC-07',
      status: catalogStep.status,
      durationMs: catalogStep.durationMs,
      startedAt: catalogStep.startedAt,
    });
  }

  return groups;
}

// ─── 상태 표시 ────────────────────────────────────────────────────────────────

function StatusIcon({ status, className }: { status: StepStatus; className?: string }) {
  if (status === 'COMPLETED') return <CheckCircle className={cn('w-3.5 h-3.5 text-success', className)} />;
  if (status === 'RUNNING') return <Loader className={cn('w-3.5 h-3.5 text-accent animate-spin', className)} />;
  if (status === 'FAILED') return <XCircle className={cn('w-3.5 h-3.5 text-destructive', className)} />;
  if (status === 'CANCELED') return <Ban className={cn('w-3.5 h-3.5 text-muted-foreground/40', className)} />;
  return <Circle className={cn('w-3.5 h-3.5 text-muted-foreground/40', className)} />;
}

// ─── 그룹 카드 ────────────────────────────────────────────────────────────────

function StepperCell({ group }: { group: StepperGroup }) {
  const isRunning = group.status === 'RUNNING';
  const isCompleted = group.status === 'COMPLETED';
  const isFailed = group.status === 'FAILED';
  const isPending = group.status === 'PENDING';
  const isCanceled = group.status === 'CANCELED';

  const vtMin = group.vtSeconds !== undefined ? Math.floor(group.vtSeconds / 60) : undefined;

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-md min-w-[68px]',
        isRunning && 'bg-accent/10 border border-accent/30',
        isFailed && 'bg-destructive/10 border border-destructive/30',
        isCompleted && 'bg-success/5',
        isPending && 'opacity-45',
        isCanceled && 'opacity-35',
      )}
    >
      {/* 상태 아이콘 + 레이블 */}
      <div className="flex items-center gap-1">
        <StatusIcon status={group.status} />
        <span
          className={cn(
            'text-[11px] font-semibold whitespace-nowrap',
            isCompleted && 'text-success',
            isRunning && 'text-accent',
            isFailed && 'text-destructive',
            isPending && 'text-muted-foreground',
            isCanceled && 'text-muted-foreground',
          )}
        >
          {group.label}
        </span>
      </div>

      {/* 하단 정보: duration (완료 시) / VT 상한 (대기·실행 시) */}
      <div className="text-[9px] text-muted-foreground whitespace-nowrap">
        {isCompleted && group.durationMs !== undefined && group.durationMs > 0
          ? <span className="text-success/70">{formatDuration(group.durationMs)}</span>
          : isRunning && vtMin !== undefined
          ? <span className="text-accent/70">VT {vtMin}분</span>
          : vtMin !== undefined
          ? <span>VT {vtMin}분</span>
          : <span>{group.cscLabel}</span>
        }
      </div>
    </div>
  );
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

interface PipelineProgressStepperProps {
  steps: PipelineStep[];
}

export default function PipelineProgressStepper({ steps }: PipelineProgressStepperProps) {
  const groups = useMemo(() => buildGroups(steps), [steps]);
  if (groups.length === 0) return null;

  // 현재 진행 단계 인덱스
  const activeIdx = groups.findIndex((g) => g.status === 'RUNNING' || g.status === 'FAILED');

  return (
    <div className="flex items-center gap-0 px-4 py-2 border-b border-border bg-card/60 backdrop-blur-sm overflow-x-auto">
      {groups.map((group, idx) => (
        <div key={group.id} className="flex items-center flex-shrink-0">
          <StepperCell group={group} />
          {idx < groups.length - 1 && (
            <ChevronRight
              className={cn(
                'w-3 h-3 mx-0.5 flex-shrink-0',
                idx < (activeIdx === -1 ? groups.length : activeIdx)
                  ? 'text-success/60'
                  : 'text-muted-foreground/25',
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
