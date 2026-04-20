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
import { PipelineNode, type PipelineNodeData } from './PipelineNode';
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

/** Per-node radial glow — each node gets its own soft halo so the background lights up evenly */
function CanvasGlow({ completionRatio }: { completionRatio: number }) {
  const nodesFromStore = useStore((s) => s.nodes);
  const [px, py, zoom] = useStore((s) => s.transform);

  if (nodesFromStore.length === 0) return null;

  // Per-node glow radius scales with completion: 110px base → +90px at 100%
  const radius = (110 + completionRatio * 90) * zoom;
  // Per-node opacity also scales with completion: 0.10 → 0.20
  const glowOpacity = 0.10 + completionRatio * 0.10;
  const greenInner = `rgba(52,211,153,${glowOpacity})`;
  const greenMid = `rgba(52,211,153,${(glowOpacity * 0.4).toFixed(3)})`;
  // FAILED nodes get a red halo at a fixed, slightly stronger intensity so they stand out
  const redInner = `rgba(239,68,68,0.18)`;
  const redMid = `rgba(239,68,68,0.07)`;

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
        inner = greenInner;
        mid = greenMid;
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
): Node[] {
  const sources = new Set(pipelineEdges.map((e) => e.source));
  const targets = new Set(pipelineEdges.map((e) => e.target));
  return steps.map((step) => {
    const isEntryNode = step.kind === 'TRIGGER' || step.kind === 'FILE_INPUT';
    const warningReason = step.kind === 'JOB_INIT' && jobInitWarningReason ? jobInitWarningReason : undefined;
    return {
      id: `step-${step.order}`,
      type: 'pipeline',
      position: positions.get(step.order) ?? { x: step.order * 260, y: 0 },
      draggable: editable,
      data: {
        kind: step.kind,
        sarStage: step.sarStage,
        inputLevel: step.inputLevel,
        status: step.status,
        order: step.order, durationMs: step.durationMs, errorMessage: step.errorMessage,
        enabledTasks: step.enabledTasks,
        editable, isLeaf: !sources.has(step.order), isHead: !targets.has(step.order),
        onDelete: onDeleteNode, onAddAfter,
        onTrigger: isEntryNode ? onTrigger : undefined,
        onExecuteStep,
        warningReason,
        enabled: !disabledNodeOrders?.has(step.order),
        onToggleActive: isEntryNode ? undefined : onToggleNodeActive,
        onReprocess: step.kind === 'SAR' && onReprocessStep ? onReprocessStep : undefined,
        isJobMode,
      } satisfies PipelineNodeData,
    };
  });
}

function buildEdges(
  steps: PipelineStep[],
  pipelineEdges: PipelineEdge[],
  editable: boolean,
  onDeleteEdge?: (sourceOrder: number, targetOrder: number) => void,
  onInsertNode?: (afterOrder: number, beforeOrder?: number) => void,
  onHoverStay?: () => void,
  onHoverLeave?: () => void,
  isJobMode?: boolean,
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
    const dimmed = srcFailed || tgtCanceled || tgtPendingInJob;
    const stroke = dimmed
      ? t.nodeDefault
      : completed ? t.edgeSuccess : running ? t.accent : t.edge;
    const edgeId = `e-${source}-${target}`;
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
}

