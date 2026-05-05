'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  GitBranch,
  Loader2,
  Plus,
  Power,
  ServerCog,
  X,
  Zap,
} from 'lucide-react';
import LeftSidebar from '@/components/panels/LeftSidebar';
import PipelineExecutionTabs from '@/components/panels/PipelineExecutionTabs';
import ExecutionLogPanel from '@/components/panels/ExecutionLogPanel';
import { useMockRole } from '@/components/auth/RolePreviewSelect';
import { toast } from '@/components/ui/Toast';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import type {
  ExecutionLog,
  JobSummary,
  PipelineActivationRule,
  PipelineDefinition,
  PipelineEventType,
  PipelineStep,
  PipelineStepDefinition,
  ProductLevel,
  SavePipelineActivationRuleData,
  TriggerSource,
} from '@/types/pipeline';
import {
  PGMQ_EVENT_TBD_QUEUE,
  PIPELINE_EVENT_SOURCE_QUEUE,
  PIPELINE_EVENT_TYPE_LABELS,
  POLARIZATION_OPTIONS,
  PRODUCT_LEVEL_LABELS,
  SATELLITE_OPTIONS,
  MODE_OPTIONS,
  SAR_STAGE_TO_CSC,
  SAR_STAGE_TO_LEVEL,
  TRIGGER_SOURCE_LABELS,
} from '@/types/pipeline';

const CanvasGraph = dynamic(() => import('@/components/graph/CanvasGraph'), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 items-center justify-center rounded-lg border border-border bg-background/50 text-sm text-muted-foreground">
      Loading pipeline UI...
    </div>
  ),
});

