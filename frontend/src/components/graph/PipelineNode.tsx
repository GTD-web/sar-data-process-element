'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils';
import type { StepStatus, TargetCsc, ProductLevel } from '@/types/pipeline';
import { CSC_LABELS, PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import {
  CheckCircle,
  Circle,
  Loader,
  XCircle,
  Ban,
  Trash2,
  Plus,
  Satellite,
  Radio,
  Cpu,
  SlidersHorizontal,
  Globe,
  Database,
} from 'lucide-react';

export interface PipelineNodeData {
  targetCsc: TargetCsc;
  productLevel: ProductLevel;
  status: StepStatus;
  order: number;
  durationMs?: number;
  errorMessage?: string;
  editable?: boolean;
  isLeaf?: boolean;
  onDelete?: (order: number) => void;
  onAddAfter?: (afterOrder: number) => void;
  [key: string]: unknown;
}

const CSC_ICON_CONFIG: Record<TargetCsc, { icon: React.ElementType; color: string; bg: string }> = {
  'CSC-02': { icon: Satellite, color: 'text-sky-400', bg: 'bg-sky-400/15' },
  'CSC-03': { icon: Radio, color: 'text-violet-400', bg: 'bg-violet-400/15' },
  'CSC-04': { icon: Cpu, color: 'text-amber-400', bg: 'bg-amber-400/15' },
  'CSC-05': { icon: SlidersHorizontal, color: 'text-teal-400', bg: 'bg-teal-400/15' },
  'CSC-06': { icon: Globe, color: 'text-indigo-400', bg: 'bg-indigo-400/15' },
  'CSC-07': { icon: Database, color: 'text-pink-400', bg: 'bg-pink-400/15' },
};

const STATUS_BORDER: Record<StepStatus, string> = {
  PENDING: 'border-slate-600',
  RUNNING: 'border-blue-500',
  COMPLETED: 'border-emerald-500',
  FAILED: 'border-red-500',
  SKIPPED: 'border-zinc-600',
};

const STATUS_INDICATOR: Record<StepStatus, { icon: React.ElementType; color: string }> = {
  PENDING: { icon: Circle, color: 'text-slate-500' },
  RUNNING: { icon: Loader, color: 'text-blue-400' },
  COMPLETED: { icon: CheckCircle, color: 'text-emerald-400' },
  FAILED: { icon: XCircle, color: 'text-red-400' },
  SKIPPED: { icon: Ban, color: 'text-zinc-500' },
};

const NODE_SIZE = 64;

function PipelineNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as PipelineNodeData;
  const { targetCsc, productLevel, status, order, durationMs, errorMessage, editable, isLeaf, onDelete, onAddAfter } = nodeData;
  const csc = CSC_ICON_CONFIG[targetCsc];
  const CscIcon = csc.icon;
  const statusInd = STATUS_INDICATOR[status];
  const StatusIcon = statusInd.icon;

  return (
    <div className="flex items-start group">
      <div className="flex flex-col items-center">
        {/* Status badge — top-left of box */}
        {status !== 'PENDING' && (
          <div className="absolute -top-1.5 -left-1.5 z-10">
            <StatusIcon className={cn('w-4 h-4', statusInd.color, status === 'RUNNING' && 'animate-spin')} />
          </div>
        )}

        {/* Icon Box — n8n style square */}
        <div
          className={cn(
            'relative rounded-xl border-2 flex items-center justify-center transition-all',
            STATUS_BORDER[status],
            csc.bg,
            selected && 'ring-2 ring-accent ring-offset-2 ring-offset-background',
            editable && 'cursor-grab active:cursor-grabbing',
            status === 'RUNNING' && 'animate-status-pulse',
          )}
          style={{ width: NODE_SIZE, height: NODE_SIZE }}
        >
          {/* Delete button — positioned relative to the icon box */}
          {editable && onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(order); }}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:scale-110 z-10"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}

          {/* Target handle — left */}
          <Handle
            type="target"
            position={Position.Left}
            className="!bg-muted-foreground/50 !w-3 !h-3 !border-2 !border-card !-left-1.5 hover:!bg-accent hover:!scale-125 !transition-all"
          />

          <CscIcon className={cn('w-7 h-7', csc.color)} />

          {/* Source handle — right */}
          <Handle
            type="source"
            position={Position.Right}
            className={cn(
              '!w-3 !h-3 !border-2 !border-card !-right-1.5 hover:!bg-accent hover:!scale-125 !transition-all',
              isLeaf && editable ? '!bg-accent !opacity-100' : '!bg-muted-foreground/50',
            )}
          />
        </div>

        {/* Label below — n8n style */}
        <div className="mt-2 text-center max-w-[120px]">
          <div className="text-[11px] font-semibold text-foreground leading-tight">{CSC_LABELS[targetCsc]}</div>
          <div className="text-[10px] text-muted-foreground">{targetCsc} · {PRODUCT_LEVEL_LABELS[productLevel]}</div>
          {durationMs !== undefined && (
            <div className="text-[9px] text-emerald-400 font-mono">{formatDuration(durationMs)}</div>
          )}
          {errorMessage && (
            <div className="text-[9px] text-red-400 truncate" title={errorMessage}>{errorMessage}</div>
          )}
        </div>
      </div>

      {/* Leaf node: trailing line + add button — part of the node so it moves together */}
      {isLeaf && editable && onAddAfter && (
        <div
          className="flex items-center nodrag"
          style={{ marginTop: NODE_SIZE / 2 - 14, marginLeft: -2 }}
        >
          <svg width="52" height="2" className="flex-shrink-0">
            <line x1="0" y1="1" x2="52" y2="1" stroke="#cbd5e1" strokeWidth="2" />
          </svg>
          <button
            onClick={(e) => { e.stopPropagation(); onAddAfter(order); }}
            className="w-7 h-7 rounded-full bg-card border-2 border-border flex items-center justify-center hover:border-accent hover:bg-accent/10 transition-all flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  );
}

export const PipelineNode = memo(PipelineNodeComponent);
