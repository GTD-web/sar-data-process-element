'use client';

import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useStore,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type Connection,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { PipelineNode, type PipelineNodeData, kindToneHex, isNeutralFilledKind } from './PipelineNode';
import { DeletableEdge, type DeletableEdgeData } from './DeletableEdge';
import { EdgeHoverContext } from './EdgeHoverContext';
import type { PipelineStep, PipelineEdge } from '@/types/pipeline';
import * as t from '@/styles/design-tokens';

const nodeTypes: NodeTypes = {
  pipeline: PipelineNode,
};

const edgeTypes: EdgeTypes = {
  deletable: DeletableEdge,
};

const NODE_WIDTH = 64;
const NODE_HEIGHT = 64;

function sanitizeGraphScope(scope?: string | null) {
  return scope?.replace(/[^a-zA-Z0-9_-]/g, '-') ?? 'graph';
}

function getStepIdentity(step: Pick<PipelineStep, 'kind' | 'sarStage' | 'inputLevel' | 'parentOrder'>) {
  return [
    step.kind ?? 'UNKNOWN',
    step.sarStage ?? '-',
    step.inputLevel ?? '-',
    step.parentOrder ?? '-',
  ].join('|');
}

/** Per-node radial glow — each node gets its own soft halo so the background lights up evenly */
function CanvasGlow() {
  const nodesFromStore = useStore((s) => s.nodes);
  const [px, py, zoom] = useStore((s) => s.transform);

  if (nodesFromStore.length === 0) return null;

  // Per-node glow는 노드 개수/완료 비율에 무관하게 항상 동일한 범위·강도를 갖는다.
  const radius = 155 * zoom;
  const glowOpacity = 0.15;
  const defaultInner = `rgba(52,211,153,${glowOpacity})`;
  const defaultMid = `rgba(52,211,153,${(glowOpacity * 0.4).toFixed(3)})`;
  // FAILED nodes get a red halo at a fixed, slightly stronger intensity so they stand out
  const redInner = `rgba(239,68,68,0.18)`;
  const redMid = `rgba(239,68,68,0.07)`;

  const hexToRgb = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];

  const gradients = nodesFromStore
    .map((n) => {
      const data = n.data as PipelineNodeData | undefined;
      const status = data?.status;
      let inner: string;
      let mid: string;
      if (status === 'FAILED') {
        inner = redInner;
        mid = redMid;
      } else if (status === 'COMPLETED' || status === 'RUNNING') {
        // Neutral 노드(시작/종료/카탈로그) 는 색조 halo 없이 조용히 표시
        if (isNeutralFilledKind(data?.kind)) return null;
        const toneHex = kindToneHex(data?.kind);
        if (toneHex) {
          const [r, g, b] = hexToRgb(toneHex);
          inner = `rgba(${r},${g},${b},${glowOpacity})`;
          mid = `rgba(${r},${g},${b},${(glowOpacity * 0.4).toFixed(3)})`;
        } else {
          inner = defaultInner;
          mid = defaultMid;
        }
      } else {
        // PENDING / SKIPPED / CANCELED → no glow
        return null;
      }
      const cx = (n.position?.x ?? 0) * zoom + px + (NODE_WIDTH * zoom) / 2;
      const cy = (n.position?.y ?? 0) * zoom + py + (NODE_HEIGHT * zoom) / 2;
      return `radial-gradient(${radius}px ${radius}px at ${cx}px ${cy}px, ${inner} 0%, ${mid} 45%, transparent 100%)`;
    })
    .filter((g): g is string => g !== null)
    .join(', ');

  if (!gradients) return null;

  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none', zIndex: 0,
        background: gradients,
      }}
    />
  );
}

