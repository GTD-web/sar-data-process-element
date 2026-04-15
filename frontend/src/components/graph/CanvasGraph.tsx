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
  MarkerType,
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

/** Radial glow that covers all nodes, expanding with completion ratio */
function CanvasGlow({ completionRatio }: { completionRatio: number }) {
  const nodesFromStore = useStore((s) => s.nodes);
  const [px, py, zoom] = useStore((s) => s.transform);

  if (nodesFromStore.length === 0) return null;

  // Bounding box of all nodes in screen coordinates
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodesFromStore) {
    const sx = (n.position?.x ?? 0) * zoom + px;
    const sy = (n.position?.y ?? 0) * zoom + py;
    if (sx < minX) minX = sx;
    if (sy < minY) minY = sy;
    if (sx + NODE_WIDTH * zoom > maxX) maxX = sx + NODE_WIDTH * zoom;
    if (sy + NODE_HEIGHT * zoom > maxY) maxY = sy + NODE_HEIGHT * zoom;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;

  // Padding scales with completion: 150px base → +250px at 100%
  const padding = 150 + completionRatio * 250;
  const radiusX = bboxW / 2 + padding;
  const radiusY = bboxH / 2 + padding;

  const glowOpacity = 0.06 + completionRatio * 0.09; // 0.06 → 0.15

  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none', zIndex: 0,
        background: `radial-gradient(${radiusX}px ${radiusY}px at ${cx}px ${cy}px, rgba(52,211,153,${glowOpacity}) 0%, rgba(52,211,153,${glowOpacity * 0.4}) 50%, transparent 100%)`,
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
      draggable: editable && !isEntryNode,
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
    return {
      id: edgeId,
      source: `step-${source}`,
      target: `step-${target}`,
      type: 'deletable',
      selectable: false,
      animated: running,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: stroke,
        width: 20,
        height: 20,
      },
      data: {
        stroke, strokeWidth: 2, animated: running, editable,
        sourceOrder: source, targetOrder: target,
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
  nodesRef.current = nodes;

  useEffect(() => {
    if (trigger === 0) return;
    // trigger가 변경된 시점의 nodes를 사용 (nodes 자체를 deps에 넣으면 nodes 변경마다 재실행됨)
    const entryNode = nodesRef.current.find((n) => (n.data as PipelineNodeData).isHead === true);
    if (!entryNode) return;
    const cx = entryNode.position.x + NODE_WIDTH / 2;
    const cy = entryNode.position.y + NODE_HEIGHT / 2;
    // 레이아웃이 확정된 직후에 실행
    const id = window.setTimeout(() => {
      setCenter(cx, cy, { zoom: 1.5, duration: 600 });
    }, 120);
    return () => window.clearTimeout(id);
  }, [trigger, setCenter]); // nodes 제거 — nodes가 deps에 있으면 폴링/업데이트마다 재실행됨

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
  const positionsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPipelineIdRef = useRef<string | null | undefined>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const edgeLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Glow intensity scales with completion ratio
  const completionRatio = useMemo(() => {
    if (steps.length === 0) return 0;
    return steps.filter((s) => s.status === 'COMPLETED').length / steps.length;
  }, [steps]);

  const pipelineChanged = pipelineId !== lastPipelineIdRef.current;
  if (pipelineChanged) {
    lastPipelineIdRef.current = pipelineId;
    positionsRef.current = computeInitialPositions(steps, pipelineEdges);
  } else if (positionsRef.current.size === 0) {
    positionsRef.current = computeInitialPositions(steps, pipelineEdges);
  } else {
    for (const step of steps) {
      if (!positionsRef.current.has(step.order)) {
        const inEdge = pipelineEdges.find((e) => e.target === step.order);
        const outEdge = pipelineEdges.find((e) => e.source === step.order);
        const srcPos = inEdge ? positionsRef.current.get(inEdge.source) : null;
        const tgtPos = outEdge ? positionsRef.current.get(outEdge.target) : null;

        if (srcPos && tgtPos) {
          // Place at the midpoint between source and target — no shifting
          positionsRef.current.set(step.order, {
            x: (srcPos.x + tgtPos.x) / 2,
            y: (srcPos.y + tgtPos.y) / 2,
          });
        } else if (srcPos) {
          const siblings = pipelineEdges.filter((e) => e.source === inEdge!.source);
          const branchIdx = siblings.findIndex((e) => e.target === step.order);
          positionsRef.current.set(step.order, { x: srcPos.x + 200, y: srcPos.y + branchIdx * 130 });
        } else {
          positionsRef.current.set(step.order, { x: step.order * 200, y: 0 });
        }
      }
    }
    for (const order of positionsRef.current.keys()) {
      if (!steps.find((s) => s.order === order)) positionsRef.current.delete(order);
    }
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
  const pipelineNodes = buildNodes(steps, pipelineEdges, positionsRef.current, editable, onDeleteNode, onAddNode, onTrigger, jobInitWarningReason, handleExecuteStep, disabledNodeOrders, onToggleNodeActive, onReprocessStep, isJobMode);
  const allEdges = buildEdges(steps, pipelineEdges, editable, onDeleteEdge, onAddNode, clearLeaveTimer, scheduleLeave, isJobMode);

  const [nodes, setNodes, onNodesChange] = useNodesState(pipelineNodes);
  const [edges, setEdges] = useEdgesState(allEdges);

  // Update nodes/edges only when pipeline data changes — NOT on hover
  useEffect(() => {
    setNodes(buildNodes(steps, pipelineEdges, positionsRef.current, editable, onDeleteNode, onAddNode, onTrigger, jobInitWarningReason, handleExecuteStep, disabledNodeOrders, onToggleNodeActive, onReprocessStep, isJobMode));
    setEdges(buildEdges(steps, pipelineEdges, editable, onDeleteEdge, onAddNode, clearLeaveTimer, scheduleLeave, isJobMode));
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
    positionsRef.current.set(parseInt(node.id.replace('step-', ''), 10), { ...node.position });
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
