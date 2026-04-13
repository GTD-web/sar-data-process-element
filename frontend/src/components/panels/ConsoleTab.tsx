'use client';

import type { PipelineDefinition, PipelineStepDefinition, JobDetail, TargetCsc, ProductLevel } from '@/types/pipeline';
import NodeEditPanel from './NodeEditPanel';
import AddStepPanel from './AddStepPanel';
import JobDetailPanel from './JobDetailPanel';
import PipelineEditPanel from './PipelineEditPanel';
import { GitBranch, MousePointer } from 'lucide-react';

export type ConsoleMode =
  | { type: 'idle' }
  | { type: 'node'; step: PipelineStepDefinition }
  | { type: 'addStep'; afterOrder: number }
  | { type: 'job'; job: JobDetail }
  | { type: 'pipelineProps'; pipeline: PipelineDefinition };

interface ConsoleTabProps {
  mode: ConsoleMode;
  onSaveNode: (step: PipelineStepDefinition) => void;
  onDeleteNode: (order: number) => void;
  onConfirmAddStep: (afterOrder: number, csc: TargetCsc, level: ProductLevel) => void;
  onReprocessJob: () => void;
  onCancelJob: () => void;
  onSavePipeline: (data: { name: string; satelliteId: string; mode: string; steps: { targetCsc: TargetCsc; productLevel: ProductLevel }[] }) => void;
  pipelineSaving: boolean;
}

export default function ConsoleTab({
  mode,
  onSaveNode,
  onDeleteNode,
  onConfirmAddStep,
  onReprocessJob,
  onCancelJob,
  onSavePipeline,
  pipelineSaving,
}: ConsoleTabProps) {
  if (mode.type === 'node') {
    return (
      <NodeEditPanel
        key={mode.step.order}
        step={mode.step}
        onSave={onSaveNode}
        onDelete={() => onDeleteNode(mode.step.order)}
      />
    );
  }

  if (mode.type === 'addStep') {
    return (
      <AddStepPanel
        insertAfterOrder={mode.afterOrder}
        onSelect={onConfirmAddStep}
      />
    );
  }

  if (mode.type === 'job') {
    return (
      <JobDetailPanel
        job={mode.job}
        onReprocess={onReprocessJob}
        onCancel={onCancelJob}
      />
    );
  }

  if (mode.type === 'pipelineProps') {
    return (
      <PipelineEditPanel
        key={mode.pipeline.id}
        pipeline={mode.pipeline}
        onSave={onSavePipeline}
        saving={pipelineSaving}
      />
    );
  }

  // Idle
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
      <MousePointer className="w-8 h-8 text-muted-foreground/50" />
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">캔버스에서 노드를 클릭하면</p>
        <p className="text-xs text-muted-foreground">여기에 속성이 표시됩니다</p>
      </div>
    </div>
  );
}
