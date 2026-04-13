'use client';

import type { PipelineDefinition, PipelineStepDefinition, JobDetail, TargetCsc, ProductLevel } from '@/types/pipeline';
import NodeEditPanel from './NodeEditPanel';
import AddStepPanel from './AddStepPanel';
import JobDetailPanel from './JobDetailPanel';
import PipelineEditPanel from './PipelineEditPanel';
import { MousePointer, Antenna } from 'lucide-react';
import { formatKST } from '@/lib/utils';

export type ConsoleMode =
  | { type: 'idle' }
  | { type: 'node'; step: PipelineStepDefinition }
  | { type: 'addStep'; afterOrder: number; beforeOrder?: number }
  | { type: 'job'; job: JobDetail }
  | { type: 'pipelineProps'; pipeline: PipelineDefinition }
  | { type: 'trigger'; receivedAt: string; rawDataPath: string };

interface ConsoleTabProps {
  mode: ConsoleMode;
  onSaveNode: (step: PipelineStepDefinition) => void;
  onDeleteNode: (order: number) => void;
  onConfirmAddStep: (afterOrder: number, csc: TargetCsc, level: ProductLevel) => void;
  onReprocessJob: () => void;
  onPartialReprocess: (targetLevel: ProductLevel) => void;
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
  onPartialReprocess,
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
        insertBeforeOrder={mode.beforeOrder}
        onSelect={onConfirmAddStep}
      />
    );
  }

  if (mode.type === 'job') {
    return (
      <JobDetailPanel
        job={mode.job}
        onReprocess={onReprocessJob}
        onPartialReprocess={onPartialReprocess}
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

  // D-01: TRIGGER 노드 클릭 패널
  if (mode.type === 'trigger') {
    const hasData = mode.receivedAt !== '—';
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Antenna className="w-4 h-4 text-accent flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">원시 데이터 수신</span>
        </div>
        <div className="text-[11px] text-muted-foreground">EI-01 · RAW_DATA_RECEIVED 트리거</div>
        <div className="h-px bg-border" />
        <div className="space-y-1.5 text-[11px]">
          <TriggerInfoRow label="수신 시각" value={hasData ? formatKST(mode.receivedAt) : '—'} />
          <TriggerInfoRow label="Raw 데이터 경로" value={mode.rawDataPath} mono />
        </div>
        {!hasData && (
          <p className="text-[10px] text-muted-foreground/60">Job을 선택하면 수신 정보가 표시됩니다.</p>
        )}
      </div>
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

function TriggerInfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      <span className={`text-foreground text-right truncate ${mono ? 'font-mono text-[10px]' : ''}`} title={value}>{value}</span>
    </div>
  );
}
