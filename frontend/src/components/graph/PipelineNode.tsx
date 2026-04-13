'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils';
import type { StepStatus, TargetCsc, ProductLevel } from '@/types/pipeline';
import { CSC_LABELS, PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { CheckCircle, Circle, Loader, XCircle, Ban } from 'lucide-react';

export interface PipelineNodeData {
  targetCsc: TargetCsc;
  productLevel: ProductLevel;
  status: StepStatus;
  order: number;
  durationMs?: number;
  errorMessage?: string;
  [key: string]: unknown;
}

const STATUS_CONFIG: Record<StepStatus, {
  border: string;
  bg: string;
  icon: React.ElementType;
  iconColor: string;
  pulse: boolean;
}> = {
  PENDING: { border: 'border-slate-600', bg: 'bg-slate-800/50', icon: Circle, iconColor: 'text-slate-500', pulse: false },
  RUNNING: { border: 'border-blue-500', bg: 'bg-blue-950/50', icon: Loader, iconColor: 'text-blue-400', pulse: true },
  COMPLETED: { border: 'border-emerald-500', bg: 'bg-emerald-950/50', icon: CheckCircle, iconColor: 'text-emerald-400', pulse: false },
  FAILED: { border: 'border-red-500', bg: 'bg-red-950/50', icon: XCircle, iconColor: 'text-red-400', pulse: false },
  SKIPPED: { border: 'border-zinc-600', bg: 'bg-zinc-800/50', icon: Ban, iconColor: 'text-zinc-500', pulse: false },
};

function PipelineNodeComponent({ data }: NodeProps) {
  const nodeData = data as unknown as PipelineNodeData;
  const { targetCsc, productLevel, status, durationMs, errorMessage } = nodeData;
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg border-2 min-w-[180px]',
        cfg.border,
        cfg.bg,
        cfg.pulse && 'animate-status-pulse',
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-border !w-2 !h-2" />

      <div className="flex items-start gap-2.5">
        <Icon className={cn('w-5 h-5 mt-0.5 flex-shrink-0', cfg.iconColor, status === 'RUNNING' && 'animate-spin')} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-foreground">{targetCsc}</div>
          <div className="text-[11px] text-muted-foreground truncate">{CSC_LABELS[targetCsc]}</div>
          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
            {PRODUCT_LEVEL_LABELS[productLevel]}
          </div>
          {durationMs !== undefined && (
            <div className="text-[10px] text-emerald-400 mt-1 font-mono">{formatDuration(durationMs)}</div>
          )}
          {errorMessage && (
            <div className="text-[10px] text-red-400 mt-1 truncate max-w-[140px]" title={errorMessage}>
              {errorMessage}
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-border !w-2 !h-2" />
    </div>
  );
}

export const PipelineNode = memo(PipelineNodeComponent);