const MAPPING_CONTENT_MIN_WIDTH = 1180;
const MAPPING_GROUP_GRID = '260px 84px minmax(0,1fr)';
const MAPPING_RULE_GRID = 'minmax(0,1fr) 280px 132px 96px';
const EVENT_TYPE_OPTIONS: PipelineEventType[] = ['RAW_DATA_RECEIVED', 'PARTIAL_REPROCESS_REQUESTED', 'PRODUCT_REPROCESS_REQUESTED'];
const EVENT_TYPE_GROUP_ORDER: PipelineEventType[] = ['RAW_DATA_RECEIVED', 'PARTIAL_REPROCESS_REQUESTED', 'PRODUCT_REPROCESS_REQUESTED'];
const PRODUCT_LEVEL_OPTIONS: ProductLevel[] = ['LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];

type EventTone = { fg: string; bg: string; soft: string; border: string };
// 모든 이벤트 채널을 하나의 파랑 톤으로 통일 — 채널을 색으로 구분하지 않고 라벨로 구분.
// 컬러 노이즈 최소화 + JOB_INIT 노드와 동일 톤이라 "외부 입력 → 설정 단계" 흐름이 자연스럽게 읽힘.
const EVENT_TONE_BASE: EventTone = {
  fg: '#029FE7',
  bg: 'rgba(2,159,231,0.10)',
  soft: 'rgba(2,159,231,0.18)',
  border: 'rgba(2,159,231,0.40)',
};
const EVENT_TONE: Record<PipelineEventType, EventTone> = {
  RAW_DATA_RECEIVED:           EVENT_TONE_BASE,
  PARTIAL_REPROCESS_REQUESTED: EVENT_TONE_BASE,
  PRODUCT_REPROCESS_REQUESTED: EVENT_TONE_BASE,
};

const PIPELINE_NODE_COLOR_NEUTRAL = '#737373';
const PIPELINE_NODE_COLOR_PROCESS = '#22C55E';
const PIPELINE_NODE_COLOR_CONFIG  = '#029FE7';

function isNeutralKind(kind: PipelineStepDefinition['kind']): boolean {
  return kind === 'TRIGGER' || kind === 'FILE_INPUT' || kind === 'CATALOG';
}

/** 미니 스트립 배경 채움 강도 위계: NEUTRAL(시작/종료) > JOB_INIT(설정) > 처리(SAR/THUMBNAIL) */
function miniStripFillOpacity(kind: PipelineStepDefinition['kind']): number {
  if (isNeutralKind(kind)) return 1;
  if (kind === 'JOB_INIT') return 0.55;
  return 0.18;
}

function miniStripStrokeOpacity(kind: PipelineStepDefinition['kind']): number {
  if (isNeutralKind(kind)) return 1;
  if (kind === 'JOB_INIT') return 0.85;
  return 0.4;
}

function colorForStep(step: PipelineStepDefinition): string {
  switch (step.kind) {
    case 'TRIGGER':
    case 'FILE_INPUT':
    case 'CATALOG':
      return PIPELINE_NODE_COLOR_NEUTRAL;
    case 'JOB_INIT':
      return PIPELINE_NODE_COLOR_CONFIG;
    default:
      return PIPELINE_NODE_COLOR_PROCESS;
  }
}

function buildPipelineLegend(pipeline: PipelineDefinition): { color: string; label: string }[] {
  const hasNeutral  = pipeline.steps.some((s) => s.kind === 'TRIGGER' || s.kind === 'FILE_INPUT' || s.kind === 'CATALOG');
  const hasConfig   = pipeline.steps.some((s) => s.kind === 'JOB_INIT');
  const hasProcess  = pipeline.steps.some((s) => s.kind !== 'TRIGGER' && s.kind !== 'FILE_INPUT' && s.kind !== 'CATALOG' && s.kind !== 'JOB_INIT');
  const out: { color: string; label: string }[] = [];
  if (hasNeutral) out.push({ color: PIPELINE_NODE_COLOR_NEUTRAL, label: 'Trigger / Input / Catalog' });
  if (hasConfig)  out.push({ color: PIPELINE_NODE_COLOR_CONFIG,  label: 'Configuration' });
  if (hasProcess) out.push({ color: PIPELINE_NODE_COLOR_PROCESS, label: 'Processing'  });
  return out;
}

const TRIGGER_TONE: Record<TriggerSource, { fg: string; bg: string; border: string }> = {
  PIPELINE_AUTO:     { fg: '#0288c8', bg: 'rgba(2,159,231,0.08)',  border: 'rgba(2,159,231,0.35)'  },
  MANUAL_REQUEST:    { fg: '#7b3fe6', bg: 'rgba(142,81,255,0.08)', border: 'rgba(142,81,255,0.35)' },
  PARTIAL_REPROCESS: { fg: '#04B58B', bg: 'rgba(4,181,139,0.08)',  border: 'rgba(4,181,139,0.35)'  },
};

function isBranchedPipeline(pipeline: PipelineDefinition | undefined | null): boolean {
  if (!pipeline) return false;
  const out = new Map<number, number>();
  pipeline.edges.forEach((e) => out.set(e.source, (out.get(e.source) ?? 0) + 1));
  for (const c of out.values()) if (c > 1) return true;
  return false;
}

function MiniPipelineStrip({ pipeline }: { pipeline: PipelineDefinition }) {
  const layout = useMemo(() => {
    const incoming = new Map<number, number[]>();
    pipeline.steps.forEach((s) => incoming.set(s.order, []));
    pipeline.edges.forEach((e) => {
      if (incoming.has(e.target)) incoming.get(e.target)!.push(e.source);
    });
    const sorted = [...pipeline.steps].sort((a, b) => a.order - b.order);
    const col = new Map<number, number>();
    for (const s of sorted) {
      const ins = incoming.get(s.order) ?? [];
      let c = 0;
      ins.forEach((p) => { c = Math.max(c, (col.get(p) ?? 0) + 1); });
      col.set(s.order, c);
    }
    const byCol = new Map<number, number[]>();
    sorted.forEach((s) => {
      const c = col.get(s.order) ?? 0;
      const arr = byCol.get(c) ?? [];
      arr.push(s.order);
      byCol.set(c, arr);
    });
    const row = new Map<number, number>();
    let maxRows = 1;
    byCol.forEach((arr) => {
      arr.forEach((order, idx) => row.set(order, idx));
      maxRows = Math.max(maxRows, arr.length);
    });
    const cols = (col.size === 0 ? 1 : Math.max(...col.values()) + 1);
    return { col, row, cols, rows: maxRows };
  }, [pipeline]);

  const nodeSize = 16;
  const colW = 22;
  const rowH = 20;
  const padX = 3, padY = 3;
  const w = padX * 2 + Math.max(0, layout.cols - 1) * colW + nodeSize;
  const h = padY * 2 + Math.max(0, layout.rows - 1) * rowH + nodeSize;
  const cx = (order: number) => padX + (layout.col.get(order) ?? 0) * colW + nodeSize / 2;
  const cy = (order: number) => padY + (layout.row.get(order) ?? 0) * rowH + nodeSize / 2;

  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      {pipeline.edges.map((e, i) => {
        const ax = cx(e.source) + nodeSize / 2 - 1;
        const ay = cy(e.source);
        const bx = cx(e.target) - nodeSize / 2 + 1;
        const by = cy(e.target);
        const mx = (ax + bx) / 2;
        return (
          <path
            key={i}
            d={`M${ax},${ay} C${mx},${ay} ${mx},${by} ${bx},${by}`}
            fill="none"
            stroke="#cfd6e0"
            strokeWidth={1.1}
          />
        );
      })}
      {pipeline.steps.map((s) => {
        const c = colorForStep(s);
        const x = cx(s.order) - nodeSize / 2;
        const y = cy(s.order) - nodeSize / 2;
        return (
          <rect
            key={s.order}
            x={x}
            y={y}
            width={nodeSize}
            height={nodeSize}
            rx={4}
            fill={c}
            fillOpacity={miniStripFillOpacity(s.kind)}
            stroke={c}
            strokeWidth={1}
            strokeOpacity={miniStripStrokeOpacity(s.kind)}
          />
        );
      })}
    </svg>
  );
}

type ThreadPath = { d: string; active: boolean };

