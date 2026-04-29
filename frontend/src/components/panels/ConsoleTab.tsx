'use client';

import type { PipelineStepDefinition, JobDetail, SarStage, PipelineNodeKind, ProcessingProfileSummary, ProcessingProfile, ProductLevel, TriggerSource } from '@/types/pipeline';
import { TRIGGER_SOURCE_LABELS, MAX_RETRY_COUNT, RETRY_INTERVAL_LABELS, NODE_KIND_INFO } from '@/types/pipeline';
import NodeEditPanel from './NodeEditPanel';
import AddStepPanel from './AddStepPanel';
import JobDetailPanel from './JobDetailPanel';
import JobInitEditPanel from './JobInitEditPanel';
import { MousePointer, Antenna, SlidersHorizontal, FileInput, Power } from 'lucide-react';
import { formatKST } from '@/lib/utils';

export type ConsoleMode =
  | { type: 'idle' }
  | { type: 'node'; step: PipelineStepDefinition }
  | { type: 'addStep'; afterOrder: number; beforeOrder?: number; asSeparateStart?: boolean }
  | { type: 'job'; job: JobDetail }
  | { type: 'trigger'; receivedAt: string; rawDataPath: string }
  | { type: 'jobInit'; processingProfile?: ProcessingProfileSummary; jobCreatedAt?: string; priority?: number; triggerSource?: TriggerSource }
  | { type: 'jobInitEdit'; step: PipelineStepDefinition; satelliteId: string; mode: string }
  | { type: 'fileInput'; inputLevel: ProductLevel }
  | { type: 'nodeBypass'; step: PipelineStepDefinition };

interface ConsoleTabProps {
  mode: ConsoleMode;
  onSaveNode: (step: PipelineStepDefinition) => void;
  onDeleteNode: (order: number) => void;
  onConfirmAddStep: (afterOrder: number, kind: PipelineNodeKind, sarStage?: SarStage) => void;
  onReprocessJob: () => void;
  onPartialReprocess: (sarStage: SarStage) => void;
  onCancelJob: () => void;
  availableProfiles: ProcessingProfile[];
  onStepClick?: (stepOrder: number, clickY: number) => void;
  activeStepOrder?: number | null;
}

