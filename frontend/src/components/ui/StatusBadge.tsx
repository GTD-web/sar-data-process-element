'use client';

import { cn } from '@/lib/utils';
import type { JobStatus, StepStatus } from '@/types/pipeline';
import { JOB_STATUS_DISPLAY } from '@/types/pipeline';
import { AlertCircle, CheckCircle, Circle, Loader, RefreshCw, XCircle, Ban } from 'lucide-react';

const JOB_STATUS_STYLES: Record<JobStatus, { bg: string; text: string; icon: React.ElementType }> = {
  CREATED: { bg: 'bg-muted/50', text: 'text-muted-foreground', icon: Circle },
  ASSIGNED: { bg: 'bg-accent/15', text: 'text-accent', icon: Loader },
  COMPLETED: { bg: 'bg-success/15', text: 'text-success', icon: CheckCircle },
  FAILED: { bg: 'bg-destructive/15', text: 'text-destructive', icon: AlertCircle },
  CANCELED: { bg: 'bg-muted/50', text: 'text-muted-foreground', icon: Ban },
};

const STEP_STATUS_STYLES: Record<StepStatus, { bg: string; text: string; icon: React.ElementType }> = {
  PENDING: { bg: 'bg-muted/50', text: 'text-muted-foreground', icon: Circle },
  RUNNING: { bg: 'bg-accent/15', text: 'text-accent', icon: Loader },
  COMPLETED: { bg: 'bg-success/15', text: 'text-success', icon: CheckCircle },
  FAILED: { bg: 'bg-destructive/15', text: 'text-destructive', icon: XCircle },
  SKIPPED: { bg: 'bg-muted/50', text: 'text-muted-foreground', icon: Ban },
  CANCELED: { bg: 'bg-muted/50', text: 'text-muted-foreground', icon: Ban },
};

export function JobStatusBadge({ status, retryCount }: { status: JobStatus; retryCount?: number }) {
  const style = JOB_STATUS_STYLES[status];
  const Icon = style.icon;
  const label =
    status === 'FAILED' && retryCount !== undefined && retryCount > 0
      ? `RETRY ${retryCount}/3`
      : status === 'ASSIGNED' && retryCount !== undefined && retryCount > 0
        ? `재시도 ${retryCount}/3`
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
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent/15 text-accent">
      {kind}
    </span>
  );
}
