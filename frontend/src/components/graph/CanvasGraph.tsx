'use client';

import { useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type NodeTypes,
  type Connection,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { PipelineNode, type PipelineNodeData } from './PipelineNode';
import { AddNodeButton, type AddNodeButtonData } from './AddNodeButton';
import type { PipelineStep, PipelineEdge } from '@/types/pipeline';

const nodeTypes: NodeTypes = {
  pipeline: PipelineNode,
  addButton: AddNodeButton,
};

const NODE_WIDTH = 64;
const NODE_HEIGHT = 64;
const ADD_BTN_SIZE = 32;

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

function buildNodes(steps: PipelineStep[], positions: Map<number, { x: number; y: number }>, editable: boolean, onDeleteNode?: (order: number) => void): Node[] {
  return steps.map((step) => ({
    id: `step-${step.order}`,
    type: 'pipeline',
    position: positions.get(step.order) ?? { x: step.order * 260, y: 0 },
    draggable: editable,
    data: {
      targetCsc: step.targetCsc, productLevel: step.productLevel, status: step.status,
      order: step.order, durationMs: step.durationMs, errorMessage: step.errorMessage,
      editable, onDelete: onDeleteNode,
    } satisfies PipelineNodeData,
  }));
}

function buildAddButtons(steps: PipelineStep[], pipelineEdges: PipelineEdge[], positions: Map<number, { x: number; y: number }>, onAddNode: (afterOrder: number) => void): Node[] {
  const buttons: Node[] = [];
  const pairs = pipelineEdges;

  // Button on each edge midpoint
  for (const { source, target } of pairs) {
    const srcPos = positions.get(source);
    const tgtPos = positions.get(target);
    if (srcPos && tgtPos) {
      buttons.push({
        id: `add-${source}-${target}`,
        type: 'addButton',
        position: {
          x: (srcPos.x + NODE_WIDTH + tgtPos.x) / 2 - ADD_BTN_SIZE / 2,
          y: (srcPos.y + tgtPos.y) / 2 + NODE_HEIGHT / 2 - ADD_BTN_SIZE / 2,
        },
        draggable: false, selectable: false,
        data: { insertAfterOrder: source, onAdd: onAddNode } satisfies AddNodeButtonData,
      });
    }
  }

  // After leaf nodes (nodes with no outgoing edge)
  const sources = new Set(pairs.map((p) => p.source));
  const leaves = steps.filter((s) => !sources.has(s.order));
  for (const leaf of leaves) {
    const pos = positions.get(leaf.order);
    if (pos) {
      buttons.push({
        id: `add-after-${leaf.order}`,
        type: 'addButton',
        position: { x: pos.x + NODE_WIDTH + 40, y: pos.y + NODE_HEIGHT / 2 - ADD_BTN_SIZE / 2 },
        draggable: false, selectable: false,
        data: { insertAfterOrder: leaf.order, onAdd: onAddNode } satisfies AddNodeButtonData,
      });
    }
  }

  return buttons;
}

function buildEdges(steps: PipelineStep[], pipelineEdges: PipelineEdge[]): Edge[] {
  const stepMap = new Map(steps.map((s) => [s.order, s]));
  return pipelineEdges.map(({ source, target }) => {
    const srcStep = stepMap.get(source);
    const tgtStep = stepMap.get(target);
    const completed = srcStep?.status === 'COMPLETED';
    const running = tgtStep?.status === 'RUNNING';
    return {
      id: `e-${source}-${target}`,
      source: `step-${source}`,
      target: `step-${target}`,
      animated: running,
      style: { stroke: completed ? '#10b981' : running ? '#3b82f6' : '#334155', strokeWidth: 2 },
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
  onAddNode?: (afterOrder: number) => void;
  onConnect?: (sourceOrder: number, targetOrder: number) => void;
}

export default function CanvasGraph({ pipelineId, steps, pipelineEdges, editable = false, onNodeClick, onDeleteNode, onAddNode, onConnect: onConnectProp }: CanvasGraphProps) {
  const positionsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPipelineIdRef = useRef<string | null | undefined>(null);

  const pipelineChanged = pipelineId !== lastPipelineIdRef.current;
  if (pipelineChanged) {
    lastPipelineIdRef.current = pipelineId;
    positionsRef.current = computeInitialPositions(steps, pipelineEdges);
  } else if (positionsRef.current.size === 0) {
    positionsRef.current = computeInitialPositions(steps, pipelineEdges);
  } else {
    // Position new steps that don't have a position yet
    for (const step of steps) {
      if (!positionsRef.current.has(step.order)) {
        // Find a parent via edges
        const parentEdge = pipelineEdges.find((e) => e.target === step.order);
        const parentPos = parentEdge ? positionsRef.current.get(parentEdge.source) : null;
        if (parentPos) {
          const siblings = pipelineEdges.filter((e) => e.source === parentEdge!.source);
          const branchIdx = siblings.findIndex((e) => e.target === step.order);
          positionsRef.current.set(step.order, {
            x: parentPos.x + 200,
            y: parentPos.y + branchIdx * 130,
          });
        } else {
          positionsRef.current.set(step.order, { x: step.order * 200, y: 0 });
        }
      }
    }
    for (const order of positionsRef.current.keys()) {
      if (!steps.find((s) => s.order === order)) positionsRef.current.delete(order);
    }
  }

  const pipelineNodes = buildNodes(steps, positionsRef.current, editable, onDeleteNode);
  const addButtons = editable && onAddNode ? buildAddButtons(steps, pipelineEdges, positionsRef.current, onAddNode) : [];
  const allEdges = buildEdges(steps, pipelineEdges);

  const [nodes, setNodes, onNodesChange] = useNodesState([...pipelineNodes, ...addButtons]);
  const [edges, setEdges] = useEdgesState(allEdges);

  useEffect(() => {
    const pNodes = buildNodes(steps, positionsRef.current, editable, onDeleteNode);
    const aButtons = editable && onAddNode ? buildAddButtons(steps, pipelineEdges, positionsRef.current, onAddNode) : [];
    setNodes([...pNodes, ...aButtons]);
    setEdges(buildEdges(steps, pipelineEdges));
  }, [steps, pipelineEdges, editable, onDeleteNode, onAddNode, setNodes, setEdges]);

  const onInit = useCallback((instance: { fitView: () => void }) => {
    setTimeout(() => instance.fitView(), 100);
  }, []);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'addButton') return;
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

  const handleNodeDragStop = useCallback((_event: React.MouseEvent, node: Node) => {
    if (!node.id.startsWith('step-')) return;
    positionsRef.current.set(parseInt(node.id.replace('step-', ''), 10), { ...node.position });
    if (editable && onAddNode) {
      setNodes((prev) => [
        ...prev.filter((n) => !n.id.startsWith('add-')),
        ...buildAddButtons(steps, pipelineEdges, positionsRef.current, onAddNode),
      ]);
    }
  }, [editable, onAddNode, steps, pipelineEdges, setNodes]);

  return (
    <ReactFlow
      nodes={nodes} edges={edges} nodeTypes={nodeTypes}
      onNodesChange={onNodesChange} onInit={onInit}
      onNodeClick={handleNodeClick} onNodeDragStop={handleNodeDragStop}
      onConnect={handleConnect}
      fitView proOptions={{ hideAttribution: true }}
      minZoom={0.2} maxZoom={2} className="bg-background"
      nodesDraggable={editable} nodesConnectable={editable} elementsSelectable
      connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2 }}
      defaultEdgeOptions={{ style: { stroke: '#334155', strokeWidth: 2 } }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e293b" />
      <Controls showInteractive={false} position="bottom-left" className="!bg-card !border-border !shadow-lg [&>button]:!bg-muted [&>button]:!border-border [&>button]:!text-foreground" />
      <MiniMap
        nodeColor={(n) => { if (n.type === 'addButton') return 'transparent'; const d = n.data as PipelineNodeData; return d.status === 'COMPLETED' ? '#10b981' : d.status === 'RUNNING' ? '#3b82f6' : d.status === 'FAILED' ? '#ef4444' : '#334155'; }}
        maskColor="rgba(15, 23, 42, 0.8)" className="!bg-card/90 !border-border !rounded-lg" position="bottom-right"
      />
    </ReactFlow>
  );
}
