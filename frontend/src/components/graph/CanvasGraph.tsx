'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
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

const nodeTypes: NodeTypes = {
  pipeline: PipelineNode,
};

const edgeTypes: EdgeTypes = {
  deletable: DeletableEdge,
};

const NODE_WIDTH = 64;
const NODE_HEIGHT = 64;

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
): Node[] {
  const sources = new Set(pipelineEdges.map((e) => e.source));
  return steps.map((step) => ({
    id: `step-${step.order}`,
    type: 'pipeline',
    position: positions.get(step.order) ?? { x: step.order * 260, y: 0 },
    draggable: editable,
    data: {
      targetCsc: step.targetCsc, productLevel: step.productLevel, status: step.status,
      order: step.order, durationMs: step.durationMs, errorMessage: step.errorMessage,
      editable, isLeaf: !sources.has(step.order), onDelete: onDeleteNode, onAddAfter,
    } satisfies PipelineNodeData,
  }));
}

function buildEdges(
  steps: PipelineStep[],
  pipelineEdges: PipelineEdge[],
  editable: boolean,
  onDeleteEdge?: (sourceOrder: number, targetOrder: number) => void,
  onInsertNode?: (afterOrder: number, beforeOrder?: number) => void,
  onHoverStay?: () => void,
  onHoverLeave?: () => void,
): Edge[] {
  const stepMap = new Map(steps.map((s) => [s.order, s]));
  return pipelineEdges.map(({ source, target }) => {
    const srcStep = stepMap.get(source);
    const tgtStep = stepMap.get(target);
    const completed = srcStep?.status === 'COMPLETED';
    const running = tgtStep?.status === 'RUNNING';
    const stroke = completed ? '#10b981' : running ? '#3b82f6' : '#cbd5e1';
    const edgeId = `e-${source}-${target}`;
    return {
      id: edgeId,
      source: `step-${source}`,
      target: `step-${target}`,
      type: 'deletable',
      selectable: false,
      animated: running,
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

interface CanvasGraphProps {
  pipelineId?: string | null;
  steps: PipelineStep[];
  pipelineEdges: PipelineEdge[];
  editable?: boolean;
  onNodeClick?: (stepOrder: number) => void;
  onDeleteNode?: (order: number) => void;
  onAddNode?: (afterOrder: number, beforeOrder?: number) => void;
  onConnect?: (sourceOrder: number, targetOrder: number) => void;
  onDeleteEdge?: (sourceOrder: number, targetOrder: number) => void;
}

export default function CanvasGraph({ pipelineId, steps, pipelineEdges, editable = false, onNodeClick, onDeleteNode, onAddNode, onConnect: onConnectProp, onDeleteEdge }: CanvasGraphProps) {
  const positionsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPipelineIdRef = useRef<string | null | undefined>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const edgeLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Build nodes and edges WITHOUT hover dependency
  const pipelineNodes = buildNodes(steps, pipelineEdges, positionsRef.current, editable, onDeleteNode, onAddNode);
  const allEdges = buildEdges(steps, pipelineEdges, editable, onDeleteEdge, onAddNode, clearLeaveTimer, scheduleLeave);

  const [nodes, setNodes, onNodesChange] = useNodesState(pipelineNodes);
  const [edges, setEdges] = useEdgesState(allEdges);

  // Update nodes/edges only when pipeline data changes — NOT on hover
  useEffect(() => {
    setNodes(buildNodes(steps, pipelineEdges, positionsRef.current, editable, onDeleteNode, onAddNode));
    setEdges(buildEdges(steps, pipelineEdges, editable, onDeleteEdge, onAddNode, clearLeaveTimer, scheduleLeave));
  }, [steps, pipelineEdges, editable, onDeleteNode, onAddNode, onDeleteEdge, clearLeaveTimer, scheduleLeave, setNodes, setEdges]);

  const onInit = useCallback((instance: { fitView: () => void }) => {
    setTimeout(() => instance.fitView(), 100);
  }, []);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onNodeClick?.(parseInt(node.id.replace('step-', ''), 10));
  }, [onNodeClick]);

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
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange} onInit={onInit}
        onNodeClick={handleNodeClick} onNodeDragStop={handleNodeDragStop}
        onEdgeMouseEnter={handleEdgeMouseEnter} onEdgeMouseLeave={handleEdgeMouseLeave}
        onConnect={handleConnect}
        fitView proOptions={{ hideAttribution: true }}
        minZoom={0.2} maxZoom={2} className="bg-background"
        nodesDraggable={editable} nodesConnectable={editable} elementsSelectable
        snapToGrid snapGrid={[20, 20]}
        connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2 }}
        defaultEdgeOptions={{ style: { stroke: 'transparent', strokeWidth: 0 } }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
        <Controls showInteractive={false} position="bottom-left" className="!bg-card !border-border !shadow-lg [&>button]:!bg-muted [&>button]:!border-border [&>button]:!text-foreground" />
        <MiniMap
          nodeColor={(n) => { const d = n.data as PipelineNodeData; return d.status === 'COMPLETED' ? '#10b981' : d.status === 'RUNNING' ? '#3b82f6' : d.status === 'FAILED' ? '#ef4444' : '#334155'; }}
          maskColor="rgba(15, 23, 42, 0.8)" className="!bg-card/90 !border-border !rounded-lg" position="bottom-right"
        />
      </ReactFlow>
    </EdgeHoverContext.Provider>
  );
}
