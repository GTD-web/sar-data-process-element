'use client';

import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils';
import type { StepStatus, SarStage, PipelineNodeKind, ProductLevel } from '@/types/pipeline';
import { SAR_STAGE_LABELS, SAR_STAGE_TASKS, SAR_STAGE_TO_LEVEL, PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import {
  CheckCircle,
  Circle,
  Loader,
  XCircle,
  Ban,
  Trash2,
  Plus,
  Zap,
  FlaskConical,
  Play,
  Power,
  RotateCcw,
  AlertTriangle,
  Antenna,
  SlidersHorizontal,
  HardDrive,
  Cpu,
  Layers,
  Compass,
  Map,
  Crosshair,
  Package,
  Database,
  FileInput,
  Image as ImageIcon,
} from 'lucide-react';

export interface PipelineNodeData {
  kind?: PipelineNodeKind;
  sarStage?: SarStage;
  /** FILE_INPUT 노드 전용. 입력 파일의 처리 레벨. */
  inputLevel?: ProductLevel;
  status: StepStatus;
  order: number;
  durationMs?: number;
  errorMessage?: string;
  editable?: boolean;
  isLeaf?: boolean;
  isHead?: boolean;
  enabledTasks?: string[];
  onDelete?: (order: number) => void;
  onAddAfter?: (afterOrder: number) => void;
  onTrigger?: () => void;
  /** 개별 노드 실행 → 노드 상세 모달 열기 */
  onExecuteStep?: (order: number) => void;
  /** 설정 누락 등 — 해당 노드에만 표시 (예: JOB_INIT 프로파일 미선택) */
  warningReason?: string;
  /** 노드 활성화 여부. false면 바이패스 상태로 처리를 건너뜀. 기본값: true */
  enabled?: boolean;
  /** 활성화/비활성화 토글 콜백 (진입 노드에는 제공하지 않음) */
  onToggleActive?: (order: number) => void;
  /** SAR 노드 부분 재처리 콜백 (Job 선택 + FAILED/COMPLETED 상태일 때만 제공) */
  onReprocess?: (order: number) => void;
  /** Job 선택 모드 — PENDING 노드를 회색으로 표시 */
  isJobMode?: boolean;
  [key: string]: unknown;
}

const SAR_ICON_CONFIG: Record<SarStage, { icon: React.ElementType }> = {
  L0: { icon: HardDrive },
  L1A: { icon: Cpu },
  L1B: { icon: Layers },
  L1C: { icon: Compass },
  L2A: { icon: Map },
  L2B: { icon: Crosshair },
  L3: { icon: Package },
};

const STATUS_BORDER: Record<StepStatus, string> = {
  PENDING: 'border-accent/40',
  RUNNING: 'border-accent',
  COMPLETED: 'border-accent',
  FAILED: 'border-destructive',
  SKIPPED: 'border-accent/20',
  CANCELED: 'border-muted-foreground/30',
};

const STATUS_GLOW: Record<StepStatus, string> = {
  PENDING: '0 0 12px rgba(52, 211, 153, 0.15)',
  RUNNING: '0 0 20px rgba(52, 211, 153, 0.35)',
  COMPLETED: '0 0 16px rgba(52, 211, 153, 0.25)',
  FAILED: '0 0 16px rgba(239, 68, 68, 0.25)',
  SKIPPED: 'none',
  CANCELED: 'none',
};

/** Job 모드에서 PENDING 노드용 — 실행되지 않았음을 표시 */
const JOB_PENDING_BORDER = 'border-muted-foreground/30';
const JOB_PENDING_GLOW = 'none';

/**
 * 노드 종류별 베이스 톤.
 * - JOB_INIT 만 별도 컬러(파랑) — 설정 단계 강조
 * - SAR/THUMBNAIL: 기본 accent(mint) — 처리 단계
 * - TRIGGER/FILE_INPUT/CATALOG: 컬러 톤 대신 회색 배경 + 흰색 아이콘 (NEUTRAL_FILLED 처리)
 * `rgb` 는 CSS 변수(--node-tone-rgb)로 노출돼 hover/selected/overlay 까지 색상이 따라옴.
 */
export const KIND_TONE: Partial<Record<NonNullable<PipelineNodeKind>, { hex: string; rgb: string }>> = {
  JOB_INIT: { hex: '#029FE7', rgb: '2, 159, 231' },
};
const DEFAULT_TONE_RGB = '52, 211, 153';

const NEUTRAL_FILL_BG = '#6A7282';
const NEUTRAL_FILL_RGB = '106, 114, 130';
const NEUTRAL_ICON_COLOR = '#FFFFFF';

export function kindToneHex(kind: PipelineNodeKind | undefined): string | undefined {
  return kind ? KIND_TONE[kind]?.hex : undefined;
}

export function isNeutralFilledKind(kind: PipelineNodeKind | undefined): boolean {
  return kind === 'TRIGGER' || kind === 'FILE_INPUT' || kind === 'CATALOG';
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const STATUS_INDICATOR: Record<StepStatus, { icon: React.ElementType; color: string }> = {
  PENDING: { icon: Circle, color: 'text-muted-foreground' },
  RUNNING: { icon: Loader, color: 'text-accent' },
  COMPLETED: { icon: CheckCircle, color: 'text-success' },
  FAILED: { icon: XCircle, color: 'text-destructive' },
  SKIPPED: { icon: Ban, color: 'text-muted-foreground' },
  CANCELED: { icon: Ban, color: 'text-muted-foreground' },
};

const NODE_SIZE = 64;

const TOOLTIP_HIDE_MS = 500;

const NodeWarningHint = memo(function NodeWarningHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const hideRef = useRef<number | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideRef.current != null) {
      window.clearTimeout(hideRef.current);
      hideRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearHideTimer();
    setOpen(true);
  }, [clearHideTimer]);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideRef.current = window.setTimeout(() => {
      setOpen(false);
      hideRef.current = null;
    }, TOOLTIP_HIDE_MS);
  }, [clearHideTimer]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  return (
    <div
      className="absolute top-1 right-1 z-[12] nodrag flex flex-col items-end gap-0"
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
    >
      <button
        type="button"
        className="rounded p-0.5 text-amber-500 hover:bg-amber-500/15 cursor-help outline-none focus-visible:ring-1 focus-visible:ring-amber-500/50"
        aria-label="Configuration warning"
        aria-expanded={open}
      >
        <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2.25} />
      </button>
      {open && (
        <div
          role="tooltip"
          className="mt-1 w-max max-w-[min(260px,75vw)] rounded-md border border-border bg-card px-2.5 py-2 text-left text-[10px] leading-snug text-foreground shadow-xl pointer-events-auto"
        >
          {text}
        </div>
      )}
    </div>
  );
});