export default function ConsoleTab({
  mode,
  onSaveNode,
  onDeleteNode,
  onConfirmAddStep,
  onReprocessJob,
  onPartialReprocess,
  onCancelJob,
  availableProfiles,
  onStepClick,
  activeStepOrder,
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
        asSeparateStart={mode.asSeparateStart}
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
        onStepClick={onStepClick}
        activeStepOrder={activeStepOrder}
      />
    );
  }

  // CSU-08.02: JOB_INIT 노드 편집 패널 (파이프라인 편집 모드)
  if (mode.type === 'jobInitEdit') {
    return (
      <JobInitEditPanel
        key={mode.step.order}
        step={mode.step}
        satelliteId={mode.satelliteId}
        mode={mode.mode}
        profiles={availableProfiles}
        onSave={onSaveNode}
      />
    );
  }

  // CSU-08.02: JOB_INIT 노드 클릭 패널 (Job 선택 시 읽기전용)
  if (mode.type === 'jobInit') {
    const hasData = !!mode.processingProfile;
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <SlidersHorizontal className="w-4 h-4 text-accent flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">Job Initialization</span>
        </div>
        <div className="text-[11px] text-muted-foreground">CSU-08.02 · Job creation + profile selection</div>
        <div className="h-px bg-border" />

        {hasData ? (
          <>
            <div className="space-y-1.5 text-[11px]">
              <TriggerInfoRow label="Created At" value={mode.jobCreatedAt ? formatKST(mode.jobCreatedAt) : '—'} />
              {mode.triggerSource && (
                <TriggerInfoRow label="Trigger Source" value={TRIGGER_SOURCE_LABELS[mode.triggerSource]} />
              )}
              {mode.priority !== undefined && (
                <TriggerInfoRow label="Priority" value={`${mode.priority} / 10`} />
              )}
            </div>
            <div className="h-px bg-border" />
            <div className="text-[11px] font-medium text-muted-foreground">Processing Profile</div>
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5 text-[11px]">
              <TriggerInfoRow label="Profile ID" value={mode.processingProfile!.id} mono />
              <TriggerInfoRow label="Name" value={mode.processingProfile!.name} />
              <TriggerInfoRow label="Mode" value={mode.processingProfile!.mode ?? 'Unassigned'} />
              <TriggerInfoRow label="Polarization" value={mode.processingProfile!.polarization ?? 'Unassigned'} />
              {mode.processingProfile!.description && (
                <TriggerInfoRow label="Description" value={mode.processingProfile!.description} />
              )}
            </div>
            <div className="h-px bg-border" />
            <div className="text-[11px] font-medium text-muted-foreground">Retry Policy</div>
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5 text-[11px]">
              <TriggerInfoRow label="Max Retries" value={`${MAX_RETRY_COUNT}`} />
              <TriggerInfoRow label="Retry Interval" value={RETRY_INTERVAL_LABELS.IMMEDIATE} />
            </div>
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground/60">Select a job to view profile information.</p>
        )}
        <ProcessInfoSection kind="JOB_INIT" />
      </div>
    );
  }

  // FILE_INPUT 노드 클릭 패널 (SI-07 부분 재처리)
  if (mode.type === 'fileInput') {
    const LEVEL_LABELS: Record<ProductLevel, { label: string; fromDesc: string; startsAt: string }> = {
      LEVEL_1: { label: 'L1 Result Input', fromDesc: 'L1 processing result (CSC-04 output)', startsAt: 'Process from L2A' },
      LEVEL_2: { label: 'L2 Result Input', fromDesc: 'L2 processing result (CSC-05 output)', startsAt: 'Process from L3' },
      LEVEL_0: { label: 'L0 Result Input', fromDesc: 'L0 processing result (CSC-03 output)', startsAt: 'Process from L1A' },
      LEVEL_3: { label: 'L3 Result Input', fromDesc: 'L3 processing result (CSC-06 output)', startsAt: 'Registration only' },
    };
    const info = LEVEL_LABELS[mode.inputLevel];
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <FileInput className="w-4 h-4 text-accent flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">{info.label}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">SI-07 · Partial Reprocessing Trigger</div>
        <div className="h-px bg-border" />
        <div className="space-y-1.5 text-[11px]">
          <TriggerInfoRow label="Input Source" value={info.fromDesc} />
          <TriggerInfoRow label="Starts At" value={info.startsAt} />
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-3 text-[10px] text-muted-foreground leading-relaxed">
          OPS-06 partial reprocessing flow. When an operator or LIID requests reprocessing via CSC-09, CSC-08 generates a DAG based on target_level and restarts the pipeline from that level.
        </div>
        <ProcessInfoSection kind="FILE_INPUT" />
      </div>
    );
  }

  // D-01: TRIGGER 노드 클릭 패널
  if (mode.type === 'trigger') {
    const hasData = mode.receivedAt !== '—';
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Antenna className="w-4 h-4 text-accent flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">Raw Data Reception Trigger</span>
        </div>
        <div className="text-[11px] text-muted-foreground">EI-01 · RAW_DATA_RECEIVED Trigger</div>
        <div className="h-px bg-border" />
        <div className="space-y-1.5 text-[11px]">
          <TriggerInfoRow label="Received At" value={hasData ? formatKST(mode.receivedAt) : '—'} />
          <TriggerInfoRow label="Raw Data Path" value={mode.rawDataPath} mono />
        </div>
        {!hasData && (
          <p className="text-[10px] text-muted-foreground/60">Select a job to view reception info.</p>
        )}
        <ProcessInfoSection kind="TRIGGER" />
      </div>
    );
  }

  // 바이패스 노드 클릭 패널
  if (mode.type === 'nodeBypass') {
    const BYPASS_LABELS: Record<string, string> = {
      TRIGGER: 'Raw Data Reception Trigger',
      FILE_INPUT: 'Result File Input',
      JOB_INIT: 'Job Initialization',
      SAR: mode.step.sarStage ?? 'SAR Processing',
      CATALOG: 'Catalog Registration',
    };
    const nodeLabel = BYPASS_LABELS[mode.step.kind] ?? mode.step.kind;
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Power className="w-4 h-4 text-muted-foreground/60 flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">Bypassed</span>
        </div>
        <div className="text-[11px] text-muted-foreground">{nodeLabel} · Disabled</div>
        <div className="h-px bg-border" />
        <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/10 p-3 space-y-2 text-[11px] text-muted-foreground leading-relaxed">
          <p>This node is currently <span className="font-semibold text-foreground/70">bypassed</span>.</p>
          <p>The pipeline will skip this processing stage and continue to the next node.</p>
          <p className="text-[10px]">Hover over the node and click the Power button to re-enable it.</p>
        </div>
        <ProcessInfoSection kind={mode.step.kind} />
      </div>
    );
  }

  // Idle
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
      <MousePointer className="w-8 h-8 text-muted-foreground/50" />
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Double-click a node on the canvas</p>
        <p className="text-xs text-muted-foreground">to open the detail settings modal</p>
      </div>
    </div>
  );
}

function TriggerInfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-foreground text-right truncate ${mono ? 'font-mono text-[10px]' : ''}`} title={value}>{value}</span>
    </div>
  );
}

function ProcessInfoSection({ kind }: { kind: string }) {
  const info = NODE_KIND_INFO[kind];
  if (!info) return null;
  return (
    <>
      <div className="h-px bg-border" />
      <div className="text-[11px] font-medium text-muted-foreground">Processes</div>
      <ul className="space-y-1.5">
        {info.processes.map((p) => (
          <li key={p} className="flex items-start gap-2 text-[11px] text-foreground/80">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-accent shrink-0" />
            {p}
          </li>
        ))}
      </ul>
    </>
  );
}
