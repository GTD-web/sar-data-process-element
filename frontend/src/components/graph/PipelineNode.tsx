'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils';
import type { StepStatus, TargetCsc, ProductLevel, PipelineNodeKind } from '@/types/pipeline';
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
  Antenna,
  Lock,
} from 'lucide-react';

export interface PipelineNodeData {
  kind?: PipelineNodeKind;
  targetCsc: TargetCsc;
  productLevel: ProductLevel;
  status: StepStatus;
  order: number;
  durationMs?: number;
  errorMessage?: string;
  editable?: boolean;
  isLeaf?: boolean;
  isHead?: boolean;
  onDelete?: (order: number) => void;
  onAddAfter?: (afterOrder: number) => void;
  [key: string]: unknown;
}

const CSC_ICON_CONFIG: Record<TargetCsc, { icon: React.ElementType }> = {
  'CSC-02': { icon: Satellite },
  'CSC-03': { icon: Radio },
  'CSC-04': { icon: Cpu },
  'CSC-05': { icon: SlidersHorizontal },
  'CSC-06': { icon: Globe },
  'CSC-07': { icon: Database },
};

const STATUS_BORDER: Record<StepStatus, string> = {
  PENDING: 'border-accent/40',
  RUNNING: 'border-accent',
  COMPLETED: 'border-accent',
  FAILED: 'border-destructive',
  SKIPPED: 'border-accent/20',
};

const STATUS_GLOW: Record<StepStatus, string> = {
  PENDING: '0 0 12px rgba(52, 211, 153, 0.15)',
  RUNNING: '0 0 20px rgba(52, 211, 153, 0.35)',
  COMPLETED: '0 0 16px rgba(52, 211, 153, 0.25)',
  FAILED: '0 0 16px rgba(239, 68, 68, 0.25)',
  SKIPPED: 'none',
};

const STATUS_INDICATOR: Record<StepStatus, { icon: React.ElementType; color: string }> = {
  PENDING: { icon: Circle, color: 'text-muted-foreground' },
  RUNNING: { icon: Loader, color: 'text-accent' },
  COMPLETED: { icon: CheckCircle, color: 'text-success' },
  FAILED: { icon: XCircle, color: 'text-destructive' },
  SKIPPED: { icon: Ban, color: 'text-muted-foreground' },
};

const NODE_SIZE = 64;

function PipelineNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as PipelineNodeData;
  const { kind, targetCsc, productLevel, status, order, durationMs, errorMessage, editable, isLeaf, isHead, onDelete, onAddAfter } = nodeData;

  const isTrigger = kind === 'TRIGGER';
  // D-03: CSC-07은 SI-08 스키마 미확정으로 상태 표시 불가
  const isUnconfirmedNode = targetCsc === 'CSC-07';

  const CscIcon = isTrigger ? Antenna : CSC_ICON_CONFIG[targetCsc].icon;

  // CSC-07은 상태 무관하게 회색 고정
  const effectiveBorder = isUnconfirmedNode ? 'border-muted' : STATUS_BORDER[status];
  const effectiveGlow = isUnconfirmedNode ? 'none' : STATUS_GLOW[status];

  const statusInd = isUnconfirmedNode
    ? { icon: Lock, color: 'text-muted-foreground' }
    : STATUS_INDICATOR[status];
  const StatusIcon = statusInd.icon;

  // CSC-07은 항상 Lock 뱃지, 일반 노드는 PENDING 제외
  const showStatusBadge = isUnconfirmedNode || status !== 'PENDING';

  const label = isTrigger ? '원시 데이터 수신' : CSC_LABELS[targetCsc];
  const subLabel = isTrigger ? 'EI-01 · 수신 트리거' : `${targetCsc} · ${PRODUCT_LEVEL_LABELS[productLevel]}`;

  // TRIGGER: target handle 없음(진입점), delete 버튼 없음
  const showTargetHandle = !isTrigger && !isHead;
  const showDeleteButton = !isTrigger && editable && !!onDelete;

  return (
    <div
      className="flex items-start group"
      title={isUnconfirmedNode ? 'SI-08 스키마 미확정 — 상태 표시 불가' : undefined}
    >
      <div className="flex flex-col items-center">
        {/* Icon Box — n8n style square */}
        <div
          className={cn(
            'relative rounded-xl border-2 flex items-center justify-center transition-all',
            effectiveBorder,
            'bg-card',
            selected && 'ring-2 ring-accent ring-offset-2 ring-offset-background',
            editable && !isTrigger && 'cursor-grab active:cursor-grabbing',
            status === 'RUNNING' && !isUnconfirmedNode && 'animate-status-pulse',
          )}
          style={{ width: NODE_SIZE, height: NODE_SIZE, boxShadow: effectiveGlow }}
        >
          {/* Status badge — top-left of icon box */}
          {showStatusBadge && (
            <div className="absolute -top-3 -left-3 z-10">
              <StatusIcon
                className={cn(
                  'w-4 h-4',
                  statusInd.color,
                  status === 'RUNNING' && !isUnconfirmedNode && 'animate-spin',
                )}
              />
            </div>
          )}

          {/* Delete button — positioned relative to the icon box */}
          {showDeleteButton && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete!(order); }}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:scale-110 z-10"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}

          {/* Target handle — left (hidden for head/trigger nodes) */}
          {showTargetHandle && (
            <Handle
              type="target"
              position={Position.Left}
              className="!bg-accent/50 !w-3 !h-3 !border-2 !border-card !-left-1.5 hover:!bg-accent hover:!scale-125 !transition-all"
            />
          )}

          <CscIcon className={cn('w-7 h-7', isUnconfirmedNode ? 'text-muted-foreground' : 'text-accent')} />

          {/* Source handle — right */}
          <Handle
            type="source"
            position={Position.Right}
            className={cn(
              '!w-3 !h-3 !border-2 !border-card !-right-1.5 hover:!bg-accent hover:!scale-125 !transition-all',
              isLeaf && editable ? '!bg-accent !opacity-100' : '!bg-accent/50',
            )}
          />
        </div>

        {/* Label below — n8n style */}
        <div className="mt-2 text-center max-w-[120px]">
          <div className="text-[11px] font-semibold text-foreground leading-tight">{label}</div>
          <div className={cn('text-[10px]', isUnconfirmedNode ? 'text-muted-foreground/60' : 'text-muted-foreground')}>
            {subLabel}
          </div>
          {isUnconfirmedNode && (
            <div className="text-[9px] text-muted-foreground/50">(SI-08 미확정)</div>
          )}
          {durationMs !== undefined && !isUnconfirmedNode && (
            <div className="text-[9px] text-success font-mono">{formatDuration(durationMs)}</div>
          )}
          {errorMessage && (
            <div className="text-[9px] text-destructive truncate" title={errorMessage}>{errorMessage}</div>
          )}
        </div>
      </div>

      {/* Leaf node: trailing line + add button — part of the node so it moves together */}
      {isLeaf && editable && !isTrigger && onAddAfter && (
        <div
          className="flex items-center nodrag"
          style={{ marginTop: NODE_SIZE / 2 - 14, marginLeft: -2 }}
        >
          <svg width="52" height="2" className="flex-shrink-0">
            <line x1="0" y1="1" x2="52" y2="1" stroke="var(--accent)" strokeWidth="2" style={{ opacity: 0.4 }} />
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