/**
 * n8n 스타일 노드 위 툴바 — 호버 시 표시
 * - Play: 개별 노드 실행 → 노드 상세 모달 (더블클릭과 동일)
 * - Power: 활성화/비활성화 토글 (진입 노드 제외)
 * - Trash: 노드 삭제 (non-entry 노드만)
 * 파이프라인 전체 실행은 진입 노드 좌측의 별도 버튼이 담당.
 */
const NodeHoverToolbar = memo(function NodeHoverToolbar({
  showDelete,
  onDelete,
  onExecute,
  isVisible,
  isEntryNode,
  isEnabled,
  onToggle,
  onReprocess,
}: {
  showDelete: boolean;
  onDelete?: () => void;
  onExecute?: () => void;
  isVisible: boolean;
  isEntryNode: boolean;
  isEnabled: boolean;
  onToggle?: () => void;
  onReprocess?: () => void;
}) {
  const btnClass =
    'nodrag w-7 h-7 rounded-md flex items-center justify-center text-[#a0a0a0] hover:text-[#f5f5f5] hover:bg-white/10 transition-colors cursor-pointer';

  return (
    <div
      className={cn(
        'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 nodrag',
        'flex items-center gap-0.5 bg-[#333333] rounded-lg px-1 py-1 shadow-lg border border-[#3a3a3a]',
        'transition-opacity duration-150',
        isVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      )}
    >
      <button
        type="button"
        className={btnClass}
        title="Run node (view details)"
        onClick={(e) => { e.stopPropagation(); onExecute?.(); }}
      >
        <Play className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
      </button>
      {onReprocess && (
        <button
          type="button"
          className={cn(btnClass, 'hover:text-amber-400')}
          title="Reprocess from this stage"
          onClick={(e) => { e.stopPropagation(); onReprocess(); }}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
      {!isEntryNode && (
        <button
          type="button"
          className={cn(btnClass, !isEnabled && 'text-muted-foreground')}
          title={isEnabled ? 'Disable (bypass)' : 'Enable'}
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
        >
          <Power className="w-3.5 h-3.5" />
        </button>
      )}
      {showDelete && (
        <button
          type="button"
          className={cn(btnClass, 'hover:text-destructive')}
          title="Delete node"
          onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
});

function PipelineNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as PipelineNodeData;

  const [isHovering, setIsHovering] = useState(false);
  const hoverLeaveTimerRef = useRef<number | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hoverLeaveTimerRef.current != null) {
      window.clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    setIsHovering(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hoverLeaveTimerRef.current = window.setTimeout(() => {
      setIsHovering(false);
      hoverLeaveTimerRef.current = null;
    }, 150);
  }, []);

  useEffect(() => () => {
    if (hoverLeaveTimerRef.current != null) window.clearTimeout(hoverLeaveTimerRef.current);
  }, []);

  const { kind, sarStage, inputLevel, status, order, durationMs, errorMessage, editable, isLeaf, enabledTasks, onDelete, onAddAfter, onTrigger, onExecuteStep, warningReason, enabled, onToggleActive, onReprocess, isJobMode } = nodeData;

  const isEnabled = enabled !== false;
  const isSelected = !!selected;

  const isTrigger = kind === 'TRIGGER';
  const isFileInput = kind === 'FILE_INPUT';
  const isEntryNode = isTrigger || isFileInput;
  const isJobInit = kind === 'JOB_INIT';
  const isCatalog = kind === 'CATALOG';
  const kindToneEntry = kind ? KIND_TONE[kind] : undefined;
  const kindToneColor = kindToneEntry?.hex;
  const neutralFilled = isNeutralFilledKind(kind);
  const neutralVisible = neutralFilled
    && isEnabled
    && status !== 'FAILED'
    && status !== 'CANCELED'
    && !(isJobMode && status === 'PENDING');
  const kindToneRgb = neutralFilled ? NEUTRAL_FILL_RGB : (kindToneEntry?.rgb ?? DEFAULT_TONE_RGB);
  const kindToneActive = Boolean(
    kindToneColor
      && isEnabled
      && status !== 'FAILED'
      && status !== 'CANCELED'
      && !(isJobMode && status === 'PENDING')
      && !isSelected,
  );
  const kindToneBorderColor = kindToneActive && kindToneColor
    ? hexToRgba(kindToneColor, status === 'PENDING' ? 0.4 : 1)
    : undefined;
  const kindToneGlow = kindToneActive && kindToneColor
    ? (status === 'RUNNING'
        ? `0 0 20px ${hexToRgba(kindToneColor, 0.35)}`
        : status === 'COMPLETED'
          ? `0 0 16px ${hexToRgba(kindToneColor, 0.25)}`
          : `0 0 12px ${hexToRgba(kindToneColor, 0.18)}`)
    : undefined;
  const kindToneIconStyle: React.CSSProperties | undefined = kindToneActive && kindToneColor
    ? { color: kindToneColor }
    : undefined;
  const kindToneSelectedGlow = kindToneEntry && isSelected && isEnabled && status !== 'FAILED'
    ? `0 0 0 2px rgba(${kindToneRgb}, 0.6), 0 0 32px rgba(${kindToneRgb}, 0.5)`
    : undefined;
  const kindToneSelectedBorder = kindToneEntry && isSelected && isEnabled && status !== 'FAILED'
    ? `rgba(${kindToneRgb}, 0.8)`
    : undefined;
  const neutralIconStyle: React.CSSProperties | undefined = neutralVisible
    ? { color: NEUTRAL_ICON_COLOR }
    : undefined;
  const isThumbnail = kind === 'THUMBNAIL';
  const isSAR = kind === 'SAR';

  let CscIcon: React.ElementType;
  if (isTrigger) {
    CscIcon = Antenna;
  } else if (isFileInput) {
    CscIcon = FileInput;
  } else if (isJobInit) {
    CscIcon = SlidersHorizontal;
  } else if (isCatalog) {
    CscIcon = Database;
  } else if (isThumbnail) {
    CscIcon = ImageIcon;
  } else if (isSAR && sarStage) {
    CscIcon = SAR_ICON_CONFIG[sarStage].icon;
  } else {
    CscIcon = HardDrive;
  }

  let label: string;
  let subLabel: string;
  if (isTrigger) {
    label = 'Raw data received trigger';
    subLabel = 'EI-01 · RAW_DATA_RECEIVED';
  } else if (isFileInput) {
    const levelStr = inputLevel === 'LEVEL_0' ? 'L0' : inputLevel === 'LEVEL_1' ? 'L1' : inputLevel === 'LEVEL_2' ? 'L2' : 'L?';
    label = `${levelStr} result input`;
    subLabel = 'SI-07 · Partial reprocessing';
  } else if (isJobInit) {
    label = 'Job initialization';
    subLabel = 'CSU-08.02 · Profile selection';
  } else if (isCatalog) {
    label = 'Catalog registration';
    subLabel = 'CSC-07 · Register';
  } else if (isThumbnail) {
    label = 'Quick-look generation';
    subLabel = 'CSU-07.06 · Early preview';
  } else if (isSAR && sarStage) {
    label = SAR_STAGE_LABELS[sarStage];
    subLabel = `${sarStage} · ${PRODUCT_LEVEL_LABELS[SAR_STAGE_TO_LEVEL[sarStage]]}`;
  } else {
    label = 'Unknown';
    subLabel = '—';
  }

  const allTasks = isSAR && sarStage ? SAR_STAGE_TASKS[sarStage] : [];
  const activeTasks = enabledTasks ?? allTasks;
  const taskCount = allTasks.length;
  const activeTaskCount = activeTasks.length;
  const hasPartialTasks = taskCount > 0 && activeTaskCount < taskCount;

  const statusInd = STATUS_INDICATOR[status];
  const StatusIcon = statusInd.icon;
  const showStatusBadge = status !== 'PENDING' && status !== 'CANCELED';

  const showTargetHandle = !isEntryNode;
  const showDeleteButton = !isEntryNode && !!editable && !!onDelete;

  // 진입 노드(TRIGGER/FILE_INPUT) 좌측 파이프라인 실행 버튼
  const showTriggerButton = isEntryNode && !!onTrigger;
  // 노드 위 툴바: editable 노드 전체에 표시
  const showToolbar = !!editable;
  const showNodeWarning = !!warningReason;
  const leafAddAffordance = Boolean(isLeaf && editable && onAddAfter);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onExecuteStep?.(order);
  }, [onExecuteStep, order]);

  return (
    <div className="relative flex items-start group" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onDoubleClick={handleDoubleClick}>
      {/* 파이프라인 실행 버튼 — 진입 노드 좌측에 고정 (n8n 스타일) */}
      {showTriggerButton && (
        <div
          className="absolute right-full mr-4 nodrag z-20 flex items-center"
          style={{ top: NODE_SIZE / 2, transform: 'translateY(-50%)' }}
        >
          {/* Idle: small zap icon */}
          <div className="node-trigger-zap absolute right-0 flex items-center justify-center w-5 h-5">
            <Zap className="w-4 h-4 text-accent" fill="currentColor" />
          </div>
          {/* Hover: full execute button */}
          <button
            onClick={(e) => { e.stopPropagation(); onTrigger!(); }}
            className={cn(
              'node-trigger-btn flex items-center gap-2 pl-2.5 pr-3.5 py-2 rounded-lg text-[11px] font-semibold shadow-lg whitespace-nowrap',
              'bg-accent text-accent-foreground cursor-pointer hover:brightness-110 active:brightness-95',
            )}
            title="Run the pipeline (check job initialization node for configuration warnings)"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            Run pipeline
          </button>
        </div>
      )}

      <div className="flex flex-col items-center">
        {/* Icon box wrapper */}
        <div className="relative">
          {/* n8n 스타일 호버 툴바 — 노드 위에 표시 (개별 노드 액션) */}
          {showToolbar && (
            <NodeHoverToolbar
              showDelete={showDeleteButton}
              onDelete={onDelete ? () => onDelete(order) : undefined}
              onExecute={onExecuteStep ? () => onExecuteStep(order) : undefined}
              isVisible={isHovering || isSelected}
              isEntryNode={isEntryNode}
              isEnabled={isEnabled}
              onToggle={onToggleActive ? () => onToggleActive(order) : undefined}
              onReprocess={onReprocess ? () => onReprocess(order) : undefined}
            />
          )}

          <div
            className={cn(
              'node-icon-box relative rounded-xl border-2 flex items-center justify-center',
              !isEnabled
                ? 'border-dashed border-muted-foreground/30 node-bypassed'
                : isSelected
                  ? (status === 'FAILED' ? 'border-destructive/80' : 'border-accent/80')
                  : (isJobMode && status === 'PENDING') ? JOB_PENDING_BORDER : STATUS_BORDER[status],
              'bg-card',
              status === 'FAILED' && isEnabled && 'node-failed',
              status === 'CANCELED' && 'opacity-40',
              leafAddAffordance && 'cursor-pointer',
              editable && !isEntryNode && !leafAddAffordance && 'cursor-grab active:cursor-grabbing',
              status === 'RUNNING' && isEnabled && 'animate-status-pulse',
            )}
            style={{
              width: NODE_SIZE,
              height: NODE_SIZE,
              '--node-tone-rgb': kindToneRgb,
              backgroundColor: neutralVisible ? NEUTRAL_FILL_BG : undefined,
              borderColor: neutralVisible
                ? NEUTRAL_FILL_BG
                : (kindToneSelectedBorder ?? kindToneBorderColor),
              boxShadow: !isEnabled
                ? 'none'
                : isSelected
                  ? (status === 'FAILED'
                    ? '0 0 0 2px rgba(239, 68, 68, 0.6), 0 0 32px rgba(239, 68, 68, 0.5)'
                    : kindToneSelectedGlow ?? '0 0 0 2px rgba(52, 211, 153, 0.6), 0 0 32px rgba(52, 211, 153, 0.5)')
                  : neutralVisible
                    ? `0 0 12px rgba(${NEUTRAL_FILL_RGB}, 0.18)`
                    : kindToneGlow ?? ((isJobMode && status === 'PENDING') ? JOB_PENDING_GLOW : STATUS_GLOW[status]),
            } as React.CSSProperties}
          >
            <div className="node-hover-overlay" style={isSelected && isEnabled ? { opacity: 1 } : undefined} />
            {showNodeWarning && warningReason && (
              <NodeWarningHint text={warningReason} />
            )}
            {showStatusBadge && (
              <div className="absolute -top-3 -left-3 z-10">
                <StatusIcon
                  className={cn(
                    'w-4 h-4',
                    statusInd.color,
                    status === 'RUNNING' && 'animate-spin',
                  )}
                />
              </div>
            )}

            {showTargetHandle && (
              <Handle
                type="target"
                position={Position.Left}
                className={cn(
                  '!w-3 !h-3 !border-2 !border-card !-left-1.5 hover:!scale-125 !transition-all',
                  status === 'FAILED' ? '!bg-destructive/50 hover:!bg-destructive' : '!bg-accent/50 hover:!bg-accent',
                )}
                style={kindToneColor && status !== 'FAILED' ? { background: hexToRgba(kindToneColor, 0.5) } : undefined}
              />
            )}

            <CscIcon
              className={cn('w-7 h-7', !isEnabled ? 'text-muted-foreground/40' : status === 'FAILED' ? 'text-destructive' : status === 'CANCELED' || (isJobMode && status === 'PENDING') ? 'text-muted-foreground/40' : 'text-accent')}
              style={neutralIconStyle ?? kindToneIconStyle}
            />

            <Handle
              type="source"
              position={Position.Right}
              className={cn(
                '!w-3 !h-3 !border-2 !border-card !-right-1.5 hover:!scale-125 !transition-all source-handle-wide',
                status === 'FAILED'
                  ? '!bg-destructive/50'
                  : isLeaf && editable ? '!bg-accent !opacity-100' : '!bg-accent/50',
              )}
              style={kindToneColor && status !== 'FAILED' ? { background: hexToRgba(kindToneColor, isLeaf && editable ? 1 : 0.5) } : undefined}
            />
          </div>

          {/* Leaf node: trailing line + add button */}
          {isLeaf && editable && onAddAfter && (
            <div
              className="absolute left-full top-1/2 -translate-y-1/2 flex items-center nodrag z-10 cursor-pointer"
              style={{ marginLeft: 8 }}
            >
              <svg width="52" height="2" className="shrink-0 pointer-events-none">
                <line x1="0" y1="1" x2="52" y2="1" stroke="var(--accent)" strokeWidth="2" style={{ opacity: 0.4 }} />
              </svg>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAddAfter(order); }}
                className="w-7 h-7 rounded-full bg-card border-2 border-border flex items-center justify-center hover:border-accent hover:bg-accent/10 transition-all shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>

        {/* Label below — n8n style */}
        <div className="mt-2 text-center max-w-[130px]">
          <div className={cn('text-[11px] font-semibold leading-tight', !isEnabled || status === 'CANCELED' || (isJobMode && status === 'PENDING') ? 'text-muted-foreground/50' : 'text-foreground')}>{label}</div>
          <div className="text-[10px] text-muted-foreground">{subLabel}</div>
          {!isEnabled && (
            <div className="text-[9px] font-semibold text-muted-foreground/50 mt-0.5 tracking-wide uppercase">Bypassed</div>
          )}
          {taskCount > 0 && isEnabled && (
            <div className={`text-[9px] ${hasPartialTasks ? 'text-accent font-semibold' : 'text-muted-foreground/60'}`}>
              {hasPartialTasks ? `${activeTaskCount}/${taskCount} tasks` : `${taskCount} tasks`}
            </div>
          )}
          {durationMs !== undefined && (
            <div className="text-[9px] text-success font-mono">{formatDuration(durationMs)}</div>
          )}
          {errorMessage && (
            <div className="text-[9px] text-destructive truncate" title={errorMessage}>{errorMessage}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export const PipelineNode = memo(PipelineNodeComponent);