export default function CanvasGraph({ pipelineId, steps, pipelineEdges, editable = false, onNodeClick, onDeleteNode, onAddNode, onConnect: onConnectProp, onDeleteEdge, onTrigger, jobInitWarningReason, focusEntryTrigger = 0, onNodeOpenDetail, disabledNodeOrders, onToggleNodeActive, onReprocessStep, isJobMode }: CanvasGraphProps) {
  // 노드 위치는 드래그로 누적되는 사용자 편집 상태이므로 state로 유지.
  // 파이프라인 전환·스텝 추가/삭제 시에는 React 권장 "렌더 중 상태 조정" 패턴으로
  // prop 변화를 감지해 한 번만 재동기화한다.
  const [positions, setPositions] = useState<Map<number, { x: number; y: number }>>(() => new Map());
  const [syncedPipelineId, setSyncedPipelineId] = useState<string | null | undefined>(null);
  const stepsKey = useMemo(() => steps.map((s) => s.order).sort((a, b) => a - b).join(','), [steps]);
  const [syncedStepsKey, setSyncedStepsKey] = useState<string>('');
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const edgeLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Glow intensity scales with completion ratio
  const completionRatio = useMemo(() => {
    if (steps.length === 0) return 0;
    return steps.filter((s) => s.status === 'COMPLETED').length / steps.length;
  }, [steps]);

  if (pipelineId !== syncedPipelineId) {
    setSyncedPipelineId(pipelineId);
    setSyncedStepsKey(stepsKey);
    setPositions(computeInitialPositions(steps, pipelineEdges));
  } else if (stepsKey !== syncedStepsKey) {
    setSyncedStepsKey(stepsKey);
    setPositions((prev) => {
      const next = prev.size === 0 ? computeInitialPositions(steps, pipelineEdges) : new Map(prev);
      for (const step of steps) {
        if (!next.has(step.order)) {
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
          } else {
            next.set(step.order, { x: step.order * 200, y: 0 });
          }
        }
      }
      for (const order of next.keys()) {
        if (!steps.find((s) => s.order === order)) next.delete(order);
      }
      return next;
    });
  }

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
  const pipelineNodes = buildNodes(steps, pipelineEdges, positions, editable, onDeleteNode, onAddNode, onTrigger, jobInitWarningReason, handleExecuteStep, disabledNodeOrders, onToggleNodeActive, onReprocessStep, isJobMode);
  const allEdges = buildEdges(steps, pipelineEdges, editable, onDeleteEdge, onAddNode, clearLeaveTimer, scheduleLeave, isJobMode);

  const [nodes, setNodes, onNodesChange] = useNodesState(pipelineNodes);
  const [edges, setEdges] = useEdgesState(allEdges);

  // Update nodes/edges only when pipeline data changes — NOT on hover
  // positions는 deps에서 제외: 드래그로 positions만 바뀔 때는 ReactFlow가 내부적으로 위치를 관리하므로
  // setNodes를 다시 호출할 필요 없음 (effect는 최신 positions를 closure로 캡처).
  useEffect(() => {
    setNodes(buildNodes(steps, pipelineEdges, positions, editable, onDeleteNode, onAddNode, onTrigger, jobInitWarningReason, handleExecuteStep, disabledNodeOrders, onToggleNodeActive, onReprocessStep, isJobMode));
    setEdges(buildEdges(steps, pipelineEdges, editable, onDeleteEdge, onAddNode, clearLeaveTimer, scheduleLeave, isJobMode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, pipelineEdges, editable, onDeleteNode, onAddNode, onDeleteEdge, onTrigger, jobInitWarningReason, clearLeaveTimer, scheduleLeave, setNodes, setEdges, handleExecuteStep, disabledNodeOrders, onToggleNodeActive, onReprocessStep, isJobMode]);

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
        <CanvasGlow completionRatio={completionRatio} />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={t.canvasDot} />
        <Controls showInteractive={false} position="bottom-left" className="!bg-card !border-border !shadow-lg [&>button]:!bg-muted [&>button]:!border-border [&>button]:!text-foreground" />
        <MiniMap
          nodeColor={(n) => { const d = n.data as PipelineNodeData; return d.status === 'COMPLETED' ? t.success : d.status === 'RUNNING' ? t.accent : d.status === 'FAILED' ? t.accent : t.nodeDefault; }}
          maskColor="rgba(26, 26, 26, 0.8)" className="!bg-card/90 !border-border !rounded-lg" position="bottom-right"
        />
      </ReactFlow>
      </div>
    </EdgeHoverContext.Provider>
  );
}