function computeInitialPositions(steps: PipelineStep[], pipelineEdges: PipelineEdge[]): Map<number, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 120, ranksep: 200 });

  for (const step of steps) {
    g.setNode(`s-${step.order}`, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const { source, target } of pipelineEdges) {
    g.setEdge(`s-${source}`, `s-${target}`);
  }
  dagre.layout(g);

  const positions = new Map<number, { x: number; y: number }>();
  for (const step of steps) {
    const pos = g.node(`s-${step.order}`);
    if (pos) positions.set(step.order, { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 });
  }
  return positions;
}

function buildNodes(
  steps: PipelineStep[],
  pipelineEdges: PipelineEdge[],
  positions: Map<number, { x: number; y: number }>,
  editable: boolean,
  onDeleteNode?: (order: number) => void,
  onAddAfter?: (afterOrder: number) => void,
  onTrigger?: () => void,
  jobInitWarningReason?: string,
  onExecuteStep?: (order: number) => void,
  disabledNodeOrders?: Set<number>,
  onToggleNodeActive?: (order: number) => void,
  onReprocessStep?: (order: number) => void,
  isJobMode?: boolean,
  suppressEntryInputWarning?: boolean,
): Node[] {
  const sources = new Set(pipelineEdges.map((e) => e.source));
  const targets = new Set(pipelineEdges.map((e) => e.target));
  // 시작 노드(TRIGGER/FILE_INPUT) 직후 후속 노드 중 JOB_INIT 가 아닌 것들 → 잘못된 연결.
  // (작업 흐름상 시작 → JOB_INIT 이 강제. JOB_INIT 빠지면 backend 작업 큐에 안 들어감.)
  const startOrders = new Set(steps.filter((s) => s.kind === 'TRIGGER' || s.kind === 'FILE_INPUT').map((s) => s.order));
  const invalidAfterStart = new Set<number>();
  for (const e of pipelineEdges) {
    if (!startOrders.has(e.source)) continue;
    const target = steps.find((s) => s.order === e.target);
    if (target && target.kind !== 'JOB_INIT') invalidAfterStart.add(e.target);
  }
  return steps.map((step) => {
    const isEntryNode = step.kind === 'TRIGGER' || step.kind === 'FILE_INPUT';
    const warningReason =
      step.kind === 'JOB_INIT' && jobInitWarningReason
        ? jobInitWarningReason
        : invalidAfterStart.has(step.order)
          ? 'Invalid connection — a Job Initialization node must come between the start node and this step.'
          : undefined;
    return {
      id: `step-${step.order}`,
      type: 'pipeline',
      position: positions.get(step.order) ?? { x: step.order * 260, y: 0 },
      draggable: editable,
      data: {
        kind: step.kind,
        sarStage: step.sarStage,
        sarSubStage: step.sarSubStage,
        inputLevel: step.inputLevel,
        fileInputSceneId: step.fileInputSceneId,
        fileInputFilePath: step.fileInputFilePath,
        status: step.status,
        order: step.order, startedAt: step.startedAt, durationMs: step.durationMs, errorMessage: step.errorMessage,
        enabledTasks: step.enabledTasks,
        editable, isLeaf: !sources.has(step.order), isHead: !targets.has(step.order),
        onDelete: onDeleteNode, onAddAfter,
        onTrigger: isEntryNode ? onTrigger : undefined,
        onExecuteStep,
        warningReason,
        enabled: !disabledNodeOrders?.has(step.order),
        onToggleActive: isEntryNode ? undefined : onToggleNodeActive,
        onReprocess:
          step.kind === 'SAR' && onReprocessStep && (step.status === 'COMPLETED' || step.status === 'FAILED')
            ? onReprocessStep
            : undefined,
        isJobMode,
        suppressEntryInputWarning,
      } satisfies PipelineNodeData,
    };
  });
}

