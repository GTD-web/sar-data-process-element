'use client';

import { useState, useCallback, useEffect } from 'react';
import { X, Play, Loader, CheckCircle, ChevronRight, Check, Save, Antenna, SlidersHorizontal, HardDrive, Cpu, Layers, Compass, Map, Crosshair, Package, Database, FileInput as FileInputIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PipelineStepDefinition, SarStage, TargetCsc, ProcessingProfile } from '@/types/pipeline';
import {
  SAR_STAGE_LABELS, SAR_STAGE_TASKS, SAR_STAGE_DESCRIPTIONS, NODE_KIND_INFO, SAR_STAGE_TO_CSC,
  CSC_VT_SECONDS, MAX_RETRY_COUNT, RETRY_INTERVAL_LABELS, PRODUCT_LEVEL_LABELS, QUEUE_NAME,
} from '@/types/pipeline';
import JobInitEditPanel from './JobInitEditPanel';
import type { PipelineNodeKind, ProductLevel } from '@/types/pipeline';

/** 이전 노드 요약 정보 — INPUT 패널에 표시 */
export interface PrevNodeInfo {
  order: number;
  kind: PipelineNodeKind;
  sarStage?: SarStage;
  inputLevel?: ProductLevel;
  label: string;
  csc: string;
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

/** SAR 스테이지별 산출물 유형 (ICD 처리 CSC 인터페이스 기반) */
const SAR_STAGE_OUTPUT_TYPE: Record<SarStage, string> = {
  L0:  'HDF5 (L0 formatted)',
  L1A: 'GeoTIFF · SLC',
  L1B: 'GeoTIFF · GRD',
  L1C: 'GeoTIFF · RTC/GEC',
  L2A: 'GeoTIFF · MAP layers',
  L2B: 'GeoTIFF/GeoJSON · MSK, OBJ, CHG',
  L3:  'GeoTIFF · APP',
};

function formatVt(seconds: number): string {
  if (seconds >= 3600) return `${seconds.toLocaleString()} s (${seconds / 3600}h)`;
  return `${seconds.toLocaleString()} s (${seconds / 60}분)`;
}

/** TBC 상태 배지 */
function TbcBadge({ note }: { note?: string }) {
  return (
    <span className="inline-flex items-center text-[10px] bg-amber-500/10 text-amber-500 rounded px-1.5 py-0.5 shrink-0">
      TBC{note ? ` · ${note}` : ''}
    </span>
  );
}

/** 확정 상태 배지 */
function ConfirmedBadge({ note }: { note?: string }) {
  return (
    <span className="inline-flex items-center text-[10px] bg-accent/10 text-accent rounded px-1.5 py-0.5 shrink-0">
      확정{note ? ` · ${note}` : ''}
    </span>
  );
}

/** 설정 행 컴포넌트 */
function SettingRow({
  label, value, status, note,
}: {
  label: string;
  value: React.ReactNode;
  status?: 'confirmed' | 'tbc';
  note?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="text-foreground font-mono text-right truncate">{value}</span>
        {status === 'tbc' && <TbcBadge note={note} />}
        {status === 'confirmed' && note && <ConfirmedBadge note={note} />}
      </span>
    </div>
  );
}

/** 설정 섹션 헤더 */
function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</div>
      <div className="space-y-2 text-[12px]">{children}</div>
    </div>
  );
}

// ─── Mock data helpers ────────────────────────────────────────────────────────

type MockRecord = Record<string, string | number | boolean | string[]>;