function RuleRow({
  rule,
  pipeline,
  isFirst,
  expanded,
  tone,
  eventType,
  hasActiveDuplicate,
  duplicateActiveRule,
  canManage,
  savingPipelineId,
  onRowClick,
  onToggleActive,
  onRequestSwap,
  onOpenPipeline,
}: {
  rule: PipelineActivationRule;
  pipeline: PipelineDefinition | undefined;
  isFirst: boolean;
  expanded: boolean;
  tone: EventTone;
  eventType: PipelineEventType;
  hasActiveDuplicate: boolean;
  duplicateActiveRule: PipelineActivationRule | null;
  canManage: boolean;
  savingPipelineId: string | null;
  onRowClick: (rule: PipelineActivationRule) => void;
  onToggleActive: (rule: PipelineActivationRule) => void;
  onRequestSwap: (from: PipelineActivationRule, to: PipelineActivationRule) => void;
  onOpenPipeline: (pipelineId: string) => void;
}) {
  const conditions = ruleConditions(rule);
  const branched = isBranchedPipeline(pipeline);
  const triggerTone = TRIGGER_TONE[rule.triggerSource];
  const previewSteps = pipeline ? toPreviewSteps(pipeline) : [];

  const [renderExpanded, setRenderExpanded] = useState(expanded);
  if (expanded && !renderExpanded) {
    setRenderExpanded(true);
  }
  useEffect(() => {
    if (expanded) return;
    const t = window.setTimeout(() => setRenderExpanded(false), 320);
    return () => window.clearTimeout(t);
  }, [expanded]);

  const swapMode = !rule.active && expanded && hasActiveDuplicate && Boolean(duplicateActiveRule);
  const activateDisabled = savingPipelineId === rule.pipelineId || (hasActiveDuplicate && !expanded);

  return (
    <div
      className={`group relative transition-opacity duration-300 ease-out ${isFirst ? '' : 'border-t border-border/60'} ${
        expanded ? 'bg-accent/[0.04]' : ''
      } ${rule.active ? '' : 'opacity-55 hover:opacity-100'}`}
    >
      <div
        onClick={() => onRowClick(rule)}
        className="grid cursor-pointer items-center gap-3 px-3 py-3 pr-4 transition-colors hover:bg-muted/30"
        style={{ gridTemplateColumns: MAPPING_RULE_GRID }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className={`inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold ${
            rule.active ? 'text-success' : 'text-muted-foreground'
          }`}>
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={
                rule.active
                  ? { background: '#04B58B', boxShadow: '0 0 0 3px rgba(4,181,139,.18)' }
                  : { background: '#c7cdd6' }
              }
            />
            {rule.active ? 'Active' : 'Inactive'}
          </span>
          <svg
            width={14}
            height={10}
            viewBox="0 0 14 10"
            className="shrink-0"
            style={{ color: tone.fg, opacity: rule.active ? 0.85 : 0.45 }}
          >
            <path
              d="M0 5h11M9 1l4 4-4 4"
              stroke="currentColor"
              strokeWidth={1.4}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {conditions.length === 0 ? (
              <span className="rounded bg-muted/55 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                All conditions
              </span>
            ) : conditions.map((c) => (
              <span
                key={c}
                className="max-w-[110px] truncate rounded bg-muted/55 px-1.5 py-0.5 text-[10px] text-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div
          data-tgt
          data-active={rule.active ? '1' : '0'}
          className={`flex flex-col gap-1.5 rounded-lg border bg-card px-2.5 py-2 transition-colors ${
            expanded ? 'border-accent/45 shadow-sm' : 'border-border'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[12px] font-semibold text-foreground">
                {pipeline?.name ?? rule.pipelineId}
              </span>
              {branched && (
                <span
                  className="rounded px-1 py-px font-mono text-[8.5px] font-bold tracking-wider"
                  style={{ color: '#8E51FF', background: 'rgba(142,81,255,0.12)' }}
                  title="Branched pipeline"
                >
                  BRANCHED
                </span>
              )}
            </div>
            <ChevronDown
              className="h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-300 ease-out"
              style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
            />
          </div>
          {pipeline && <MiniPipelineStrip pipeline={pipeline} />}
        </div>

        <div className="min-w-0">
          <span
            className="inline-flex max-w-full items-center truncate rounded-full border border-dashed px-2 py-0.5 font-mono text-[10px]"
            style={{
              color: triggerTone.fg,
              background: triggerTone.bg,
              borderColor: triggerTone.border,
            }}
          >
            {TRIGGER_SOURCE_LABELS[rule.triggerSource]}
          </span>
        </div>

        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          {canManage && (
            <button
              type="button"
              disabled={activateDisabled}
              title={hasActiveDuplicate && !expanded ? 'Another active rule already exists for this event · queue. Expand the row to swap.' : undefined}
              onClick={() => {
                if (swapMode && duplicateActiveRule) {
                  onRequestSwap(duplicateActiveRule, rule);
                } else {
                  onToggleActive(rule);
                }
              }}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                rule.active
                  ? 'border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                  : 'border-accent/35 bg-accent/10 text-accent hover:bg-accent/20'
              }`}
            >
              {rule.active ? 'Deactivate' : 'Activate'}
            </button>
          )}
        </div>
      </div>

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
        aria-hidden={!expanded}
      >
        <div className="min-h-0 overflow-hidden">
          {renderExpanded && pipeline && (
            <div
              className="border-t border-dashed border-border/70 bg-card/50 px-4 py-4 transition-opacity duration-300 ease-out"
              style={{ opacity: expanded ? 1 : 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{pipeline.name}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    triggered by{' '}
                    <b style={{ color: tone.fg }}>{PIPELINE_EVENT_TYPE_LABELS[eventType]}</b>
                    {rule.match.satelliteIds?.length ? (
                      <> when satellite is <b className="text-foreground">{rule.match.satelliteIds.join(', ')}</b></>
                    ) : null}
                    {rule.match.inputLevel ? (
                      <> · level <b className="text-foreground">{PRODUCT_LEVEL_LABELS[rule.match.inputLevel]}</b></>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenPipeline(pipeline.id)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/40"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open pipeline
                </button>
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10.5px] text-muted-foreground">
                <span className="font-mono uppercase tracking-wider opacity-70">Node colors</span>
                {buildPipelineLegend(pipeline).map((item) => (
                  <span key={item.color} className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ background: item.color, opacity: 0.85 }}
                    />
                    <span className="text-foreground/80">{item.label}</span>
                  </span>
                ))}
              </div>
              <div className="deployed-preview-flow h-64 overflow-hidden rounded-lg border border-border bg-card">
                <CanvasGraph
                  pipelineId={`deployed-preview-${pipeline.id}`}
                  steps={previewSteps}
                  pipelineEdges={pipeline.edges}
                  editable={false}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EventGroupCard({
  eventType,
  rules,
  pipelineById,
  expandedRuleId,
  canManage,
  savingPipelineId,
  rulesAll,
  onRowClick,
  onToggleActive,
  onRequestSwap,
  onOpenPipeline,
}: {
  eventType: PipelineEventType;
  rules: PipelineActivationRule[];
  pipelineById: Map<string, PipelineDefinition>;
  expandedRuleId: string | null;
  canManage: boolean;
  savingPipelineId: string | null;
  rulesAll: PipelineActivationRule[];
  onRowClick: (rule: PipelineActivationRule) => void;
  onToggleActive: (rule: PipelineActivationRule) => void;
  onRequestSwap: (from: PipelineActivationRule, to: PipelineActivationRule) => void;
  onOpenPipeline: (pipelineId: string) => void;
}) {
  const tone = EVENT_TONE[eventType];
  const queues = Array.from(new Set(rules.map((r) => r.sourceQueue)));
  const activeCount = rules.filter((r) => r.active).length;
  const total = rules.length;
  const fanRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<ThreadPath[]>([]);

  useLayoutEffect(() => {
    const recalc = () => {
      const root = fanRef.current;
      if (!root) return;
      const src = root.querySelector('[data-src]') as HTMLElement | null;
      const targets = root.querySelectorAll<HTMLElement>('[data-tgt]');
      if (!src || targets.length === 0) {
        setPaths([]);
        return;
      }
      const rR = root.getBoundingClientRect();
      const sR = src.getBoundingClientRect();
      const sx = sR.right - rR.left;
      const sy = sR.top + sR.height / 2 - rR.top;
      const next: ThreadPath[] = [];
      targets.forEach((t) => {
        const tR = t.getBoundingClientRect();
        const tx = tR.left - rR.left;
        const ty = tR.top + tR.height / 2 - rR.top;
        const dx = (tx - sx) * 0.55;
        next.push({
          d: `M${sx},${sy} C${sx + dx},${sy} ${tx - dx},${ty} ${tx},${ty}`,
          active: t.dataset.active === '1',
        });
      });
      setPaths(next);
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    if (fanRef.current) ro.observe(fanRef.current);
    window.addEventListener('resize', recalc);
    const t = window.setTimeout(recalc, 80);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recalc);
      window.clearTimeout(t);
    };
  }, [rules.length, expandedRuleId]);

  return (
    <div
      className="mb-4 overflow-hidden rounded-xl border border-border bg-card"
      style={{ boxShadow: '0 1px 2px -1px rgba(12,30,51,.08)' }}
    >
      <div className="flex items-center gap-3 border-b border-border/60 bg-muted/20 px-4 py-2.5">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: tone.fg, boxShadow: `0 0 0 4px ${tone.soft}` }}
        />
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            {PIPELINE_EVENT_TYPE_LABELS[eventType]}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
            <span>queue ·</span>
            {queues.map((q) => (
              <span key={q} className="rounded bg-background/70 px-1.5 py-0.5">{q}</span>
            ))}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4 text-[11px] text-muted-foreground">
          <span>
            <b className="font-mono font-semibold text-foreground" style={{ color: tone.fg }}>{activeCount}</b>
            <span className="opacity-70">/{total} active</span>
          </span>
          <span>
            <b className="font-mono font-semibold text-foreground">{total}</b>
            <span className="opacity-70"> rules</span>
          </span>
        </div>
      </div>

      <div
        ref={fanRef}
        className="relative grid items-stretch"
        style={{ gridTemplateColumns: MAPPING_GROUP_GRID, minHeight: 100 }}
      >
        <div className="flex items-center justify-center border-r border-dashed border-border bg-muted/10 p-3">
          <div
            data-src
            className="flex w-full flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5"
            style={{ borderColor: tone.border }}
          >
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-md"
                style={{ background: tone.bg, color: tone.fg }}
              >
                <Zap className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="whitespace-nowrap text-[12px] font-semibold leading-tight text-foreground">
                  {PIPELINE_EVENT_TYPE_LABELS[eventType]}
                </div>
              </div>
            </div>
            <div className="font-mono text-[10px] leading-tight text-muted-foreground">
              {queues.length === 1 ? queues[0] : `${queues.length} queues`}
            </div>
            <div
              className="flex items-center justify-between border-t border-dashed pt-1.5 font-mono text-[10px]"
              style={{ borderColor: tone.border, color: tone.fg }}
            >
              <span>fan-out</span>
              <span>→ {total} routes</span>
            </div>
          </div>
        </div>

        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        >
          {paths.map((p, i) => (
            <path
              key={i}
              d={p.d}
              fill="none"
              stroke={p.active ? tone.fg : '#cfd6e0'}
              strokeWidth={p.active ? 1.6 : 1.1}
              strokeDasharray={p.active ? '0' : '3 3'}
              opacity={p.active ? 0.85 : 0.5}
            />
          ))}
        </svg>

        <div />

        <div className="flex flex-col">
          {rules.map((rule, idx) => {
            const duplicateActiveRule = !rule.active
              ? rulesAll.find((other) => (
                  other.active
                    && other.id !== rule.id
                    && ruleEventQueueKey(other) === ruleEventQueueKey(rule)
                )) ?? null
              : null;
            return (
              <RuleRow
                key={rule.id}
                rule={rule}
                pipeline={pipelineById.get(rule.pipelineId)}
                isFirst={idx === 0}
                expanded={expandedRuleId === rule.id}
                tone={tone}
                eventType={eventType}
                hasActiveDuplicate={Boolean(duplicateActiveRule)}
                duplicateActiveRule={duplicateActiveRule}
                canManage={canManage}
                savingPipelineId={savingPipelineId}
                onRowClick={onRowClick}
                onToggleActive={onToggleActive}
                onRequestSwap={onRequestSwap}
                onOpenPipeline={onOpenPipeline}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

type RuleFormState = {
  id: string | null;
  pipelineId: string;
  active: boolean;
  eventType: PipelineEventType;
  sourceQueue: string;
  satelliteId: string;
  mode: string;
  polarization: string;
  inputLevel: ProductLevel | '';
  triggerSource: TriggerSource;
  description: string;
};

function makeEmptyRuleForm(): RuleFormState {
  const eventType: PipelineEventType = 'RAW_DATA_RECEIVED';
  return {
    id: null,
    pipelineId: '',
    active: true,
    eventType,
    sourceQueue: PIPELINE_EVENT_SOURCE_QUEUE[eventType],
    satelliteId: '',
    mode: '',
    polarization: '',
    inputLevel: '',
    triggerSource: 'PIPELINE_AUTO',
    description: 'Automatically runs the selected pipeline when an incoming pgmq event matches the conditions.',
  };
}

function ruleToForm(rule: PipelineActivationRule): RuleFormState {
  return {
    id: rule.id,
    pipelineId: rule.pipelineId,
    active: rule.active,
    eventType: rule.eventType,
    sourceQueue: PIPELINE_EVENT_SOURCE_QUEUE[rule.eventType],
    satelliteId: rule.match.satelliteIds?.[0] ?? '',
    mode: rule.match.modes?.[0] ?? '',
    polarization: rule.match.polarizations?.[0] ?? '',
    inputLevel: rule.match.inputLevel ?? '',
    triggerSource: rule.triggerSource,
    description: rule.description,
  };
}

function ruleConditions(rule: PipelineActivationRule): string[] {
  return [
    ...(rule.match.satelliteIds ?? []),
    ...(rule.match.modes ?? []),
    ...(rule.match.polarizations ?? []),
    rule.match.inputLevel ? PRODUCT_LEVEL_LABELS[rule.match.inputLevel] : undefined,
  ].filter((condition): condition is string => typeof condition === 'string' && condition.length > 0);
}

function eventQueueKey(sourceQueue: string, eventType: PipelineEventType): string {
  return `${sourceQueue}|${eventType}`;
}

function ruleEventQueueKey(rule: PipelineActivationRule): string {
  return eventQueueKey(rule.sourceQueue, rule.eventType);
}

function formEventQueueKey(form: RuleFormState): string {
  return eventQueueKey(form.sourceQueue, form.eventType);
}

function toPreviewSteps(pipeline: PipelineDefinition): PipelineStep[] {
  return pipeline.steps.map((step) => ({
    order: step.order,
    kind: step.kind,
    sarStage: step.sarStage,
    inputLevel: step.inputLevel,
    targetCsc: step.kind === 'SAR' && step.sarStage
      ? SAR_STAGE_TO_CSC[step.sarStage]
      : step.kind === 'JOB_INIT'
        ? 'CSC-08'
        : step.kind === 'CATALOG' || step.kind === 'THUMBNAIL'
          ? 'CSC-07'
          : 'CSC-02',
    productLevel: step.kind === 'SAR' && step.sarStage
      ? SAR_STAGE_TO_LEVEL[step.sarStage]
      : step.inputLevel ?? 'LEVEL_0',
    status: 'PENDING',
    enabledTasks: step.enabledTasks,
  }));
}

function BadgeButton({
  active,
  children,
  disabled,
  onClick,
  title,
}: {
  active: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? 'border-accent/40 bg-accent/15 text-accent'
          : 'border-border bg-background text-muted-foreground hover:bg-muted/45 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

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
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(() => makeEmptyRuleForm());
  const [savingPipelineId, setSavingPipelineId] = useState<string | null>(null);
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [toggleConfirmRule, setToggleConfirmRule] = useState<PipelineActivationRule | null>(null);
  const [swapConfirm, setSwapConfirm] = useState<{ from: PipelineActivationRule; to: PipelineActivationRule } | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [automating, setAutomating] = useState(false);
  const [logPanelOpen, setLogPanelOpen] = useState(false);

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

  const deployedRules = useMemo(() => rules.filter((rule) => rule.active), [rules]);
  const matchingRules = useMemo(
    () => [...rules].sort((a, b) => Number(b.active) - Number(a.active) || a.sourceQueue.localeCompare(b.sourceQueue)),
    [rules],
  );
  const activePipelineIds = useMemo(
    () => new Set(deployedRules.map((rule) => rule.pipelineId)),
    [deployedRules],
  );
  const automationTargetPipelines = useMemo(
    () => pipelines.filter((pipeline) => activePipelineIds.has(pipeline.id)),
    [activePipelineIds, pipelines],
  );
  const pipelineById = useMemo(() => {
    const map = new Map<string, PipelineDefinition>();
    for (const pipeline of pipelines) map.set(pipeline.id, pipeline);
    return map;
  }, [pipelines]);
  const satelliteOptions = useMemo(
    () => [...SATELLITE_OPTIONS],
    [],
  );
  const modeOptions = useMemo(
    () => [...MODE_OPTIONS],
    [],
  );
  const selectedRule = selectedRuleId ? rules.find((rule) => rule.id === selectedRuleId) ?? null : null;
  const selectedFormPipeline = ruleForm.pipelineId ? pipelineById.get(ruleForm.pipelineId) ?? null : null;
  const selectedFormPreviewSteps = selectedFormPipeline ? toPreviewSteps(selectedFormPipeline) : [];
  const missingAutomationSelections = useMemo(() => [
    !ruleForm.inputLevel ? 'Input Level' : null,
    !ruleForm.pipelineId ? 'Active Pipeline' : null,
  ].filter((selection): selection is string => selection !== null), [ruleForm.inputLevel, ruleForm.pipelineId]);
  const selectedPipelineJobIds = useMemo(() => {
    if (!selectedRule) return new Set<string>();
    return new Set(jobs.filter((job) => job.pipelineId === selectedRule.pipelineId).map((job) => job.jobId));
  }, [jobs, selectedRule]);
  const automaticPipelineLogs = useMemo(() => {
    if (!selectedRule) return executionLogs;
    const matched = executionLogs.filter((log) => log.jobId && selectedPipelineJobIds.has(log.jobId));
    return matched.length > 0 ? matched : executionLogs.slice(0, 80);
  }, [executionLogs, selectedPipelineJobIds, selectedRule]);

  const handleOpenPipeline = useCallback((pipelineId: string) => {
    router.push(`${base}/console?pipelineId=${encodeURIComponent(pipelineId)}`);
  }, [router, base]);

  const handleSaveRule = useCallback(async (form: RuleFormState, options?: { requireInputLevel?: boolean }) => {
    if (!form.pipelineId) {
      toast.error('Select a pipeline to automate');
      return null;
    }
    if (options?.requireInputLevel && !form.inputLevel) {
      toast.error('Select an input level condition');
      return null;
    }

    const payload: SavePipelineActivationRuleData = {
      id: form.id ?? undefined,
      pipelineId: form.pipelineId,
      active: form.active,
      eventType: form.eventType,
      sourceQueue: form.sourceQueue,
      match: {
        satelliteIds: form.satelliteId ? [form.satelliteId] : undefined,
        modes: form.mode ? [form.mode] : undefined,
        polarizations: form.polarization ? [form.polarization] : undefined,
        inputLevel: form.inputLevel || undefined,
      },
      triggerSource: form.triggerSource,
      description: form.description,
    };
    const payloadEventQueueKey = eventQueueKey(payload.sourceQueue, payload.eventType);
    const duplicateRule = payload.active
      ? rules.find((rule) => rule.active && rule.id !== payload.id && ruleEventQueueKey(rule) === payloadEventQueueKey)
      : undefined;
    if (duplicateRule) {
      toast.error('The same event and source queue is already active.');
      return null;
    }

    setSavingPipelineId(form.pipelineId);
    const res = await service.파이프라인_자동실행규칙을_저장한다(payload);
    setSavingPipelineId(null);
    if (!res.success) {
      toast.error(res.message);
      return null;
    }
    await refresh();
    if (res.data) {
      setSelectedRuleId(res.data.id);
      setRuleForm(ruleToForm(res.data));
    }
    return res.data ?? null;
  }, [service, refresh, rules]);

  const handleAutomate = useCallback(async () => {
    setAutomating(true);
    await new Promise((resolve) => setTimeout(resolve, 720));
    // 신규 룰은 항상 비활성 상태로 등록 — 활성/비활성 토글은 목록 화면에서 수행한다.
    // 같은 이벤트·큐에 활성 룰이 있어도 신규는 비활성이라 충돌하지 않으므로 모달 단계 중복 검증은 제거.
    const result = await handleSaveRule({ ...ruleForm, active: false }, { requireInputLevel: true });
    setAutomating(false);
    if (!result) return;
    setMappingModalOpen(false);
    toast.success('Automation pipeline added (inactive)');
  }, [handleSaveRule, ruleForm]);

  const handleToggleRuleActive = useCallback((rule: PipelineActivationRule) => {
    setToggleConfirmRule(rule);
  }, []);

  const handleConfirmToggleRuleActive = useCallback(async () => {
    if (!toggleConfirmRule) return;
    const nextActive = !toggleConfirmRule.active;
    const result = await handleSaveRule({ ...ruleToForm(toggleConfirmRule), active: nextActive });
    if (!result) return;
    setToggleConfirmRule(null);
    toast.success(nextActive ? 'Automation rule activated.' : 'Automation rule deactivated.');
  }, [handleSaveRule, toggleConfirmRule]);

  const handleRequestSwap = useCallback((from: PipelineActivationRule, to: PipelineActivationRule) => {
    setSwapConfirm({ from, to });
  }, []);

  const handleConfirmSwap = useCallback(async () => {
    if (!swapConfirm) return;
    setSwapping(true);
    const offResult = await handleSaveRule({ ...ruleToForm(swapConfirm.from), active: false });
    if (!offResult) {
      setSwapping(false);
      return;
    }
    const onResult = await handleSaveRule({ ...ruleToForm(swapConfirm.to), active: true });
    setSwapping(false);
    if (!onResult) return;
    setSwapConfirm(null);
    toast.success('Active automation rule swapped.');
  }, [handleSaveRule, swapConfirm]);

  const handleOpenNewRuleModal = useCallback(() => {
    setRuleForm(makeEmptyRuleForm());
    setMappingModalOpen(true);
  }, []);

  const handleRowClick = useCallback((rule: PipelineActivationRule) => {
    setRuleForm(ruleToForm(rule));
    setSelectedRuleId(rule.id);
    setExpandedRuleId((prev) => (prev === rule.id ? null : rule.id));
  }, []);

  return (
    <div className="h-full flex overflow-hidden bg-background">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        activePage="deployed"
      />

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background px-5 py-2.5">
          <PipelineExecutionTabs active="auto" counts={{ auto: matchingRules.length, manual: jobs.length }} />
          {canManage && (
            <button
              type="button"
              onClick={handleOpenNewRuleModal}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[11px] font-semibold text-accent-foreground transition-colors hover:brightness-110"
            >
              <Plus className="h-3.5 w-3.5" />
              Auto-Run Mapping Rule
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {matchingRules.length === 0 ? (
            <section className="rounded-xl border border-border bg-card px-4 py-24 text-center">
              <Activity className="w-10 h-10 mx-auto text-muted-foreground/30" />
              <p className="mt-3 text-sm font-medium text-foreground">No automation matching rules</p>
              <p className="mt-1 text-xs text-muted-foreground">Use the button at the top right to link a pgmq event condition to an execution pipeline.</p>
            </section>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: MAPPING_CONTENT_MIN_WIDTH }}>
                {EVENT_TYPE_GROUP_ORDER.map((eventType) => {
                  const groupRules = matchingRules.filter((r) => r.eventType === eventType);
                  if (groupRules.length === 0) return null;
                  return (
                    <EventGroupCard
                      key={eventType}
                      eventType={eventType}
                      rules={groupRules}
                      pipelineById={pipelineById}
                      expandedRuleId={expandedRuleId}
                      canManage={canManage}
                      savingPipelineId={savingPipelineId}
                      rulesAll={rules}
                      onRowClick={handleRowClick}
                      onToggleActive={handleToggleRuleActive}
                      onRequestSwap={handleRequestSwap}
                      onOpenPipeline={handleOpenPipeline}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <ExecutionLogPanel
          logs={automaticPipelineLogs}
          selectedJobId={null}
          open={logPanelOpen}
          onToggle={() => setLogPanelOpen((value) => !value)}
        />
      </main>

      {mappingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5 py-3" onClick={() => !automating && setMappingModalOpen(false)}>
          <div
            className={`flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl transition-[max-width] duration-200 ${
              selectedFormPipeline ? 'h-[calc(100vh-24px)] max-w-7xl' : 'max-h-[calc(100vh-24px)] max-w-5xl'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <ServerCog className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-semibold text-foreground">Auto-Run Mapping Rule</h2>
              </div>
              <button
                type="button"
                disabled={automating}
                onClick={() => setMappingModalOpen(false)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="grid h-72 min-h-0 shrink-0 grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)] overflow-hidden border-b border-border">
                <div className="min-h-0 overflow-y-auto border-r border-border px-5 py-4">
                  <div className="space-y-5">
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">pgmq Event</p>
                      <div className="flex flex-wrap gap-2">
                        {EVENT_TYPE_OPTIONS.map((eventType) => (
                          <BadgeButton
                            key={eventType}
                            active={ruleForm.eventType === eventType}
                            disabled={automating}
                            onClick={() => setRuleForm((prev) => ({
                              ...prev,
                              eventType,
                              sourceQueue: PIPELINE_EVENT_SOURCE_QUEUE[eventType],
                            }))}
                          >
                            {PIPELINE_EVENT_TYPE_LABELS[eventType]}
                          </BadgeButton>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-semibold uppercase">Source Queue</span>
                        <span className={`rounded-full border px-2 py-0.5 font-mono ${
                          ruleForm.sourceQueue === PGMQ_EVENT_TBD_QUEUE
                            ? 'border-dashed border-muted-foreground/40 text-muted-foreground'
                            : 'border-border bg-muted/40 text-foreground'
                        }`}>
                          {ruleForm.sourceQueue}
                        </span>
                        {ruleForm.sourceQueue === PGMQ_EVENT_TBD_QUEUE && (
                          <span className="text-[10px] text-muted-foreground/80">SI-07 transport TBC</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Input Level</p>
                      <div className="flex flex-wrap gap-2">
                        {PRODUCT_LEVEL_OPTIONS.map((inputLevel) => (
                          <BadgeButton
                            key={inputLevel}
                            active={ruleForm.inputLevel === inputLevel}
                            disabled={automating}
                            onClick={() => setRuleForm((prev) => ({ ...prev, inputLevel }))}
                          >
                            {PRODUCT_LEVEL_LABELS[inputLevel]}
                          </BadgeButton>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Satellite</p>
                      <div className="flex flex-wrap gap-2">
                        {satelliteOptions.map((satelliteId) => (
                          <BadgeButton
                            key={satelliteId}
                            active={ruleForm.satelliteId === satelliteId}
                            disabled={automating}
                            onClick={() => setRuleForm((prev) => ({
                              ...prev,
                              satelliteId: prev.satelliteId === satelliteId ? '' : satelliteId,
                            }))}
                          >
                            {satelliteId}
                          </BadgeButton>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Mode</p>
                      <div className="flex flex-wrap gap-2">
                        {modeOptions.map((mode) => (
                          <BadgeButton
                          key={mode}
                          active={ruleForm.mode === mode}
                          disabled={automating}
                          onClick={() => setRuleForm((prev) => ({
                            ...prev,
                            mode: prev.mode === mode ? '' : mode,
                          }))}
                        >
                          {mode}
                        </BadgeButton>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Polarization</p>
                      <div className="flex flex-wrap gap-2">
                        {POLARIZATION_OPTIONS.map((polarization) => (
                          <BadgeButton
                          key={polarization}
                          active={ruleForm.polarization === polarization}
                          disabled={automating}
                          onClick={() => setRuleForm((prev) => ({
                            ...prev,
                            polarization: prev.polarization === polarization ? '' : polarization,
                          }))}
                        >
                          {polarization}
                        </BadgeButton>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>

                <div className="min-h-0 overflow-y-auto px-5 py-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">Active Pipelines</p>
                    <span className="rounded-full bg-muted/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{automationTargetPipelines.length}</span>
                  </div>
                  {automationTargetPipelines.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center">
                      <GitBranch className="mx-auto h-8 w-8 text-muted-foreground/35" />
                      <p className="mt-3 text-xs text-muted-foreground">No pipelines have been activated in pipeline management</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {automationTargetPipelines.map((pipeline) => {
                        const selected = ruleForm.pipelineId === pipeline.id;
                        return (
                          <button
                            key={pipeline.id}
                            type="button"
                            disabled={automating}
                            onClick={() => setRuleForm((prev) => ({
                              ...prev,
                              pipelineId: pipeline.id,
                            }))}
                            className={`w-full rounded-lg border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                              selected
                                ? 'border-accent/45 bg-accent/10'
                                : 'border-border bg-background hover:bg-muted/35'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">{pipeline.name}</p>
                              </div>
                              {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {selectedFormPipeline && (
                <div className="flex min-h-0 flex-1 flex-col bg-muted/10 px-5 py-4">
                  <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Pipeline Preview</p>
                      <p className="mt-1 truncate text-xs font-semibold text-foreground">{selectedFormPipeline.name}</p>
                    </div>
                    <span className="rounded-full bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      {selectedFormPipeline.steps.length} steps
                    </span>
                  </div>
                  <div className="deployed-preview-flow min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-background">
                    <CanvasGraph
                      key={`automation-modal-graph-${selectedFormPipeline.id}`}
                      pipelineId={`automation-modal-${selectedFormPipeline.id}`}
                      steps={selectedFormPreviewSteps}
                      pipelineEdges={selectedFormPipeline.edges}
                      editable={false}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border bg-muted/10 px-5 py-4">
              <div className="mb-3 rounded-lg border border-border bg-background px-3 py-3">
                <p className="mb-2 text-[10px] font-semibold text-muted-foreground">Selected Final Auto Pipeline</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border bg-muted/45 px-2.5 py-1 font-mono text-[10px] text-foreground">
                    {ruleForm.sourceQueue}
                  </span>
                  <span className="rounded-full border border-border bg-muted/45 px-2.5 py-1 text-[10px] text-foreground">
                    {PIPELINE_EVENT_TYPE_LABELS[ruleForm.eventType]}
                  </span>
                  {[
                    ruleForm.satelliteId,
                    ruleForm.mode,
                    ruleForm.polarization,
                    ruleForm.inputLevel ? PRODUCT_LEVEL_LABELS[ruleForm.inputLevel] : '',
                  ].filter(Boolean).map((label) => (
                    <span key={label} className="rounded-full border border-border bg-muted/45 px-2.5 py-1 text-[10px] text-foreground">
                      {label}
                    </span>
                  ))}
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                  <span className="rounded-full border border-accent/35 bg-accent/10 px-3 py-1 text-[10px] font-semibold text-accent">
                    {selectedFormPipeline?.name ?? 'No pipeline selected'}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {missingAutomationSelections.length > 0
                      ? `Additional selections required: ${missingAutomationSelections.join(', ')}`
                      : 'Ready to automate'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={automating}
                    onClick={() => setMappingModalOpen(false)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/45 hover:text-foreground disabled:opacity-45"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={automating || missingAutomationSelections.length > 0}
                    onClick={handleAutomate}
                    className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {automating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                    {automating ? 'Adding automation' : 'Automate'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {swapConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5 py-4"
          onClick={() => !swapping && setSwapConfirm(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">
                Swap the active automation rule?
              </h2>
              <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
                Another active rule already exists for this event · queue. Continuing will deactivate the previous rule and activate the selected one.
              </p>
            </div>
            <div className="space-y-2 px-5 py-4">
              <div className="rounded-md border border-border bg-muted/15 px-3 py-2.5">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                  Deactivate (current active)
                </div>
                <p className="mt-1 text-xs font-medium text-foreground">
                  {pipelineById.get(swapConfirm.from.pipelineId)?.name ?? swapConfirm.from.pipelineId}
                </p>
              </div>
              <div className="flex justify-center text-muted-foreground">
                <ArrowRight className="h-3.5 w-3.5 rotate-90" />
              </div>
              <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2.5">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-accent">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                  Activate (new)
                </div>
                <p className="mt-1 text-xs font-medium text-foreground">
                  {pipelineById.get(swapConfirm.to.pipelineId)?.name ?? swapConfirm.to.pipelineId}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                disabled={swapping}
                onClick={() => setSwapConfirm(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/45 hover:text-foreground disabled:opacity-45"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={swapping}
                onClick={handleConfirmSwap}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {swapping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {swapping ? 'Swapping' : 'Yes, swap'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toggleConfirmRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5 py-4" onClick={() => setToggleConfirmRule(null)}>
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">
                {toggleConfirmRule.active ? 'Deactivate this rule?' : 'Activate this rule?'}
              </h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {pipelineById.get(toggleConfirmRule.pipelineId)?.name ?? toggleConfirmRule.pipelineId}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <button
                type="button"
                disabled={savingPipelineId === toggleConfirmRule.pipelineId}
                onClick={() => setToggleConfirmRule(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/45 hover:text-foreground disabled:opacity-45"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingPipelineId === toggleConfirmRule.pipelineId}
                onClick={handleConfirmToggleRuleActive}
                className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  toggleConfirmRule.active
                    ? 'bg-destructive text-white hover:brightness-110'
                    : 'bg-accent text-accent-foreground hover:brightness-110'
                }`}
              >
                {toggleConfirmRule.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .deployed-preview-flow .react-flow__controls,
        .deployed-preview-flow .react-flow__minimap {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