function buildEdges(
  steps: PipelineStep[],
  pipelineEdges: PipelineEdge[],
  graphScope: string,
  editable: boolean,
  onDeleteEdge?: (sourceOrder: number, targetOrder: number) => void,
  onInsertNode?: (afterOrder: number, beforeOrder?: number) => void,
  onHoverStay?: () => void,
  onHoverLeave?: () => void,
  isJobMode?: boolean,
  disabledNodeOrders?: Set<number>,
): Edge[] {
  const stepMap = new Map(steps.map((s) => [s.order, s]));
  return pipelineEdges.map(({ source, target }) => {
    const srcStep = stepMap.get(source);
    const tgtStep = stepMap.get(target);
    const completed = srcStep?.status === 'COMPLETED';
    const running = tgtStep?.status === 'RUNNING';
    const srcFailed = srcStep?.status === 'FAILED';
    const tgtCanceled = tgtStep?.status === 'CANCELED';
    const tgtPendingInJob = isJobMode && tgtStep?.status === 'PENDING';
    const srcDisabled = disabledNodeOrders?.has(source) ?? false;
    const tgtDisabled = disabledNodeOrders?.has(target) ?? false;
    const dimmed = srcFailed || tgtCanceled || tgtPendingInJob || srcDisabled || tgtDisabled;
    // 엣지 색상은 처리 흐름(SAR 그린)으로 통일 — 노드 색은 단계 의미(회색=경계, 파랑=설정, 그린=처리)를 담당하고
    // 엣지는 "데이터가 다음 단계로 흐른다"는 일관된 시각 신호만 전달한다.
    const kindToneStroke = kindToneHex('SAR');
    const stroke = dimmed
      ? t.edgeMuted
      : kindToneStroke ?? (completed ? t.edgeSuccess : running ? t.accent : t.edge);
    const markerVariant = dimmed ? 'outline' : 'solid';
    const edgeId = `${graphScope}-e-${source}-${target}`;
    // Use custom marker ID so arrow size stays fixed on hover (markerUnits=userSpaceOnUse)
    const markerId = `arrow-${edgeId}`;
    return {
      id: edgeId,
      source: `step-${source}`,
      target: `step-${target}`,
      type: 'deletable',
      selectable: false,
      animated: running,
      markerEnd: `url(#${markerId})`,
      data: {
        stroke, strokeWidth: 2, animated: running, editable,
        markerVariant,
        markerBackground: 'var(--background)',
        sourceOrder: source, targetOrder: target,
        markerId,
        onDelete: onDeleteEdge,
        onInsert: onInsertNode,
        onHoverStay, onHoverLeave,
      } satisfies DeletableEdgeData,
    };
  });
}

/** 새 파이프라인 생성 시 entry 노드로 줌인하는 내부 컨트롤러 */
function FlowEntryFocus({ trigger, nodes }: { trigger: number; nodes: Node[] }) {
  const { setCenter } = useReactFlow();
  const nodesRef = useRef(nodes);

  // ref를 렌더 중에 쓰지 않고 effect로 동기화 — 최신 nodes를 120ms 타이머 내부에서 참조하기 위함
  useEffect(() => {
    nodesRef.current = nodes;
  });

  useEffect(() => {
    if (trigger === 0) return;
    // 레이아웃이 확정된 직후에 실행 — 타이머 시점의 최신 nodes를 ref로 조회
    const id = window.setTimeout(() => {
      const entryNode = nodesRef.current.find((n) => (n.data as PipelineNodeData).isHead === true);
      if (!entryNode) return;
      const cx = entryNode.position.x + NODE_WIDTH / 2;
      const cy = entryNode.position.y + NODE_HEIGHT / 2;
      setCenter(cx, cy, { zoom: 1.5, duration: 600 });
    }, 120);
    return () => window.clearTimeout(id);
  }, [trigger, setCenter]);

  return null;
}

