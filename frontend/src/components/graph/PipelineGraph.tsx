'use client';

import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { PipelineNode, type PipelineNodeData } from './PipelineNode';
import { SmoothEdge } from './SmoothEdge';
import type { PipelineStep } from '@/types/pipeline';
import * as t from '@/styles/design-tokens';

const nodeTypes: NodeTypes = {
  pipeline: PipelineNode,
};

const edgeTypes: EdgeTypes = {
  smooth: SmoothEdge,
};

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

function getLayoutedElements(steps: PipelineStep[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100 });

  // Reception node
  g.setNode('reception', { width: NODE_WIDTH, height: NODE_HEIGHT });

  // Step nodes
  for (const step of steps) {
    g.setNode(`step-${step.order}`, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  // Edges: reception → step1 → step2 → ...
  g.setEdge('reception', 'step-1');
  for (let i = 1; i < steps.length; i++) {
    g.setEdge(`step-${i}`, `step-${i + 1}`);
  }

  dagre.layout(g);

  const receptionPos = g.node('reception');
  const nodes: Node[] = [
    {
      id: 'reception',
      type: 'pipeline',
      position: { x: receptionPos.x - NODE_WIDTH / 2, y: receptionPos.y - NODE_HEIGHT / 2 },
      data: {
        targetCsc: 'CSC-02',
        productLevel: 'LEVEL_0',
        status: steps.length > 0 && steps[0].status !== 'PENDING' ? 'COMPLETED' : 'PENDING',
        order: 0,
        label: 'RAW DATA',
      } satisfies PipelineNodeData,
    },
  ];

  for (const step of steps) {
    const pos = g.node(`step-${step.order}`);
    nodes.push({
      id: `step-${step.order}`,
      type: 'pipeline',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: {
        targetCsc: step.targetCsc,
        productLevel: step.productLevel,
        status: step.status,
        order: step.order,
        durationMs: step.durationMs,
        errorMessage: step.errorMessage,
      } satisfies PipelineNodeData,
    });
  }

  const edges: Edge[] = [
    {
      id: 'e-reception-1',
      source: 'reception',
      target: 'step-1',
      type: 'smooth',
      animated: steps[0]?.status === 'RUNNING',
      style: { stroke: steps[0]?.status === 'COMPLETED' ? t.edgeSuccess : t.edge },
    },
  ];

  for (let i = 1; i < steps.length; i++) {
    const completed = steps[i - 1].status === 'COMPLETED';
    const running = steps[i].status === 'RUNNING';
    edges.push({
      id: `e-${i}-${i + 1}`,
      source: `step-${i}`,
      target: `step-${i + 1}`,
      type: 'smooth',
      animated: running,
      style: { stroke: completed ? t.edgeSuccess : t.edge },
    });
  }

  return { nodes, edges };
}

export default function PipelineGraph({ steps }: { steps: PipelineStep[] }) {
  const { nodes, edges } = useMemo(() => getLayoutedElements(steps), [steps]);

  const onInit = useCallback((instance: { fitView: () => void }) => {
    setTimeout(() => instance.fitView(), 100);
  }, []);

  return (
    <div className="h-[350px] bg-card rounded-lg border border-border overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={onInit}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={4}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={t.canvasDot} />
        <Controls
          showInteractive={false}
          className="!bg-card !border-border !shadow-none [&>button]:!bg-muted [&>button]:!border-border [&>button]:!text-foreground"
        />
        <MiniMap
          nodeColor={t.nodeDefault}
          maskColor="rgba(26, 26, 26, 0.8)"
          className="!bg-card !border-border"
        />
      </ReactFlow>
    </div>
  );
}