const MOCK_SAR_OUTPUT: Record<SarStage, MockRecord> = {
  L0:  { output_path: '/nas/sar/l0/LX3_STRIP_20240312_L0.h5',   tasks_completed: 4, duration_s: 42,  status: 'SUCCESS' },
  L1A: { output_path: '/nas/sar/l1a/LX3_STRIP_20240312_SLC.tif',tasks_completed: 5, duration_s: 382, resolution_m: 1.5, status: 'SUCCESS' },
  L1B: { output_path: '/nas/sar/l1b/LX3_STRIP_20240312_GRD.tif',tasks_completed: 4, duration_s: 118, looks: 4, status: 'SUCCESS' },
  L1C: { output_path: '/nas/sar/l1c/LX3_STRIP_20240312_RTC.tif',tasks_completed: 4, duration_s: 213, dem_used: 'SRTM-30m', epsg: 32652, status: 'SUCCESS' },
  L2A: { output_path: '/nas/sar/l2a/LX3_STRIP_20240312_MAPS.tif',tasks_completed: 4, duration_s: 97, layers: ['incidence_angle', 'nesz', 'nlooks', 'layover_shadow'], status: 'SUCCESS' },
  L2B: { output_path: '/nas/sar/l2b/LX3_STRIP_20240312_ANALYSIS.tif', detections: 12, change_ratio: 0.03, duration_s: 177, status: 'SUCCESS' },
  L3:  { output_path: '/nas/sar/l3/LX3_STRIP_20240312_APP.tif', product_type: 'application', duration_s: 58, status: 'SUCCESS' },
};