interface CanvasGraphProps {
  pipelineId?: string | null;
  steps: PipelineStep[];
  pipelineEdges: PipelineEdge[];
  editable?: boolean;
  onNodeClick?: (stepOrder: number, clickY: number) => void;
  onDeleteNode?: (order: number) => void;
  onAddNode?: (afterOrder: number, beforeOrder?: number) => void;
  onConnect?: (sourceOrder: number, targetOrder: number) => void;
  onDeleteEdge?: (sourceOrder: number, targetOrder: number) => void;
  onTrigger?: () => void;
  /** JOB_INIT 노드에만 표시 — 예: 처리 프로파일 미선택 */
  jobInitWarningReason?: string;
  /** 새 파이프라인 생성 시 증가 → entry 노드로 자동 줌인 */
  focusEntryTrigger?: number;
  /** 노드 더블클릭 또는 툴바 Play → 노드 상세 모달 열기 */
  onNodeOpenDetail?: (stepOrder: number) => void;
  /** 바이패스 상태인 노드 order 집합 */
  disabledNodeOrders?: Set<number>;
  /** Power 버튼 클릭 → 활성/비활성 토글 */
  onToggleNodeActive?: (order: number) => void;
  /** SAR 노드 부분 재처리 콜백 */
  onReprocessStep?: (order: number) => void;
  /** Job 선택 모드 — PENDING 노드를 회색으로 표시 */
  isJobMode?: boolean;
  /** 진입 노드의 입력 파일 미지정 경고(아이콘/배지)를 숨긴다. Dashboard·Raw Data 등 정의 시각화 전용. */
  suppressEntryInputWarning?: boolean;
  /** 노드 상태별 halo glow 표시 여부. 기본값 true. */
  showGlow?: boolean;
  /** 우하단 minimap 표시 여부. 기본값 true. */
  showMinimap?: boolean;
  /** 좌하단 zoom controls 표시 여부. 기본값 true. */
  showControls?: boolean;
}

