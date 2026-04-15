'use client';

import type { PipelineDefinition, PipelineStepDefinition, JobDetail, SarStage, PipelineNodeKind, ProcessingProfileSummary, ProcessingProfile, ProductLevel, TriggerSource } from '@/types/pipeline';
import { TRIGGER_SOURCE_LABELS, MAX_RETRY_COUNT, RETRY_INTERVAL_LABELS, NODE_KIND_INFO } from '@/types/pipeline';
import NodeEditPanel from './NodeEditPanel';
import AddStepPanel from './AddStepPanel';
import JobDetailPanel from './JobDetailPanel';
import PipelineEditPanel from './PipelineEditPanel';
import JobInitEditPanel from './JobInitEditPanel';
import { MousePointer, Antenna, SlidersHorizontal, FileInput, Power } from 'lucide-react';
import { formatKST } from '@/lib/utils';

export type ConsoleMode =
  | { type: 'idle' }
  | { type: 'node'; step: PipelineStepDefinition }
  | { type: 'addStep'; afterOrder: number; beforeOrder?: number }
  | { type: 'job'; job: JobDetail }
  | { type: 'pipelineProps'; pipeline: PipelineDefinition }
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
  onSavePipeline: (data: { name: string; satelliteId: string; mode: string; steps: { kind: PipelineNodeKind; sarStage?: SarStage }[] }) => void;
  pipelineSaving: boolean;
  availableProfiles: ProcessingProfile[];
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
  availableProfiles,
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
          <span className="text-sm font-semibold text-foreground">작업 초기화</span>
        </div>
        <div className="text-[11px] text-muted-foreground">CSU-08.02 · 작업 생성 + 처리 프로파일 선택</div>
        <div className="h-px bg-border" />

        {hasData ? (
          <>
            <div className="space-y-1.5 text-[11px]">
              <TriggerInfoRow label="작업 생성" value={mode.jobCreatedAt ? formatKST(mode.jobCreatedAt) : '—'} />
              {mode.triggerSource && (
                <TriggerInfoRow label="트리거 소스" value={TRIGGER_SOURCE_LABELS[mode.triggerSource]} />
              )}
              {mode.priority !== undefined && (
                <TriggerInfoRow label="우선순위" value={`${mode.priority} / 10`} />
              )}
            </div>
            <div className="h-px bg-border" />
            <div className="text-[11px] font-medium text-muted-foreground">처리 프로파일</div>
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5 text-[11px]">
              <TriggerInfoRow label="프로파일 ID" value={mode.processingProfile!.id} mono />
              <TriggerInfoRow label="이름" value={mode.processingProfile!.name} />
              <TriggerInfoRow label="모드" value={mode.processingProfile!.mode} />
              <TriggerInfoRow label="편파" value={mode.processingProfile!.polarization} />
              {mode.processingProfile!.description && (
                <TriggerInfoRow label="설명" value={mode.processingProfile!.description} />
              )}
            </div>
            <div className="h-px bg-border" />
            <div className="text-[11px] font-medium text-muted-foreground">재시도 정책</div>
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5 text-[11px]">
              <TriggerInfoRow label="최대 재시도" value={`${MAX_RETRY_COUNT}회`} />
              <TriggerInfoRow label="재시도 간격" value={RETRY_INTERVAL_LABELS.IMMEDIATE} />
            </div>
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground/60">Job을 선택하면 프로파일 정보가 표시됩니다.</p>
        )}
        <ProcessInfoSection kind="JOB_INIT" />
      </div>
    );
  }

  // FILE_INPUT 노드 클릭 패널 (SI-07 부분 재처리)
  if (mode.type === 'fileInput') {
    const LEVEL_LABELS: Record<ProductLevel, { label: string; fromDesc: string; startsAt: string }> = {
      LEVEL_1: { label: 'L1 결과 입력', fromDesc: 'L1 처리 결과 (CSC-04 산출물)', startsAt: 'L2A부터 처리' },
      LEVEL_2: { label: 'L2 결과 입력', fromDesc: 'L2 처리 결과 (CSC-05 산출물)', startsAt: 'L3부터 처리' },
      LEVEL_0: { label: 'L0 결과 입력', fromDesc: 'L0 처리 결과 (CSC-03 산출물)', startsAt: 'L1A부터 처리' },
      LEVEL_3: { label: 'L3 결과 입력', fromDesc: 'L3 처리 결과 (CSC-06 산출물)', startsAt: '등록만 처리' },
    };
    const info = LEVEL_LABELS[mode.inputLevel];
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <FileInput className="w-4 h-4 text-accent flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">{info.label}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">SI-07 · 부분 재처리 트리거</div>
        <div className="h-px bg-border" />
        <div className="space-y-1.5 text-[11px]">
          <TriggerInfoRow label="입력 소스" value={info.fromDesc} />
          <TriggerInfoRow label="처리 시작" value={info.startsAt} />
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-3 text-[10px] text-muted-foreground leading-relaxed">
          OPS-06 부분 재처리 흐름. 운영자 또는 LIID가 CSC-09를 통해 재처리를 요청하면 CSC-08이 target_level 기반으로 DAG를 생성하고 해당 레벨부터 파이프라인을 재기동합니다.
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
          <span className="text-sm font-semibold text-foreground">원시 데이터 수신 트리거</span>
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
        <ProcessInfoSection kind="TRIGGER" />
      </div>
    );
  }

  // 바이패스 노드 클릭 패널
  if (mode.type === 'nodeBypass') {
    const BYPASS_LABELS: Record<string, string> = {
      TRIGGER: '원시 데이터 수신 트리거',
      FILE_INPUT: '결과 파일 입력',
      JOB_INIT: '작업 초기화',
      SAR: mode.step.sarStage ?? 'SAR 처리',
      CATALOG: '카탈로그 등록',
    };
    const nodeLabel = BYPASS_LABELS[mode.step.kind] ?? mode.step.kind;
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Power className="w-4 h-4 text-muted-foreground/60 flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">바이패스됨</span>
        </div>
        <div className="text-[11px] text-muted-foreground">{nodeLabel} · 비활성화</div>
        <div className="h-px bg-border" />
        <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/10 p-3 space-y-2 text-[11px] text-muted-foreground leading-relaxed">
          <p>이 노드는 현재 <span className="font-semibold text-foreground/70">바이패스 상태</span>입니다.</p>
          <p>파이프라인 실행 시 이 처리 단계를 건너뛰고 다음 노드로 진행합니다.</p>
          <p className="text-[10px]">노드 위에 마우스를 올리고 Power 버튼을 클릭하면 다시 활성화할 수 있습니다.</p>
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
        <p className="text-xs text-muted-foreground">캔버스에서 노드를 더블 클릭하면</p>
        <p className="text-xs text-muted-foreground">상세 설정 모달이 열립니다</p>
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
      <div className="text-[11px] font-medium text-muted-foreground">처리 프로세스</div>
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