function getMockOutput(step: PipelineStepDefinition): MockRecord {
  if (step.kind === 'SAR' && step.sarStage) return MOCK_SAR_OUTPUT[step.sarStage] ?? {};
  if (step.kind === 'TRIGGER') return {
    event: 'RAW_DATA_RECEIVED', raw_data_path: '/nas/sar/raw/LX3_STRIP_20240312_RAW.h5',
    satellite_id: 'Lumir-X3', mode: 'Stripmap', received_at: new Date().toISOString(),
    file_size_bytes: 2_147_483_648, checksum_ok: true,
  };
  if (step.kind === 'JOB_INIT') return {
    job_id: `JOB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    profile_id: step.jobInitConfig?.profileId ?? 'PROF-LX3-STRIP-HH',
    priority: step.jobInitConfig?.priority ?? 5,
    dag_node_count: 6, estimated_duration_s: 18_000, status: 'CREATED',
  };
  if (step.kind === 'CATALOG') return {
    stac_item_id: 'LX3-STRIP-20240312-001',
    catalog_url: '/catalog/items/LX3-STRIP-20240312-001',
    registered_at: new Date().toISOString(), product_count: 7, status: 'REGISTERED',
  };
  if (step.kind === 'FILE_INPUT') return {
    validated_path: '/nas/sar/raw/LX3_STRIP_20240312_RAW.h5',
    start_stage: 'L1A', job_context: 'PARTIAL_REPROCESS', status: 'VALIDATED',
  };
  return {};
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** 키-값 데이터를 코드 블록 스타일로 렌더링 */
function DataView({ data }: { data: MockRecord }) {
  return (
    <div className="font-mono text-[11px] leading-relaxed space-y-1 p-3">
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="flex gap-2 min-w-0">
          <span className="text-accent/70 shrink-0">{k}:</span>
          <span className="text-foreground/80 break-all">
            {Array.isArray(v) ? `[${v.join(', ')}]` : typeof v === 'boolean' ? String(v) : String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 태스크 목록 체크박스 표시 */
function TaskList({ allTasks, enabledTasks }: { allTasks: string[]; enabledTasks?: string[] }) {
  const active = enabledTasks ?? allTasks;
  return (
    <div className="space-y-1.5">
      {allTasks.map((task) => {
        const on = active.includes(task);
        return (
          <div key={task} className="flex items-center gap-2">
            <div className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0',
              on ? 'bg-accent/20 border-accent/50' : 'border-border',
            )}>
              {on && <div className="w-1.5 h-1.5 rounded-sm bg-accent" />}
            </div>
            <span className={cn('text-[11px]', on ? 'text-foreground' : 'text-muted-foreground/50')}>{task}</span>
          </div>
        );
      })}
    </div>
  );
}

/** kind + sarStage로 아이콘 컴포넌트 반환 */
function getNodeIcon(kind: PipelineNodeKind, sarStage?: SarStage): React.ElementType {
  if (kind === 'TRIGGER') return Antenna;
  if (kind === 'FILE_INPUT') return FileInputIcon;
  if (kind === 'JOB_INIT') return SlidersHorizontal;
  if (kind === 'CATALOG') return Database;
  if (kind === 'SAR' && sarStage) {
    const icons: Record<SarStage, React.ElementType> = {
      L0: HardDrive, L1A: Cpu, L1B: Layers, L1C: Compass, L2A: Map, L2B: Crosshair, L3: Package,
    };
    return icons[sarStage] ?? HardDrive;
  }
  return HardDrive;
}

/** 노드 종류별 아이콘 */
function NodeIcon({ step, size = 18 }: { step: PipelineStepDefinition; size?: number }) {
  const props = { size, className: 'text-accent' };
  if (step.kind === 'TRIGGER')    return <Antenna {...props} />;
  if (step.kind === 'FILE_INPUT') return <FileInputIcon {...props} />;
  if (step.kind === 'JOB_INIT')   return <SlidersHorizontal {...props} />;
  if (step.kind === 'CATALOG')    return <Database {...props} />;
  if (step.kind === 'SAR') {
    const icons: Record<SarStage, React.ElementType> = {
      L0: HardDrive, L1A: Cpu, L1B: Layers, L1C: Compass, L2A: Map, L2B: Crosshair, L3: Package,
    };
    const Icon = step.sarStage ? (icons[step.sarStage] ?? HardDrive) : HardDrive;
    return <Icon {...props} />;
  }
  return <HardDrive {...props} />;
}

function nodeLabel(step: PipelineStepDefinition): string {
  if (step.kind === 'TRIGGER')    return '원시 데이터 수신 트리거';
  if (step.kind === 'FILE_INPUT') return '결과 파일 입력';
  if (step.kind === 'JOB_INIT')   return '작업 초기화';
  if (step.kind === 'CATALOG')    return '카탈로그 등록';
  if (step.kind === 'SAR' && step.sarStage) return SAR_STAGE_LABELS[step.sarStage];
  return '노드';
}

function nodeCsc(step: PipelineStepDefinition): string {
  if (step.kind === 'TRIGGER')    return 'EI-01';
  if (step.kind === 'FILE_INPUT') return 'SI-07';
  if (step.kind === 'JOB_INIT')   return 'CSC-08.02';
  if (step.kind === 'CATALOG')    return 'CSC-07';
  if (step.kind === 'SAR' && step.sarStage) return SAR_STAGE_TO_CSC[step.sarStage];
  return '—';
}

/** 정보 행 컴포넌트 (Info 탭용) */
function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn('text-foreground text-right truncate', mono && 'font-mono text-[10px]')} title={value}>{value}</span>
    </div>
  );
}

/** 처리 프로세스 섹션 */
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

// ─── Main modal ───────────────────────────────────────────────────────────────

type ExecState = 'idle' | 'running' | 'done';
type ModalTab = 'info' | 'parameters' | 'settings';

const MODAL_TABS: { id: ModalTab; label: string }[] = [
  { id: 'info', label: 'Info' },
  { id: 'parameters', label: 'Parameters' },
  { id: 'settings', label: 'Settings' },
];

interface NodeDetailModalProps {
  step: PipelineStepDefinition;
  onClose: () => void;
  /** 노드 설정 저장 콜백 (SAR 태스크 토글, JOB_INIT 설정 등) */
  onSaveNode?: (step: PipelineStepDefinition) => void;
  /** JOB_INIT 편집용 — 처리 프로파일 목록 */
  availableProfiles?: ProcessingProfile[];
  /** JOB_INIT 편집용 — 위성 ID */
  satelliteId?: string;
  /** JOB_INIT 편집용 — 촬영 모드 */
  mode?: string;
  /** 이전 노드 정보 목록 (edges 기반으로 ConsolePage에서 계산) */
  prevNodes?: PrevNodeInfo[];
}

export default function NodeDetailModal({ step, onClose, onSaveNode, availableProfiles, satelliteId, mode, prevNodes }: NodeDetailModalProps) {
  const [execState, setExecState] = useState<ExecState>('idle');
  const [outputData, setOutputData] = useState<MockRecord | null>(null);
  const [activeTab, setActiveTab] = useState<ModalTab>('info');

  // ── SAR 태스크 편집 상태 ──
  const allTasks = step.kind === 'SAR' && step.sarStage ? SAR_STAGE_TASKS[step.sarStage] : [];
  const [editableTasks, setEditableTasks] = useState<string[]>(step.enabledTasks ?? allTasks);
  const [tasksDirty, setTasksDirty] = useState(false);

  useEffect(() => {
    setEditableTasks(step.enabledTasks ?? allTasks);
    setTasksDirty(false);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTask = useCallback((task: string) => {
    setEditableTasks((prev) => {
      if (prev.includes(task)) {
        if (prev.length === 1) return prev;
        return prev.filter((t) => t !== task);
      }
      return [...prev, task];
    });
    setTasksDirty(true);
  }, []);

  const handleSaveTasks = useCallback(() => {
    if (!onSaveNode) return;
    onSaveNode({
      ...step,
      enabledTasks: editableTasks.length < allTasks.length ? editableTasks : undefined,
    });
    setTasksDirty(false);
  }, [onSaveNode, step, editableTasks, allTasks]);

  const handleSaveJobInit = useCallback((updated: PipelineStepDefinition) => {
    onSaveNode?.(updated);
  }, [onSaveNode]);

  const description = step.kind === 'SAR' && step.sarStage
    ? SAR_STAGE_DESCRIPTIONS[step.sarStage]
    : NODE_KIND_INFO[step.kind]?.description ?? '';

  const handleExecute = useCallback(async () => {
    setExecState('running');
    setOutputData(null);
    await new Promise<void>((r) => setTimeout(r, 1400));
    setExecState('done');
    setOutputData(getMockOutput(step));
  }, [step]);

  // ESC 키로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isRunning = execState === 'running';
  const isDone = execState === 'done';

  return (
    /* 반투명 오버레이 — 클릭 시 닫기 */
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-8"
      onClick={onClose}
    >
    <div
      className="relative flex flex-col bg-background rounded-xl shadow-2xl border border-border overflow-hidden w-full h-full"
      role="dialog"
      aria-modal="true"
      aria-label={`${nodeLabel(step)} 노드 상세`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center gap-3 h-12 border-b border-border px-4 bg-card rounded-t-xl">
        <NodeIcon step={step} size={16} />
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold text-foreground">{nodeLabel(step)}</span>
          <span className="text-[10px] text-muted-foreground">{nodeCsc(step)}</span>
        </div>

        <div className="flex-1" />

        {/* Execute step */}
        <button
          type="button"
          disabled={isRunning}
          onClick={handleExecute}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all',
            'bg-destructive text-white hover:brightness-110 active:brightness-90',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          )}
        >
          {isRunning
            ? <><Loader className="w-3.5 h-3.5 animate-spin" /> 실행 중…</>
            : isDone
              ? <><CheckCircle className="w-3.5 h-3.5" /> 재실행</>
              : <><Play className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} /> Execute step</>
          }
        </button>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          title="닫기 (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Body: 3 columns ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* ── Left: INPUT — 이전 노드 참조 ── */}
        <div className="w-[30%] flex flex-col border-r border-border bg-background">
          <div className="shrink-0 px-4 py-2 border-b border-border">
            <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">INPUT</span>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {prevNodes && prevNodes.length > 0 ? (
              <div className="p-3 space-y-2">
                {prevNodes.map((prev) => {
                  const PrevIcon = getNodeIcon(prev.kind, prev.sarStage);
                  return (
                    <div
                      key={prev.order}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-muted/20"
                    >
                      <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                        <PrevIcon className="w-4 h-4 text-accent" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold text-foreground leading-tight truncate">{prev.label}</div>
                        <div className="text-[10px] text-muted-foreground">{prev.csc} · #{prev.order}</div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                    </div>
                  );
                })}
                <div className="pt-2 text-[10px] text-muted-foreground/50 leading-relaxed">
                  이전 노드의 출력이 이 노드의 입력으로 전달됩니다
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/60 px-6 text-center">
                <ChevronRight className="w-6 h-6 opacity-30" />
                <span className="text-[12px]">입력 없음</span>
                <span className="text-[11px] text-muted-foreground/40">이 노드는 외부 이벤트로 시작됩니다</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Center: Tabs ── */}
        <div className="flex-1 flex flex-col bg-card/50">
          {/* Flat tab bar */}
          <div className="shrink-0 flex items-center border-b border-border">
            {MODAL_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-1 h-9 text-[11px] font-medium border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'text-accent border-accent'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* ── Info 탭: 노드 개요 + 타입별 읽기 전용 정보 ── */}
            <div className={cn('px-5 py-4 space-y-4', activeTab !== 'info' && 'hidden')}>
              {/* Description */}
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">설명</div>
                <p className="text-[12px] text-foreground/80 leading-relaxed">{description}</p>
              </div>

              {/* TRIGGER info */}
              {step.kind === 'TRIGGER' && (
                <>
                  <div className="h-px bg-border" />
                  <div className="space-y-1.5 text-[11px]">
                    <InfoRow label="이벤트 유형" value="RAW_DATA_RECEIVED" />
                    <InfoRow label="제공자" value="위성 수신국 (EI-01)" />
                    <InfoRow label="큐" value={QUEUE_NAME.RECEPTION_EVENTS} />
                  </div>
                </>
              )}

              {/* FILE_INPUT info */}
              {step.kind === 'FILE_INPUT' && (
                <>
                  <div className="h-px bg-border" />
                  <div className="space-y-1.5 text-[11px]">
                    <InfoRow label="트리거 소스" value="PARTIAL_REPROCESS" />
                    <InfoRow label="입력 레벨" value={step.inputLevel ? PRODUCT_LEVEL_LABELS[step.inputLevel] : '—'} />
                    <InfoRow label="인터페이스" value="SI-07" />
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3 text-[10px] text-muted-foreground leading-relaxed">
                    OPS-06 부분 재처리 흐름. 운영자 또는 LIID가 CSC-09를 통해 재처리를 요청하면 CSC-08이 target_level 기반으로 DAG를 생성하고 해당 레벨부터 파이프라인을 재기동합니다.
                  </div>
                </>
              )}

              {/* JOB_INIT info */}
              {step.kind === 'JOB_INIT' && (
                <>
                  <div className="h-px bg-border" />
                  <div className="text-[11px] font-medium text-muted-foreground">처리 프로파일 설정</div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5 text-[11px]">
                    <InfoRow label="프로파일" value={step.jobInitConfig?.profileId ?? '미선택'} />
                    <InfoRow label="편파" value={step.jobInitConfig?.polarization || '—'} />
                    <InfoRow label="우선순위" value={`${step.jobInitConfig?.priority ?? 5}`} />
                    <InfoRow label="재시도 전략" value={step.jobInitConfig?.retryInterval ? RETRY_INTERVAL_LABELS[step.jobInitConfig.retryInterval] : '—'} />
                  </div>
                </>
              )}

              {/* SAR stage overview */}
              {step.kind === 'SAR' && step.sarStage && (
                <>
                  <div className="h-px bg-border" />
                  <div className="space-y-1.5 text-[11px]">
                    <InfoRow label="SAR 스테이지" value={step.sarStage} />
                    <InfoRow label="산출물 유형" value={SAR_STAGE_OUTPUT_TYPE[step.sarStage]} />
                    <InfoRow label="활성 태스크" value={`${(step.enabledTasks ?? allTasks).length}/${allTasks.length}`} />
                  </div>
                </>
              )}

              {/* CATALOG info */}
              {step.kind === 'CATALOG' && (
                <>
                  <div className="h-px bg-border" />
                  <div className="space-y-1.5 text-[11px]">
                    <InfoRow label="등록 대상" value="Level-1 / 2 / 3" />
                    <InfoRow label="큐" value={QUEUE_NAME.CATALOG_REGISTRATION} />
                  </div>
                </>
              )}

              {/* 처리 프로세스 */}
              <ProcessInfoSection kind={step.kind} />
            </div>

            {/* ── Parameters 탭 — 편집 가능 ── */}
            <div className={cn(activeTab !== 'parameters' && 'hidden')}>
              {/* SAR: 편집 가능한 태스크 토글 */}
              {step.kind === 'SAR' && allTasks.length > 0 && (
                <div className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Tasks ({editableTasks.length}/{allTasks.length})
                    </div>
                    {onSaveNode && tasksDirty && (
                      <button
                        type="button"
                        onClick={handleSaveTasks}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent text-accent-foreground text-[10px] font-semibold hover:bg-accent/80 transition-colors"
                      >
                        <Save className="w-3 h-3" />
                        적용
                      </button>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {allTasks.map((task) => {
                      const isEnabled = editableTasks.includes(task);
                      const isLast = editableTasks.length === 1 && isEnabled;
                      return (
                        <button
                          key={task}
                          type="button"
                          onClick={() => onSaveNode ? toggleTask(task) : undefined}
                          disabled={isLast || !onSaveNode}
                          className={cn(
                            'w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-md text-[11px] transition-colors',
                            isEnabled ? 'bg-accent/10 text-foreground' : 'bg-transparent text-muted-foreground/50 line-through',
                            isLast || !onSaveNode ? 'cursor-default' : 'hover:bg-muted/50 cursor-pointer',
                          )}
                          title={isLast ? '최소 1개 이상 선택해야 합니다' : undefined}
                        >
                          <span className={cn(
                            'w-3.5 h-3.5 rounded shrink-0 border flex items-center justify-center transition-colors',
                            isEnabled ? 'bg-accent border-accent' : 'bg-transparent border-muted-foreground/30',
                          )}>
                            {isEnabled && <Check className="w-2.5 h-2.5 text-accent-foreground" strokeWidth={3} />}
                          </span>
                          {task}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* JOB_INIT: 편집 패널 임베드 */}
              {step.kind === 'JOB_INIT' && onSaveNode && satelliteId && mode && availableProfiles ? (
                <JobInitEditPanel
                  step={step}
                  satelliteId={satelliteId}
                  mode={mode}
                  profiles={availableProfiles}
                  onSave={handleSaveJobInit}
                />
              ) : step.kind === 'JOB_INIT' && (
                <div className="px-5 py-4 space-y-2 text-[12px]">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">작업 초기화 설정</div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">처리 프로파일</span>
                    <span className={step.jobInitConfig?.profileId ? 'text-foreground' : 'text-amber-500'}>
                      {step.jobInitConfig?.profileId ?? '미선택'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">편파</span>
                    <span className="text-foreground">{step.jobInitConfig?.polarization || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">우선순위</span>
                    <span className="text-foreground">{step.jobInitConfig?.priority ?? 5}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">재시도 전략</span>
                    <span className="text-foreground">{step.jobInitConfig?.retryInterval ? RETRY_INTERVAL_LABELS[step.jobInitConfig.retryInterval] : '—'}</span>
                  </div>
                </div>
              )}

              {/* Non-SAR, Non-JOB_INIT: process list */}
              {step.kind !== 'SAR' && step.kind !== 'JOB_INIT' && NODE_KIND_INFO[step.kind]?.processes && (
                <div className="px-5 py-4">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">프로세스</div>
                  <div className="space-y-1.5">
                    {NODE_KIND_INFO[step.kind].processes.map((p) => (
                      <div key={p} className="flex items-center gap-2 text-[12px] text-foreground/80">
                        <div className="w-1 h-1 rounded-full bg-accent/60 shrink-0" />
                        {p}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 파라미터가 없는 노드 */}
              {step.kind !== 'SAR' && step.kind !== 'JOB_INIT' && !NODE_KIND_INFO[step.kind]?.processes && (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/60">
                  <span className="text-[12px]">이 노드에 추가 파라미터가 없습니다</span>
                </div>
              )}
            </div>

            {/* ── Settings 탭 ── */}
            <div className={cn('px-5 py-4 space-y-5', activeTab !== 'settings' && 'hidden')}>
              {/* ── 노드 정보 ── */}
              <SettingSection title="노드 정보">
                <SettingRow label="종류" value={step.kind} />
                {step.sarStage && <SettingRow label="SAR 스테이지" value={step.sarStage} />}
                <SettingRow label="CSC" value={nodeCsc(step)} />
                <SettingRow label="순서" value={`#${step.order}`} />
              </SettingSection>

              {/* ── TRIGGER ── */}
              {step.kind === 'TRIGGER' && (
                <SettingSection title="이벤트 소스">
                  <SettingRow label="이벤트 유형" value="RAW_DATA_RECEIVED" status="confirmed" />
                  <SettingRow label="제공자" value="위성 수신국 (EI-01)" status="confirmed" />
                  <SettingRow label="큐" value={QUEUE_NAME.RECEPTION_EVENTS} status="confirmed" />
                  <SettingRow label="체크섬" value="SHA-256" status="confirmed" />
                  <SettingRow label="스키마 버전" value="1.0" status="confirmed" />
                </SettingSection>
              )}

              {/* ── FILE_INPUT ── */}
              {step.kind === 'FILE_INPUT' && (
                <SettingSection title="부분 재처리 설정">
                  <SettingRow label="트리거 소스" value="PARTIAL_REPROCESS" status="confirmed" />
                  <SettingRow
                    label="입력 레벨"
                    value={step.inputLevel ? PRODUCT_LEVEL_LABELS[step.inputLevel] : '—'}
                    status={step.inputLevel ? 'confirmed' : undefined}
                  />
                  <SettingRow label="인터페이스" value="SI-07" status="tbc" note="ICD 5.4" />
                </SettingSection>
              )}

              {/* ── JOB_INIT ── */}
              {step.kind === 'JOB_INIT' && (
                <SettingSection title="작업 제한">
                  <SettingRow label="최대 재시도" value={`${MAX_RETRY_COUNT}회`} status="confirmed" note="ICD 3.5" />
                  <SettingRow
                    label="재시도 전략"
                    value={step.jobInitConfig?.retryInterval
                      ? RETRY_INTERVAL_LABELS[step.jobInitConfig.retryInterval]
                      : '—'}
                    status={step.jobInitConfig?.retryInterval ? 'confirmed' : 'tbc'}
                  />
                  <SettingRow
                    label="처리 기한"
                    value={step.jobInitConfig?.deadlineHours ? `${step.jobInitConfig.deadlineHours}h` : '—'}
                    status="tbc"
                    note="ICD 6.6"
                  />
                </SettingSection>
              )}

              {/* ── SAR ── */}
              {step.kind === 'SAR' && step.sarStage && (() => {
                const csc = nodeCsc(step);
                const vt = CSC_VT_SECONDS[csc as TargetCsc];
                return (
                  <SettingSection title={`실행 제한 (${csc})`}>
                    {vt !== undefined && (
                      <SettingRow
                        label="Visibility Timeout"
                        value={formatVt(vt)}
                        status="confirmed"
                        note="ICD 6.6"
                      />
                    )}
                    <SettingRow
                      label="산출물 유형"
                      value={SAR_STAGE_OUTPUT_TYPE[step.sarStage]}
                      status="confirmed"
                    />
                    <SettingRow label="우선순위" value="—" status="tbc" note="ICD 6.6" />
                    <SettingRow label="처리 기한" value="—" status="tbc" note="ICD 6.6" />
                    <SettingRow label="재시도 전략" value="—" status="tbc" note="ICD 3.5" />
                  </SettingSection>
                );
              })()}

              {/* ── CATALOG ── */}
              {step.kind === 'CATALOG' && (
                <SettingSection title="카탈로그 설정">
                  <SettingRow label="등록 대상 레벨" value="Level-1 / 2 / 3" status="confirmed" note="Level-0 제외" />
                  <SettingRow label="품질 검증 실행" value="—" status="tbc" note="SI-05" />
                  <SettingRow label="SI-05 인터페이스" value="TBC" status="tbc" note="ICD 2.3" />
                  <SettingRow label="큐" value={QUEUE_NAME.CATALOG_REGISTRATION} status="confirmed" />
                </SettingSection>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: OUTPUT ── */}
        <div className="w-[30%] flex flex-col border-l border-border bg-background">
          <div className="shrink-0 px-4 py-2 border-b border-border">
            <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">OUTPUT</span>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {isRunning && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <Loader className="w-6 h-6 animate-spin text-accent" />
                <span className="text-[12px]">실행 중…</span>
              </div>
            )}
            {isDone && outputData && (
              <div>
                <div className="flex items-center gap-1.5 px-3 pt-3 pb-1 text-[11px] text-success font-medium">
                  <CheckCircle className="w-3.5 h-3.5" />
                  실행 완료
                </div>
                <DataView data={outputData} />
              </div>
            )}
            {!isRunning && !isDone && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/60 px-6 text-center">
                <ChevronRight className="w-6 h-6 opacity-30 -scale-x-100" />
                <span className="text-[12px]">출력 데이터 없음</span>
                <button
                  type="button"
                  onClick={handleExecute}
                  className="mt-1 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-destructive text-white hover:brightness-110 transition-all flex items-center gap-1.5"
                >
                  <Play className="w-3 h-3" fill="currentColor" strokeWidth={0} />
                  Execute step
                </button>
                <span className="text-[10px] text-muted-foreground/40">또는 mock 데이터를 설정하세요</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
