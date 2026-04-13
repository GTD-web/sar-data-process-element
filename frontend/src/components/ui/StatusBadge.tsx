'use client';

import { cn } from '@/lib/utils';
import type { JobStatus, StepStatus } from '@/types/pipeline';
import { JOB_STATUS_DISPLAY } from '@/types/pipeline';
import { AlertCircle, CheckCircle, Circle, Loader, RefreshCw, XCircle, Ban } from 'lucide-react';

const JOB_STATUS_STYLES: Record<JobStatus, { bg: string; text: string; icon: React.ElementType }> = {
  CREATED: { bg: 'bg-slate-500/20', text: 'text-slate-400', icon: Circle },
  ASSIGNED: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: Loader },
  COMPLETED: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: CheckCircle },
  FAILED: { bg: 'bg-red-500/20', text: 'text-red-400', icon: AlertCircle },
  CANCELED: { bg: 'bg-zinc-500/20', text: 'text-zinc-400', icon: Ban },
};

const STEP_STATUS_STYLES: Record<StepStatus, { bg: string; text: string; icon: React.ElementType }> = {
  PENDING: { bg: 'bg-slate-500/20', text: 'text-slate-400', icon: Circle },
  RUNNING: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: Loader },
  COMPLETED: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: CheckCircle },
  FAILED: { bg: 'bg-red-500/20', text: 'text-red-400', icon: XCircle },
  SKIPPED: { bg: 'bg-zinc-500/20', text: 'text-zinc-400', icon: Ban },
};

export function JobStatusBadge({ status, retryCount }: { status: JobStatus; retryCount?: number }) {
  const style = JOB_STATUS_STYLES[status];
  const Icon = style.icon;
  const label = status === 'FAILED' && retryCount !== undefined && retryCount > 0
    ? `RETRY ${retryCount}/3`
    : JOB_STATUS_DISPLAY[status];

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', style.bg, style.text)}>
      <Icon className={cn('w-3 h-3', status === 'ASSIGNED' && 'animate-spin')} />
      {label}
    </span>
  );
}

export function StepStatusBadge({ status }: { status: StepStatus }) {
  const style = STEP_STATUS_STYLES[status];
  const Icon = style.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', style.bg, style.text)}>
      <Icon className={cn('w-3 h-3', status === 'RUNNING' && 'animate-spin')} />
      {status}
    </span>
  );
}

export function AlertKindBadge({ kind }: { kind: string }) {
  const styles: Record<string, string> = {
    MAX_RETRY: 'bg-red-500/20 text-red-400',
    PIPELINE_DELAY: 'bg-amber-500/20 text-amber-400',
    QUALITY_FAIL: 'bg-orange-500/20 text-orange-400',
    RESOURCE_THRESHOLD: 'bg-purple-500/20 text-purple-400',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', styles[kind] ?? 'bg-muted text-muted-foreground')}>
      {kind}
    </span>
  );
}