export default function CanvasGraph({ pipelineId, steps, pipelineEdges, editable = false, onNodeClick, onDeleteNode, onAddNode, onConnect: onConnectProp, onDeleteEdge, onTrigger, jobInitWarningReason, focusEntryTrigger = 0, onNodeOpenDetail, disabledNodeOrders, onToggleNodeActive, onReprocessStep, isJobMode, suppressEntryInputWarning, showGlow = true, showMinimap = true, showControls = true }: CanvasGraphProps) {
  const graphScope = useMemo(() => sanitizeGraphScope(pipelineId), [pipelineId]);
  // 노드 위치는 드래그로 누적되는 사용자 편집 상태이므로 state로 유지.
  // 파이프라인 전환·스텝 추가/삭제 시에는 React 권장 "렌더 중 상태 조정" 패턴으로
  // prop 변화를 감지해 한 번만 재동기화한다.
  const [positions, setPositions] = useState<Map<number, { x: number; y: number }>>(() => new Map());
  const [syncedPipelineId, setSyncedPipelineId] = useState<string | null | undefined>(null);
  const stepsKey = useMemo(() => steps.map((s) => s.order).sort((a, b) => a - b).join(','), [steps]);
  const [syncedStepsKey, setSyncedStepsKey] = useState<string>('');
  const prevStepsRef = useRef<PipelineStep[]>(steps);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const edgeLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (pipelineId !== syncedPipelineId) {
    setSyncedPipelineId(pipelineId);
    setSyncedStepsKey(stepsKey);
    setPositions(computeInitialPositions(steps, pipelineEdges));
  } else if (stepsKey !== syncedStepsKey) {
    setSyncedStepsKey(stepsKey);
    setPositions((prev) => {
      const next = prev.size === 0 ? computeInitialPositions(steps, pipelineEdges) : new Map(prev);
      const previousSteps = prevStepsRef.current;
      const reusablePositions = new Map<string, { x: number; y: number }[]>();

      for (const prevStep of previousSteps) {
        const identity = getStepIdentity(prevStep);
        const position = prev.get(prevStep.order);
        if (position) {
          const bucket = reusablePositions.get(identity) ?? [];
          bucket.push(position);
          reusablePositions.set(identity, bucket);
        }
      }

      const currentIdentityCounts = new Map<string, number>();
      for (const step of steps) {
        const identity = getStepIdentity(step);
        const occurrence = currentIdentityCounts.get(identity) ?? 0;
        currentIdentityCounts.set(identity, occurrence + 1);

        if (!next.has(step.order)) {
          const reusedPosition = reusablePositions.get(identity)?.[occurrence];
          if (reusedPosition) {
            next.set(step.order, reusedPosition);
            continue;
          }

          const inEdge = pipelineEdges.find((e) => e.target === step.order);
          const outEdge = pipelineEdges.find((e) => e.source === step.order);
          const srcPos = inEdge ? next.get(inEdge.source) : null;
          const tgtPos = outEdge ? next.get(outEdge.target) : null;

          if (srcPos && tgtPos) {
            next.set(step.order, { x: (srcPos.x + tgtPos.x) / 2, y: (srcPos.y + tgtPos.y) / 2 });
          } else if (srcPos) {
            const siblings = pipelineEdges.filter((e) => e.source === inEdge!.source);
            const branchIdx = siblings.findIndex((e) => e.target === step.order);
            next.set(step.order, { x: srcPos.x + 200, y: srcPos.y + branchIdx * 130 });
          } else if (tgtPos) {
            next.set(step.order, { x: tgtPos.x - 200, y: tgtPos.y });
          } else {
            const existing = Array.from(next.values());
            const leftmostX = existing.length > 0 ? Math.min(...existing.map((pos) => pos.x)) : 0;
            const lowestY = existing.length > 0 ? Math.max(...existing.map((pos) => pos.y)) : 0;
            next.set(step.order, { x: leftmostX, y: lowestY + 160 });
          }
        }
      }
      for (const order of next.keys()) {
        if (!steps.find((s) => s.order === order)) next.delete(order);
      }
      return next;
    });
  }

  useEffect(() => {
    prevStepsRef.current = steps;
  }, [steps]);

  const clearLeaveTimer = useCallback(() => {
    if (edgeLeaveTimerRef.current) {
      clearTimeout(edgeLeaveTimerRef.current);
      edgeLeaveTimerRef.current = null;
    }
  }, []);

  const scheduleLeave = useCallback(() => {
    edgeLeaveTimerRef.current = setTimeout(() => setHoveredEdgeId(null), 200);
  }, []);

  const handleExecuteStep = useCallback((order: number) => {
    onNodeOpenDetail?.(order);
  }, [onNodeOpenDetail]);

  // Build nodes and edges WITHOUT hover dependency
  const pipelineNodes = buildNodes(steps, pipelineEdges, positions, editable, onDeleteNode, onAddNode, onTrigger, jobInitWarningReason, handleExecuteStep, disabledNodeOrders, onToggleNodeActive, onReprocessStep, isJobMode, suppressEntryInputWarning);
  const allEdges = buildEdges(steps, pipelineEdges, graphScope, editable, onDeleteEdge, onAddNode, clearLeaveTimer, scheduleLeave, isJobMode, disabledNodeOrders);

  const [nodes, setNodes, onNodesChange] = useNodesState(pipelineNodes);
  const [edges, setEdges] = useEdgesState(allEdges);

  // Update nodes/edges only when pipeline data changes — NOT on hover
  // positions는 deps에서 제외: 드래그로 positions만 바뀔 때는 ReactFlow가 내부적으로 위치를 관리하므로
  // setNodes를 다시 호출할 필요 없음 (effect는 최신 positions를 closure로 캡처).
  useEffect(() => {
    setNodes(buildNodes(steps, pipelineEdges, positions, editable, onDeleteNode, onAddNode, onTrigger, jobInitWarningReason, handleExecuteStep, disabledNodeOrders, onToggleNodeActive, onReprocessStep, isJobMode, suppressEntryInputWarning));
    setEdges(buildEdges(steps, pipelineEdges, graphScope, editable, onDeleteEdge, onAddNode, clearLeaveTimer, scheduleLeave, isJobMode, disabledNodeOrders));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, pipelineEdges, graphScope, editable, onDeleteNode, onAddNode, onDeleteEdge, onTrigger, jobInitWarningReason, clearLeaveTimer, scheduleLeave, setNodes, setEdges, handleExecuteStep, disabledNodeOrders, onToggleNodeActive, onReprocessStep, isJobMode, suppressEntryInputWarning]);

  const onInit = useCallback((instance: { fitView: () => void }) => {
    setTimeout(() => instance.fitView(), 100);
  }, []);

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    onNodeClick?.(parseInt(node.id.replace('step-', ''), 10), event.clientY);
  }, [onNodeClick]);

  const handleNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    onNodeOpenDetail?.(parseInt(node.id.replace('step-', ''), 10));
  }, [onNodeOpenDetail]);

  const handleConnect = useCallback((connection: Connection) => {
    if (!editable || !onConnectProp) return;
    const sourceOrder = parseInt(connection.source?.replace('step-', '') ?? '', 10);
    const targetOrder = parseInt(connection.target?.replace('step-', '') ?? '', 10);
    if (!isNaN(sourceOrder) && !isNaN(targetOrder) && sourceOrder !== targetOrder) {
      onConnectProp(sourceOrder, targetOrder);
    }
  }, [editable, onConnectProp]);

  const handleEdgeMouseEnter = useCallback((_: React.MouseEvent, edge: Edge) => {
    clearLeaveTimer();
    setHoveredEdgeId(edge.id);
  }, [clearLeaveTimer]);

  const handleEdgeMouseLeave = useCallback(() => {
    scheduleLeave();
  }, [scheduleLeave]);

  const handleNodeDragStop = useCallback((_event: React.MouseEvent, node: Node) => {
    if (!node.id.startsWith('step-')) return;
    const order = parseInt(node.id.replace('step-', ''), 10);
    setPositions((prev) => {
      const next = new Map(prev);
      next.set(order, { ...node.position });
      return next;
    });
  }, []);

  return (
    <EdgeHoverContext.Provider value={hoveredEdgeId}>
      <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange} onInit={onInit}
        onNodeClick={handleNodeClick} onNodeDoubleClick={handleNodeDoubleClick} onNodeDragStop={handleNodeDragStop}
        onEdgeMouseEnter={handleEdgeMouseEnter} onEdgeMouseLeave={handleEdgeMouseLeave}
        onConnect={handleConnect}
        fitView proOptions={{ hideAttribution: true }}
        minZoom={0.2} maxZoom={4} className="bg-background"
        zoomOnDoubleClick={false}
        nodesDraggable={editable} nodesConnectable={editable} elementsSelectable
        snapToGrid snapGrid={[20, 20]}
        connectionLineStyle={{ stroke: t.accent, strokeWidth: 2 }}
        defaultEdgeOptions={{ style: { stroke: 'transparent', strokeWidth: 0 } }}
      >
        <FlowEntryFocus trigger={focusEntryTrigger} nodes={nodes} />
        {showGlow && <CanvasGlow />}
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={t.canvasDot} />
        {showControls && (
          <Controls showInteractive={false} position="bottom-left" className="!bg-card !border-border !shadow-lg [&>button]:!bg-muted [&>button]:!border-border [&>button]:!text-foreground" />
        )}
        {showMinimap && (
          <MiniMap
            nodeColor={(n) => { const d = n.data as PipelineNodeData; return d.status === 'COMPLETED' ? t.success : d.status === 'RUNNING' ? t.accent : d.status === 'FAILED' ? t.accent : t.nodeDefault; }}
            maskColor="rgba(26, 26, 26, 0.8)" className="!bg-card/90 !border-border !rounded-lg" position="bottom-right"
          />
        )}
      </ReactFlow>
      </div>
    </EdgeHoverContext.Provider>
  );
}
