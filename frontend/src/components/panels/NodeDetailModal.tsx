'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { X, Play, Loader, CheckCircle, ChevronRight, Antenna, SlidersHorizontal, HardDrive, Cpu, Layers, Compass, Map as MapIcon, Crosshair, Package, Database, FileInput as FileInputIcon, Image as ImageIcon, Upload, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PipelineStepDefinition, SarStage, TargetCsc, ProcessingProfile } from '@/types/pipeline';
import {
  resolveSarStage,
  uploadH5,
  uploadBundle,
  executeStageStream,
  type ExecuteResponse,
  type UploadProgress,
} from '@/services/sar-execution.client';
import {
  SAR_STAGE_LABELS, SAR_STAGE_TASKS, SAR_STAGE_DESCRIPTIONS, NODE_KIND_INFO, SAR_STAGE_TO_CSC, l1bSubStageTasks,
  CSC_VT_SECONDS, MAX_RETRY_COUNT, RETRY_INTERVAL_LABELS, PRODUCT_LEVEL_LABELS, QUEUE_NAME,
} from '@/types/pipeline';
import JobInitEditPanel from './JobInitEditPanel';
import NodeCodeEditorPanel from './NodeCodeEditorPanel';
import CatalogConfigPanel from './CatalogConfigPanel';
import L1BSubStageEditor from './L1BSubStageEditor';
import NodeExecutionTerminal, { type RenderedLogLine } from './NodeExecutionTerminal';
import { getStageLogScript } from './node-execution-logs';
import { getDefaultCode, getL1BSubStageCode, isTaskActiveInCode, TASK_KEYWORDS_BY_STAGE } from './node-code-defaults';
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
  L1C: 'GeoTIFF · GTC/GEC',
  L2A: 'GeoTIFF · MAP layers',
  L2B: 'GeoTIFF/GeoJSON · MSK, OBJ, CHG',
  L3:  'GeoTIFF · APP',
};

function formatVt(seconds: number): string {
  if (seconds >= 3600) return `${seconds.toLocaleString()} s (${seconds / 3600}h)`;
  return `${seconds.toLocaleString()} s (${seconds / 60} min)`;
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
      Confirmed{note ? ` · ${note}` : ''}
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
  L1C: { output_path: '/nas/sar/l1c/LX3_STRIP_20240312_GTC.tif',tasks_completed: 4, duration_s: 213, dem_used: 'SRTM-30m', epsg: 32652, status: 'SUCCESS' },
  L2A: { output_path: '/nas/sar/l2a/LX3_STRIP_20240312_MAPS.tif',tasks_completed: 4, duration_s: 97, layers: ['incidence_angle', 'nesz', 'nlooks', 'layover_shadow'], status: 'SUCCESS' },
  L2B: { output_path: '/nas/sar/l2b/LX3_STRIP_20240312_ANALYSIS.tif', detections: 12, change_ratio: 0.03, duration_s: 177, status: 'SUCCESS' },
  L3:  { output_path: '/nas/sar/l3/LX3_STRIP_20240312_APP.tif', product_type: 'application', duration_s: 58, status: 'SUCCESS' },
};

function getMockOutput(step: PipelineStepDefinition): MockRecord {
  if (step.kind === 'SAR' && step.sarStage) return MOCK_SAR_OUTPUT[step.sarStage] ?? {};
  if (step.kind === 'TRIGGER') return {
    event: 'RAW_DATA_RECEIVED', raw_data_path: '/nas/sar/raw/LX3_STRIP_20240312_RAW.h5',
    satellite_id: 'LumirX-3', mode: 'Stripmap', received_at: new Date().toISOString(),
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

/** kind + sarStage로 아이콘 컴포넌트 반환 */
function getNodeIcon(kind: PipelineNodeKind, sarStage?: SarStage): React.ElementType {
  if (kind === 'TRIGGER') return Antenna;
  if (kind === 'FILE_INPUT') return FileInputIcon;
  if (kind === 'JOB_INIT') return SlidersHorizontal;
  if (kind === 'CATALOG') return Database;
  if (kind === 'THUMBNAIL') return ImageIcon;
  if (kind === 'SAR' && sarStage) {
    const icons: Record<SarStage, React.ElementType> = {
      L0: HardDrive, L1A: Cpu, L1B: Layers, L1C: Compass, L2A: MapIcon, L2B: Crosshair, L3: Package,
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
  if (step.kind === 'THUMBNAIL')  return <ImageIcon {...props} />;
  if (step.kind === 'SAR') {
    const icons: Record<SarStage, React.ElementType> = {
      L0: HardDrive, L1A: Cpu, L1B: Layers, L1C: Compass, L2A: MapIcon, L2B: Crosshair, L3: Package,
    };
    const Icon = step.sarStage ? (icons[step.sarStage] ?? HardDrive) : HardDrive;
    return <Icon {...props} />;
  }
  return <HardDrive {...props} />;
}

function nodeLabel(step: PipelineStepDefinition): string {
  if (step.kind === 'TRIGGER')    return 'Raw Data Reception Trigger';
  if (step.kind === 'FILE_INPUT') return 'Result File Input';
  if (step.kind === 'JOB_INIT')   return 'Job Initialization';
  if (step.kind === 'CATALOG')    return 'Catalog Registration';
  if (step.kind === 'THUMBNAIL')  return 'Quick-look Generation';
  if (step.kind === 'SAR' && step.sarStage) return SAR_STAGE_LABELS[step.sarStage];
  return 'Node';
}

function nodeCsc(step: PipelineStepDefinition): string {
  if (step.kind === 'TRIGGER')    return 'EI-01';
  if (step.kind === 'FILE_INPUT') return 'SI-07';
  if (step.kind === 'JOB_INIT')   return 'CSU-08.02';
  if (step.kind === 'CATALOG')    return 'CSC-07';
  if (step.kind === 'THUMBNAIL')  return 'CSU-07.06';
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

// ─── Main modal ───────────────────────────────────────────────────────────────

type ExecState = 'idle' | 'running' | 'done';
type ModalTab = 'info' | 'parameters';

const MODAL_TABS: { id: ModalTab; label: string }[] = [
  { id: 'info', label: 'Info' },
  { id: 'parameters', label: 'Parameters' },
];

/** L0 / L1x / L2x / L3 SAR 노드 사용자 코드 업로드/편집 가능 */
function supportsCodeEditor(step: PipelineStepDefinition): boolean {
  if (step.kind !== 'SAR' || !step.sarStage) return false;
  return (
    step.sarStage === 'L0'
    || step.sarStage === 'L3'
    || step.sarStage.startsWith('L1')
    || step.sarStage.startsWith('L2')
  );
}

/**
 * 모달이 닫혀도 부모(ConsolePage) 가 마지막 실행 결과를 들고 있을 수 있게 하는 캐시 페이로드.
 * 모달은 mount 시 cachedOutput 이 있으면 곧바로 'done' 상태로 hydrate 한다 — 사용자가
 * 같은 노드를 다시 열면 직전 OUTPUT (터미널 로그 + QuickLook + 파일 목록) 이 그대로 보인다.
 */
export interface CachedSarOutput {
  logLines: RenderedLogLine[];
  runResult: Pick<ExecuteResponse, 'runId' | 'stage' | 'exitCode' | 'args' | 'primary' | 'meta' | 'files'> | null;
  runError: string | null;
  elapsedMs: number;
}

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
  /** 직전 SAR 실행의 runId (체이닝용). 없으면 이 노드는 시작 노드 (업로드 필요). */
  prevRunId?: string;
  /**
   * 직전 FILE_INPUT(L0) 노드에서 업로드된 H5 의 uploadId. L1A 모달이 이 값을 받으면
   * 자체 업로드 UI 대신 "Pipeline Input 에서 받은 입력" 으로 처리한다.
   */
  prevUploadId?: string;
  /** prevUploadId 로 전달된 H5 파일명 (표시용). */
  prevUploadFilename?: string;
  /** prevUploadId 로 전달된 H5 파일 크기 (표시용). */
  prevUploadSizeBytes?: number;
  /** SAR stage 실제 실행 완료 시 부모(ConsolePage) 가 runId 보관하도록 호출. */
  onSarRunComplete?: (stepOrder: number, runId: string) => void;
  /**
   * FILE_INPUT 노드 업로드 완료 시 부모에 알리는 콜백. 부모는 uploadId 를
   * 보관해 두었다가 downstream L1A 모달에 prevUploadId 로 전달한다.
   */
  onFileInputUploadComplete?: (stepOrder: number, uploadId: string, filename: string, sizeBytes: number) => void;
  /** 이 노드의 직전 실행 결과 캐시 (모달 close/open 사이에 살아남기 위함). */
  cachedOutput?: CachedSarOutput;
  /** 실행이 끝났을 때 부모에 결과를 캐시하라고 알리는 콜백. */
  onSarOutputUpdate?: (stepOrder: number, output: CachedSarOutput) => void;
}

export default function NodeDetailModal({ step, onClose, onSaveNode, availableProfiles, satelliteId, mode, prevNodes, prevRunId, prevUploadId, prevUploadFilename, prevUploadSizeBytes, onSarRunComplete, onFileInputUploadComplete, cachedOutput, onSarOutputUpdate }: NodeDetailModalProps) {
  // cachedOutput 이 있으면 모달이 열리는 즉시 'done' 상태로 hydrate — 직전 결과 보전.
  const [execState, setExecState] = useState<ExecState>(cachedOutput ? 'done' : 'idle');
  const [outputData, setOutputData] = useState<MockRecord | null>(null);
  const [activeTab, setActiveTab] = useState<ModalTab>('info');
  const [logLines, setLogLines] = useState<RenderedLogLine[]>(cachedOutput?.logLines ?? []);
  const [elapsedMs, setElapsedMs] = useState(cachedOutput?.elapsedMs ?? 0);
  const execTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 최신 logLines 를 done 핸들러에서 stale 없이 캡쳐하기 위한 ref. 갱신은 항상
  // functional setLogLines 콜백 안에서 next 값 그대로 대입 — React 의 auto-batching
  // 과 별도 useEffect 동기화가 stream 중간 라인을 덮어쓰지 않게.
  const logLinesRef = useRef<RenderedLogLine[]>(cachedOutput?.logLines ?? []);

  // ── 실제 SAR 실행 상태 (시연용) ─────────────────────────────────────────────
  // prevUploadId 가 있으면 (FILE_INPUT 에서 받은 업로드를 그대로 사용) 곧바로 'done' 상태로 시작.
  // L1A 모달은 자체 업로드 UI 대신 "Pipeline Input 에서 받은 입력" 카드를 노출하고 바로 실행 가능.
  const initialUploadedFile = useMemo<File | null>(
    () => (prevUploadId && prevUploadFilename
      ? new File([], prevUploadFilename, { type: 'application/x-hdf' })
      : null),
    // size 는 표시용으로만 쓰이므로 별도 state 로 추적 (File 객체에 임의 size 주입 불가)
    [prevUploadId, prevUploadFilename],
  );
  const [uploadedFile, setUploadedFile] = useState<File | null>(initialUploadedFile);
  const [uploadId, setUploadId] = useState<string | null>(prevUploadId ?? null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>(
    prevUploadId ? 'done' : 'idle',
  );
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** 드래그 중 시각 피드백 */
  const [isDragging, setIsDragging] = useState(false);
  // 실행 결과는 SSE 'done' 이벤트로 채워진다 (stdout/stderr 는 stream 으로 logLines 에 쌓임).
  const [runResult, setRunResult] = useState<Pick<ExecuteResponse, 'runId' | 'stage' | 'exitCode' | 'args' | 'primary' | 'meta' | 'files'> | null>(cachedOutput?.runResult ?? null);
  const [runError, setRunError] = useState<string | null>(cachedOutput?.runError ?? null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * 이 SAR 노드의 백엔드 stage id + 실행 params (sub-stage 반영).
   * 매핑 안 되면 null → mock fallback.
   */
  const resolvedStage = useMemo(() => {
    if (step.kind !== 'SAR' || !step.sarStage) return null;
    return resolveSarStage(step.sarStage, step.sarSubStage);
  }, [step.kind, step.sarStage, step.sarSubStage]);
  const sarStageId = resolvedStage?.id ?? null;

  /**
   * 시작 SAR 노드 (직전 run 없음) 분기:
   * - L1A 는 H5 raw 를 직접 업로드받는다.
   * - L1B (multilook/speckle) 는 기본적으로 prevRun (L1A 산출) 을 input 으로 받지만,
   *   "Upload file" 토글로 사용자가 직접 SLC/MLD TIFF (+XML) 를 올려서 prev run 을
   *   대체할 수도 있다.
   */
  const isL1bStage = sarStageId === 'L1B_MULTILOOK' || sarStageId === 'L1B_SPECKLE';
  /**
   * H5 raw 업로드 패널 노출 조건:
   * - L1A 시작 노드: 직전 run 이 없을 때.
   * - FILE_INPUT(LEVEL_0): Pipeline Input 으로서 H5 를 받아 downstream L1A 가 쓰도록.
   * prevUploadId 가 있어도 (L1A 가 FILE_INPUT 에서 받은 입력을 그대로 쓸 때) 동일 패널을 노출
   * — 이미 "uploaded" 상태로 표시되어 사용자에게 Replace 옵션도 함께 제공된다.
   */
  const isFileInputL0 = step.kind === 'FILE_INPUT' && step.inputLevel === 'LEVEL_0';
  const needsH5Upload = (sarStageId === 'L1A' && !prevRunId) || isFileInputL0;

  /**
   * L1B INPUT mode 토글.
   * - 'upstream' : prevRun (chain) — 가능할 때만 default.
   * - 'upload'   : 사용자가 SLC/MLD TIFF (+XML) 직접 업로드.
   * 다른 stage 노드면 의미 없음.
   */
  const [l1bInputMode, setL1bInputMode] = useState<'upstream' | 'upload'>(
    prevRunId ? 'upstream' : 'upload',
  );
  /** L1B upload 모드 — bundle 업로드 상태/결과. uploadedBundleRunId 가 inputRunId 로 쓰임. */
  const [bundleSlc, setBundleSlc] = useState<File | null>(null);
  const [bundleMeta, setBundleMeta] = useState<File | null>(null);
  const [bundleStatus, setBundleStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [bundleProgress, setBundleProgress] = useState<UploadProgress | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [uploadedBundleRunId, setUploadedBundleRunId] = useState<string | null>(null);
  const bundleSlcInputRef = useRef<HTMLInputElement | null>(null);
  const bundleMetaInputRef = useRef<HTMLInputElement | null>(null);

  /** multilook 은 XML 필수, speckle 은 SLC(=MLD TIFF) 단독. */
  const bundleRequiresMeta = sarStageId === 'L1B_MULTILOOK';

  /**
   * Execute 활성화 조건.
   * - L1A: 업로드가 끝나야 활성.
   * - L1B / upstream 모드: prevRunId 있으면 활성.
   * - L1B / upload 모드: bundle 업로드 완료 → uploadedBundleRunId 가 있으면 활성.
   */
  const canRunReal =
    sarStageId !== null &&
    (
      (sarStageId === 'L1A' && uploadStatus === 'done' && uploadId !== null) ||
      (isL1bStage && l1bInputMode === 'upstream' && prevRunId !== undefined) ||
      (isL1bStage && l1bInputMode === 'upload' && uploadedBundleRunId !== null)
    );
  /** execute 호출 시 사용할 inputRunId — upstream 이면 prev, upload 면 uploaded bundle. */
  const effectiveInputRunId =
    isL1bStage && l1bInputMode === 'upload' ? uploadedBundleRunId ?? undefined : prevRunId;

  /**
   * L1B bundle 파일 선택 시 호출. SLC TIFF 가 정해지고 (multilook 이면) XML 도 정해진 시점에
   * 자동으로 업로드를 트리거한다. 한쪽만 정해진 상태에선 대기.
   */
  const triggerBundleUpload = useCallback(
    async (slc: File, meta: File | null) => {
      if (bundleRequiresMeta && !meta) return; // wait for XML
      setBundleError(null);
      setUploadedBundleRunId(null);
      setBundleProgress({ loaded: 0, total: slc.size + (meta?.size ?? 0), bytesPerSec: 0 });
      setBundleStatus('uploading');
      try {
        const res = await uploadBundle(slc, meta ?? undefined, (p) => setBundleProgress(p));
        setUploadedBundleRunId(res.runId);
        setBundleStatus('done');
      } catch (err) {
        setBundleError(err instanceof Error ? err.message : String(err));
        setBundleStatus('error');
      }
    },
    [bundleRequiresMeta],
  );

  const handleBundleSlcPick = useCallback(
    (file: File) => {
      setBundleSlc(file);
      void triggerBundleUpload(file, bundleMeta);
    },
    [bundleMeta, triggerBundleUpload],
  );
  const handleBundleMetaPick = useCallback(
    (file: File) => {
      setBundleMeta(file);
      if (bundleSlc) void triggerBundleUpload(bundleSlc, file);
    },
    [bundleSlc, triggerBundleUpload],
  );

  /** 파일 선택 또는 드롭 → 즉시 업로드 시작 (별도 Upload 버튼 단계 없음). */
  const handleFilePick = useCallback(async (file: File) => {
    setUploadedFile(file);
    setUploadId(null);
    setUploadProgress({ loaded: 0, total: file.size, bytesPerSec: 0 });
    setUploadError(null);
    setRunResult(null);
    setRunError(null);
    setUploadStatus('uploading');
    try {
      const res = await uploadH5(file, (p) => setUploadProgress(p));
      setUploadId(res.uploadId);
      setUploadStatus('done');
      // FILE_INPUT 노드에서 업로드한 경우 부모에 uploadId 를 알려 downstream L1A 가 재사용.
      if (isFileInputL0) {
        onFileInputUploadComplete?.(step.order, res.uploadId, file.name, file.size);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
      setUploadStatus('error');
    }
  }, [isFileInputL0, onFileInputUploadComplete, step.order]);

  /** 드래그&드롭 핸들러. .h5 또는 application/x-hdf 만 받음. */
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (uploadStatus === 'uploading') return;
    setIsDragging(true);
  }, [uploadStatus]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (uploadStatus === 'uploading') return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.h5') && file.type !== 'application/x-hdf') {
      setUploadError(`Unsupported file type: ${file.name} (only .h5 allowed)`);
      return;
    }
    void handleFilePick(file);
  }, [uploadStatus, handleFilePick]);

  // ── SAR stage sub-function 사양 (readonly) ──
  // TASKS 활성/비활성 상태는 CODE 섹션의 코드 본문에서 자동 도출된다.
  // 사용자가 비활성화하려면 CODE에서 해당 코드를 주석 처리한다.
  // L1B 는 sub-stage 가 결정한 CSU 한 개의 task 만 노출 — 나머지 stage 는 stage 단위 task 리스트.
  const allTasks = useMemo(() => {
    if (step.kind !== 'SAR' || !step.sarStage) return [];
    if (step.sarStage === 'L1B') return l1bSubStageTasks(step.sarSubStage);
    return SAR_STAGE_TASKS[step.sarStage];
  }, [step.kind, step.sarStage, step.sarSubStage]);

  // 에디터 본문 — 저장 전이라도 실시간으로 task 활성 상태를 반영한다.
  // L1B 는 sub-stage 마다 코드가 다르므로 sub-stage 별 default 를 우선 적용한다
  // (sub-stage 가 바뀌면 step.code 도 같이 갈아끼우는 흐름이므로 자연스럽게 새 코드가 노출됨).
  const initialCode = useMemo(() => {
    if (step.kind !== 'SAR') return '';
    if (step.code) return step.code;
    if (step.sarStage === 'L1B') {
      const subDefault = getL1BSubStageCode(step.sarSubStage);
      if (subDefault) return subDefault.code;
    }
    return getDefaultCode(step.sarStage)?.code ?? '';
  }, [step.kind, step.sarStage, step.sarSubStage, step.code]);
  const [currentCode, setCurrentCode] = useState<string>(initialCode);

  useEffect(() => {
    setCurrentCode(initialCode);
  }, [initialCode]);

  const taskActiveMap = useMemo(() => {
    const result = new Map<string, boolean>();
    if (step.kind !== 'SAR' || !step.sarStage) return result;
    const keywords = TASK_KEYWORDS_BY_STAGE[step.sarStage] ?? {};
    for (const task of allTasks) {
      const kws = keywords[task] ?? [];
      result.set(task, isTaskActiveInCode(currentCode, task, kws));
    }
    return result;
  }, [step.kind, step.sarStage, allTasks, currentCode]);

  const activeTaskCount = useMemo(
    () => Array.from(taskActiveMap.values()).filter(Boolean).length,
    [taskActiveMap],
  );

  const handleSaveJobInit = useCallback((updated: PipelineStepDefinition) => {
    onSaveNode?.(updated);
  }, [onSaveNode]);

  const handleSaveCode = useCallback((updated: PipelineStepDefinition) => {
    onSaveNode?.(updated);
  }, [onSaveNode]);

  const handleSaveCatalog = useCallback((updated: PipelineStepDefinition) => {
    onSaveNode?.(updated);
  }, [onSaveNode]);

  const codeEditorEnabled = supportsCodeEditor(step);

  const description = step.kind === 'SAR' && step.sarStage
    ? SAR_STAGE_DESCRIPTIONS[step.sarStage]
    : NODE_KIND_INFO[step.kind]?.description ?? '';

  /** 진행 중인 로그 스트리밍/타이머를 모두 정리 */
  const cancelStreaming = useCallback(() => {
    execTimeoutsRef.current.forEach((id) => clearTimeout(id));
    execTimeoutsRef.current = [];
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  const handleExecute = useCallback(async () => {
    cancelStreaming();
    setExecState('running');
    setOutputData(null);
    setLogLines([]);
    setElapsedMs(0);
    setRunResult(null);
    setRunError(null);

    const start = Date.now();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 50);

    // 새 실행 시작 — 캐시된 직전 결과는 더 이상 표시할 게 아니므로 ref 도 비운다.
    logLinesRef.current = [];

    // ── SAR 실제 실행 분기: 매핑 가능한 stage 이고 입력(uploadId 또는 inputRunId) 확보됐을 때만.
    // SSE 스트림으로 라인 단위 stdout/stderr 를 받아 실시간으로 터미널에 흘려보낸다.
    if (sarStageId && (uploadId || effectiveInputRunId)) {
      let streamErrorMsg: string | null = null;
      let completedRunResult: Pick<ExecuteResponse, 'runId' | 'stage' | 'exitCode' | 'args' | 'primary' | 'meta' | 'files'> | null = null;
      try {
        for await (const ev of executeStageStream(
          sarStageId,
          { uploadId: uploadId ?? undefined, inputRunId: effectiveInputRunId },
          resolvedStage?.params,
        )) {
          if (ev.type === 'log') {
            const stamp = new Date().toLocaleTimeString('en-GB');
            // 서버가 분류한 level 우선 (INFO/WARNING/ERROR), 없으면 stream 기준 fallback.
            const lvl = ev.level ?? (ev.stream === 'stderr' ? 'error' : 'info');
            const newLine: RenderedLogLine = {
              level: lvl,
              text: ev.line,
              timestamp: stamp,
              delayMs: 0,
            };
            // functional setter — React 가 큐에 쌓인 prev 를 차례로 흘려보내므로 줄 누락이 없다.
            // ref 는 setter 안에서 next 값을 그대로 받아 동기화 (done 핸들러 캡쳐용).
            setLogLines((prev) => {
              const next = [...prev, newLine];
              logLinesRef.current = next;
              return next;
            });
          } else if (ev.type === 'done') {
            completedRunResult = ev;
            setRunResult(ev);
            setExecState('done');
            if (elapsedTimerRef.current) {
              clearInterval(elapsedTimerRef.current);
              elapsedTimerRef.current = null;
            }
            if (ev.exitCode === 0) {
              onSarRunComplete?.(step.order, ev.runId);
            } else {
              streamErrorMsg = `Python exit code ${ev.exitCode}`;
              setRunError(streamErrorMsg);
            }
          } else if (ev.type === 'error') {
            streamErrorMsg = ev.message;
            setRunError(streamErrorMsg);
          }
        }
      } catch (err) {
        streamErrorMsg = err instanceof Error ? err.message : String(err);
        setRunError(streamErrorMsg);
        setExecState('done');
        if (elapsedTimerRef.current) {
          clearInterval(elapsedTimerRef.current);
          elapsedTimerRef.current = null;
        }
      }
      // 캐시 업데이트 — 사용자가 모달을 닫았다가 다시 열면 직전 결과를 그대로 본다.
      onSarOutputUpdate?.(step.order, {
        logLines: logLinesRef.current,
        runResult: completedRunResult,
        runError: streamErrorMsg,
        elapsedMs: Date.now() - start,
      });
      return;
    }

    // SAR 노드면 stage별 mock 로그를 시간차를 두고 흘려보낸다.
    const script = step.kind === 'SAR' ? getStageLogScript(step.sarStage) : [];

    if (script.length === 0) {
      // 비-SAR 노드는 기존대로 단일 mock 결과만 1.4초 뒤 표시
      const tid = setTimeout(() => {
        setExecState('done');
        setOutputData(getMockOutput(step));
        if (elapsedTimerRef.current) {
          clearInterval(elapsedTimerRef.current);
          elapsedTimerRef.current = null;
        }
      }, 1400);
      execTimeoutsRef.current.push(tid);
      return;
    }

    let cumulative = 0;
    script.forEach((line) => {
      cumulative += line.delayMs;
      const tid = setTimeout(() => {
        const ts = new Date();
        const stamp = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}:${String(ts.getSeconds()).padStart(2, '0')}`;
        setLogLines((prev) => [...prev, { ...line, timestamp: stamp }]);
      }, cumulative);
      execTimeoutsRef.current.push(tid);
    });

    // 마지막 라인 출력 후 약간의 여유를 두고 done 처리
    const finishId = setTimeout(() => {
      setExecState('done');
      setOutputData(getMockOutput(step));
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    }, cumulative + 200);
    execTimeoutsRef.current.push(finishId);
  }, [step, cancelStreaming, sarStageId, resolvedStage, uploadId, effectiveInputRunId, onSarRunComplete, onSarOutputUpdate]);

  // 모달 unmount / step 교체 시 진행 중 스트림 정리
  useEffect(() => () => cancelStreaming(), [cancelStreaming]);
  useEffect(() => {
    cancelStreaming();
    // step 이 바뀌면 캐시 hit/miss 에 따라 OUTPUT 영역만 분기. 입력 패널 (upload/bundle) 상태는
    // 새 node 진입이므로 무조건 초기화 — 캐시는 결과 표시용일 뿐 입력 재현은 의도하지 않는다.
    if (cachedOutput) {
      setExecState('done');
      setLogLines(cachedOutput.logLines);
      logLinesRef.current = cachedOutput.logLines;
      setElapsedMs(cachedOutput.elapsedMs);
      setRunResult(cachedOutput.runResult);
      setRunError(cachedOutput.runError);
    } else {
      setExecState('idle');
      setLogLines([]);
      logLinesRef.current = [];
      setElapsedMs(0);
      setRunResult(null);
      setRunError(null);
    }
    setOutputData(null);
    // prevUploadId 가 있으면 (FILE_INPUT 에서 받은 입력을 L1A 가 그대로 쓸 때) "이미 업로드됨" 상태로 시작.
    if (prevUploadId) {
      setUploadedFile(prevUploadFilename ? new File([], prevUploadFilename, { type: 'application/x-hdf' }) : null);
      setUploadId(prevUploadId);
      setUploadStatus('done');
    } else {
      setUploadedFile(null);
      setUploadId(null);
      setUploadStatus('idle');
    }
    setUploadProgress(null);
    setUploadError(null);
    setBundleSlc(null);
    setBundleMeta(null);
    setBundleStatus('idle');
    setBundleProgress(null);
    setBundleError(null);
    setUploadedBundleRunId(null);
    setL1bInputMode(prevRunId ? 'upstream' : 'upload');
    // cachedOutput 은 새 step 진입 시점에 한 번만 반영. step 동일한 채로 cachedOutput 이
    // 갱신될 땐 (우리가 직접 update 한 경우) 재 hydrate 하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.order, step.kind, step.sarStage, prevRunId, cancelStreaming]);

  // cachedOutput 의 runResult/runError 가 외부(cascade)에서 비동기로 갱신될 때 modal 도 따라가도록 sync.
  // 모달이 열려 있는 중에 cascade 가 stage 를 끝내면 QuickLook 이미지·파일 목록이 곧바로 보인다.
  // (기존 useEffect 는 step 교체 시점에만 hydrate 하므로 같은 step 의 결과 갱신은 놓침.)
  useEffect(() => {
    if (!cachedOutput) return;
    setRunResult(cachedOutput.runResult);
    setRunError(cachedOutput.runError);
    if (cachedOutput.runResult || cachedOutput.runError) setExecState('done');
  }, [cachedOutput]);

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
      aria-label={`${nodeLabel(step)} node details`}
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

        {/*
         * Execute step — SAR 노드는 OUTPUT 헤더에 위치하므로 모달 헤더에서 제외.
         * TRIGGER/FILE_INPUT/JOB_INIT 는 개별 실행 개념이 없으므로 제외
         * (시작 노드 입력 지정과 Job 초기화는 Pipeline Execution 탭에서 처리).
         */}
        {(step.kind === 'CATALOG' || step.kind === 'THUMBNAIL') && (
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
              ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Running…</>
              : isDone
                ? <><CheckCircle className="w-3.5 h-3.5" /> Re-run</>
                : <><Play className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} /> Execute step</>
            }
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Body: 3 columns ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* ── Left: INPUT — 이전 노드 참조 ── */}
        <div className="w-[30%] flex flex-col border-r border-border bg-background">
          <div className="shrink-0 h-10 flex items-center px-4 border-b border-border">
            <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">INPUT</span>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* SAR 시연: L1B 는 토글 (upstream/upload), L1A 는 H5 업로드, 그 외는 prev nodes */}
            {isL1bStage ? (
              <div className="p-3 space-y-3" data-testid="sar-l1b-input-panel">
                {/* 토글 — Upstream(prev run) vs Upload file */}
                <div className="grid grid-cols-2 gap-1 rounded-md bg-muted/40 p-1" role="tablist" aria-label="L1B input source">
                  {[
                    { id: 'upstream' as const, label: 'Upstream run' },
                    { id: 'upload' as const, label: 'Upload file' },
                  ].map((opt) => {
                    const active = l1bInputMode === opt.id;
                    const disabled = opt.id === 'upstream' && !prevRunId;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        disabled={disabled}
                        onClick={() => setL1bInputMode(opt.id)}
                        data-testid={`l1b-mode-${opt.id}`}
                        title={disabled ? 'No upstream run available. Execute L1A first.' : undefined}
                        className={cn(
                          'h-7 rounded text-[11px] font-medium transition-colors',
                          active
                            ? 'bg-card text-foreground shadow-sm border border-border'
                            : 'text-muted-foreground hover:text-foreground',
                          disabled && 'opacity-40 cursor-not-allowed hover:text-muted-foreground',
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {l1bInputMode === 'upstream' ? (
                  prevRunId ? (
                    <div className="space-y-2" data-testid="sar-l1b-upstream">
                      {prevNodes && prevNodes.length > 0 && prevNodes.map((prev) => {
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
                      <div className="rounded-md border border-success/30 bg-success/10 px-2.5 py-2 text-[10px] text-success flex items-start gap-1.5" data-testid="sar-prev-run">
                        <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" />
                        <div className="min-w-0 break-all">Chained from prev run <span className="font-mono">{prevRunId.slice(0, 8)}</span></div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3" data-testid="sar-needs-upstream">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div className="min-w-0 space-y-1">
                          <div className="text-[11px] font-semibold text-foreground">No upstream run yet</div>
                          <div className="text-[10px] leading-relaxed text-muted-foreground">
                            Execute the upstream L1A node first to chain its SLC GeoTIFF + metadata
                            XML into this stage — or switch to <span className="font-semibold text-foreground">Upload file</span> to provide them directly.
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  // ── Upload file 모드: SLC TIFF (+ multilook 이면 XML) 직접 업로드 ──
                  <div className="space-y-2" data-testid="sar-l1b-upload">
                    <input
                      ref={bundleSlcInputRef}
                      type="file"
                      accept=".tif,.tiff,image/tiff"
                      className="hidden"
                      data-testid="sar-bundle-slc-input"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) handleBundleSlcPick(f);
                      }}
                    />
                    <input
                      ref={bundleMetaInputRef}
                      type="file"
                      accept=".xml,application/xml,text/xml"
                      className="hidden"
                      data-testid="sar-bundle-meta-input"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) handleBundleMetaPick(f);
                      }}
                    />

                    {/* SLC/MLD TIFF slot */}
                    <div
                      className={cn(
                        'rounded-md border px-3 py-2.5 transition-colors',
                        bundleSlc
                          ? 'border-success/40 bg-success/5'
                          : 'border-dashed border-accent/40 bg-accent/[0.03]',
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
                          {bundleSlc ? <CheckCircle className="w-4 h-4 text-success" /> : <Upload className="w-4 h-4 text-accent" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-semibold text-foreground">
                            {sarStageId === 'L1B_SPECKLE' ? 'MLD TIFF' : 'SLC TIFF'}
                          </div>
                          {bundleSlc ? (
                            <div className="text-[10px] text-muted-foreground font-mono truncate" title={bundleSlc.name}>
                              {bundleSlc.name} · {(bundleSlc.size / 1e6).toFixed(1)} MB
                            </div>
                          ) : (
                            <div className="text-[10px] text-muted-foreground">.tif / .tiff — click to choose</div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => bundleSlcInputRef.current?.click()}
                          disabled={bundleStatus === 'uploading'}
                          className="shrink-0 text-[10px] font-medium text-accent hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                          data-testid="sar-bundle-slc-pick"
                        >
                          {bundleSlc ? 'Change' : 'Choose'}
                        </button>
                      </div>
                    </div>

                    {/* metadata XML slot — multilook 만 */}
                    {bundleRequiresMeta && (
                      <div
                        className={cn(
                          'rounded-md border px-3 py-2.5 transition-colors',
                          bundleMeta
                            ? 'border-success/40 bg-success/5'
                            : 'border-dashed border-accent/40 bg-accent/[0.03]',
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
                            {bundleMeta ? <CheckCircle className="w-4 h-4 text-success" /> : <Upload className="w-4 h-4 text-accent" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-semibold text-foreground">Metadata XML</div>
                            {bundleMeta ? (
                              <div className="text-[10px] text-muted-foreground font-mono truncate" title={bundleMeta.name}>
                                {bundleMeta.name} · {(bundleMeta.size / 1e3).toFixed(0)} KB
                              </div>
                            ) : (
                              <div className="text-[10px] text-muted-foreground">.xml — required for multi-look</div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => bundleMetaInputRef.current?.click()}
                            disabled={bundleStatus === 'uploading'}
                            className="shrink-0 text-[10px] font-medium text-accent hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                            data-testid="sar-bundle-meta-pick"
                          >
                            {bundleMeta ? 'Change' : 'Choose'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* progress / status */}
                    {bundleStatus === 'uploading' && bundleProgress && (() => {
                      const pct = bundleProgress.total > 0
                        ? Math.min(100, Math.round((bundleProgress.loaded / bundleProgress.total) * 100))
                        : 0;
                      return (
                        <div className="rounded-md border border-accent/30 bg-accent/[0.06] px-2.5 py-2 space-y-1.5" data-testid="sar-bundle-uploading">
                          <div className="text-[10px] text-accent font-mono">{pct}% · uploading…</div>
                          <div className="h-1.5 w-full rounded-full bg-accent/15 overflow-hidden">
                            <div className="h-full bg-accent transition-all duration-200 ease-linear" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })()}

                    {bundleStatus === 'done' && uploadedBundleRunId && (
                      <div className="rounded-md border border-success/30 bg-success/10 px-2.5 py-2 text-[10px] text-success flex items-start gap-1.5" data-testid="sar-bundle-done">
                        <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" />
                        <div className="min-w-0 break-all">
                          Ready · synthetic runId <span className="font-mono">{uploadedBundleRunId.slice(0, 8)}</span>
                        </div>
                      </div>
                    )}

                    {bundleError && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[10px] text-destructive flex items-start gap-1.5" data-testid="sar-bundle-error">
                        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                        <div className="min-w-0 break-words">{bundleError}</div>
                      </div>
                    )}

                    {bundleStatus === 'idle' && !bundleSlc && (
                      <p className="text-[10px] leading-relaxed text-muted-foreground/70 pt-1">
                        {bundleRequiresMeta
                          ? 'Pick both the SLC TIFF and metadata XML — upload starts once both are chosen.'
                          : 'Pick an MLD TIFF — upload starts immediately on selection.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : needsH5Upload ? (
              <div
                className="p-3 space-y-2.5"
                data-testid="sar-upload-panel"
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {/* hidden file input — 항상 마운트, Choose/Change/Replace 버튼 모두 같은 ref 사용 */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".h5,application/x-hdf"
                  className="hidden"
                  data-testid="sar-h5-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFilePick(f);
                  }}
                />

                {uploadStatus !== 'done' ? (
                  // ── 미업로드 / 업로드 중: dashed 박스 (드래그 시 강조) ─────
                  <div
                    className={cn(
                      'rounded-md border border-dashed px-3 py-3 transition-colors',
                      isDragging
                        ? 'border-accent bg-accent/10'
                        : 'border-accent/40 bg-accent/[0.03]',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
                        <Upload className="w-4 h-4 text-accent" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold text-foreground">H5 raw data</div>
                        {uploadedFile ? (
                          <div className="text-[10px] text-muted-foreground font-mono truncate" data-testid="sar-picked-name" title={uploadedFile.name}>
                            {uploadedFile.name} · {(uploadedFile.size / 1e6).toFixed(0)} MB
                          </div>
                        ) : (
                          <div className="text-[10px] text-muted-foreground">
                            {isDragging ? 'Drop the file here' : 'Drag & drop a file, or click to choose. Upload starts immediately on selection.'}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadStatus === 'uploading'}
                        className="shrink-0 text-[10px] font-medium text-accent hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                        data-testid="sar-pick-file"
                      >
                        {uploadedFile ? 'Change' : 'Choose file'}
                      </button>
                    </div>
                  </div>
                ) : (
                  // ── 업로드 완료 상태: 컴팩트 success 카드 (점선 박스 대체) ──
                  <div
                    className={cn(
                      'rounded-md border bg-success/5 px-3 py-2.5 transition-colors',
                      isDragging ? 'border-accent bg-accent/10' : 'border-success/40',
                    )}
                    data-testid="sar-upload-done"
                  >
                    <div className="flex items-center gap-2.5">
                      <CheckCircle className="w-4 h-4 text-success shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-[11px] font-semibold text-foreground truncate"
                          data-testid="sar-picked-name"
                          title={uploadedFile?.name}
                        >
                          {uploadedFile?.name ?? 'uploaded.h5'}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {(((uploadedFile?.size || prevUploadSizeBytes) ?? 0) / 1e6).toFixed(0)} MB · uploadId{' '}
                          <span>{uploadId?.slice(0, 8)}</span>
                          {prevUploadId && uploadId === prevUploadId && !isFileInputL0 && (
                            <span className="ml-2 text-accent">· from Pipeline Input</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="shrink-0 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:underline"
                        data-testid="sar-pick-file"
                      >
                        Replace
                      </button>
                    </div>
                    <div className="mt-1.5 pl-[26px] text-[10px] text-muted-foreground/80">
                      Click <span className="font-semibold text-foreground">Execute step</span> on the right to start processing.
                    </div>
                  </div>
                )}

                {/* 진행률 박스 — 파일 선택 즉시 업로드가 시작되므로 별도 Upload 버튼은 없음 */}
                {uploadStatus === 'uploading' && uploadProgress && (() => {
                  const pct = uploadProgress.total > 0
                    ? Math.min(100, Math.round((uploadProgress.loaded / uploadProgress.total) * 100))
                    : 0;
                  const loadedMb = (uploadProgress.loaded / 1e6).toFixed(0);
                  const totalMb = (uploadProgress.total / 1e6).toFixed(0);
                  const speedMbps = (uploadProgress.bytesPerSec / 1e6).toFixed(1);
                  const remainingSec = uploadProgress.bytesPerSec > 0
                    ? Math.ceil((uploadProgress.total - uploadProgress.loaded) / uploadProgress.bytesPerSec)
                    : 0;
                  const eta = remainingSec >= 60
                    ? `${Math.floor(remainingSec / 60)}m ${remainingSec % 60}s`
                    : `${remainingSec}s`;
                  return (
                    <div className="rounded-md border border-accent/30 bg-accent/[0.06] px-2.5 py-2 space-y-1.5" data-testid="sar-uploading">
                      <div className="flex items-center justify-between text-[10px] text-accent font-mono" data-testid="sar-progress-text">
                        <span>{pct}% · {loadedMb}/{totalMb} MB</span>
                        <span>{speedMbps} MB/s · ETA {eta}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-accent/15 overflow-hidden">
                        <div
                          className="h-full bg-accent transition-all duration-200 ease-linear"
                          style={{ width: `${pct}%` }}
                          data-testid="sar-progress-bar"
                        />
                      </div>
                    </div>
                  );
                })()}

                {uploadError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[10px] text-destructive flex items-start gap-1.5" data-testid="sar-upload-error">
                    <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                    <div className="min-w-0 break-words">{uploadError}</div>
                  </div>
                )}
              </div>
            ) : prevNodes && prevNodes.length > 0 ? (
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
                {sarStageId && prevRunId && (
                  <div className="rounded-md border border-success/30 bg-success/10 px-2.5 py-2 text-[10px] text-success flex items-start gap-1.5" data-testid="sar-prev-run">
                    <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" />
                    <div className="min-w-0 break-all">Chained from prev run <span className="font-mono">{prevRunId.slice(0, 8)}</span></div>
                  </div>
                )}
                <div className="pt-2 text-[10px] text-muted-foreground/50 leading-relaxed">
                  The output of the previous node is passed as input to this node
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/60 px-6 text-center">
                <ChevronRight className="w-6 h-6 opacity-30" />
                <span className="text-[12px]">No input</span>
                <span className="text-[11px] text-muted-foreground/40">This node is triggered by an external event</span>
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
                  'flex-1 h-10 text-[11px] font-medium border-b-2 transition-colors',
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
          <div className="flex-1 min-h-0 flex flex-col">
            {/* ── Info 탭: 노드 개요 + 타입별 읽기 전용 정보 ── */}
            <div className={cn('h-full overflow-y-auto px-5 py-4 space-y-4', activeTab !== 'info' && 'hidden')}>
              {/* Description */}
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Description</div>
                <p className="text-[12px] text-foreground/80 leading-relaxed">{description}</p>
              </div>

              {/* TRIGGER info */}
              {step.kind === 'TRIGGER' && (
                <>
                  <div className="h-px bg-border" />
                  <div className="space-y-1.5 text-[11px]">
                    <InfoRow label="Event Type" value="RAW_DATA_RECEIVED" />
                    <InfoRow label="Provider" value="Ground Station (EI-01)" />
                    <InfoRow label="Queue" value={QUEUE_NAME.RECEPTION_EVENTS} />
                  </div>
                </>
              )}

              {/* FILE_INPUT info */}
              {step.kind === 'FILE_INPUT' && (
                <>
                  <div className="h-px bg-border" />
                  <div className="space-y-1.5 text-[11px]">
                    <InfoRow label="Trigger Source" value="PARTIAL_REPROCESS" />
                    <InfoRow label="Input Level" value={step.inputLevel ? PRODUCT_LEVEL_LABELS[step.inputLevel] : '—'} />
                    <InfoRow label="Interface" value="SI-07" />
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3 text-[10px] text-muted-foreground leading-relaxed">
                    OPS-06 partial reprocessing flow. When an operator or LIID requests reprocessing via CSC-09, CSC-08 generates a DAG based on target_level and restarts the pipeline from that level.
                  </div>
                </>
              )}

              {/* JOB_INIT info */}
              {step.kind === 'JOB_INIT' && (() => {
                const selectedProfile = step.jobInitConfig?.profileId
                  ? availableProfiles?.find((p) => p.id === step.jobInitConfig?.profileId) ?? null
                  : null;
                const profileName = selectedProfile?.name ?? step.jobInitConfig?.profileId ?? 'Unassigned';
                const profileHasPolarizationTags = (selectedProfile?.polarizationTags?.length ?? 0) > 0;
                return (
                  <>
                    <div className="h-px bg-border" />
                    <div className="text-[11px] font-medium text-muted-foreground">Processing Profile Settings</div>
                    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5 text-[11px]">
                      <InfoRow label="Profile" value={profileName} />
                      {profileHasPolarizationTags && (
                        <InfoRow label="Polarization" value={step.jobInitConfig?.polarization || '—'} />
                      )}
                      <InfoRow label="Priority" value={`${step.jobInitConfig?.priority ?? 5}`} />
                      <InfoRow label="Retry Strategy" value={step.jobInitConfig?.retryInterval ? RETRY_INTERVAL_LABELS[step.jobInitConfig.retryInterval] : '—'} />
                    </div>
                  </>
                );
              })()}

              {/* SAR stage overview */}
              {step.kind === 'SAR' && step.sarStage && (
                <>
                  <div className="h-px bg-border" />
                  <div className="space-y-1.5 text-[11px]">
                    <InfoRow label="SAR Stage" value={step.sarStage} />
                    <InfoRow label="Output Type" value={SAR_STAGE_OUTPUT_TYPE[step.sarStage]} />
                    <InfoRow label="Active Tasks" value={`${activeTaskCount}/${allTasks.length}`} />
                  </div>
                </>
              )}

              {/* CATALOG info */}
              {step.kind === 'CATALOG' && (
                <>
                  <div className="h-px bg-border" />
                  <div className="space-y-1.5 text-[11px]">
                    <InfoRow label="Target Levels" value="Level-1 / 2 / 3" />
                    <InfoRow label="Queue" value={QUEUE_NAME.CATALOG_REGISTRATION} />
                  </div>
                </>
              )}

              {/* 처리 프로세스 */}
              <ProcessInfoSection kind={step.kind} />

              {/* ── 상세 설정 (구 Settings 탭) ───────────────────────── */}
              <div className="h-px bg-border" />

              <SettingSection title="Node Info">
                <SettingRow label="Kind" value={step.kind} />
                {step.sarStage && <SettingRow label="SAR Stage" value={step.sarStage} />}
                <SettingRow label="CSC" value={nodeCsc(step)} />
                <SettingRow label="Order" value={`#${step.order}`} />
              </SettingSection>

              {step.kind === 'TRIGGER' && (
                <SettingSection title="Event Source">
                  <SettingRow label="Event Type" value="RAW_DATA_RECEIVED" status="confirmed" />
                  <SettingRow label="Provider" value="Ground Station (EI-01)" status="confirmed" />
                  <SettingRow label="Queue" value={QUEUE_NAME.RECEPTION_EVENTS} status="confirmed" />
                  <SettingRow label="Checksum" value="SHA-256" status="confirmed" />
                  <SettingRow label="Schema Version" value="1.0" status="confirmed" />
                </SettingSection>
              )}

              {step.kind === 'FILE_INPUT' && (
                <SettingSection title="Partial Reprocessing Settings">
                  <SettingRow label="Trigger Source" value="PARTIAL_REPROCESS" status="confirmed" />
                  <SettingRow
                    label="Input Level"
                    value={step.inputLevel ? PRODUCT_LEVEL_LABELS[step.inputLevel] : '—'}
                    status={step.inputLevel ? 'confirmed' : undefined}
                  />
                  <SettingRow label="Interface" value="SI-07" status="tbc" note="ICD 5.4" />
                </SettingSection>
              )}

              {step.kind === 'JOB_INIT' && (
                <SettingSection title="Job Limits">
                  <SettingRow label="Max Retries" value={`${MAX_RETRY_COUNT}`} status="confirmed" note="ICD 3.5" />
                  <SettingRow
                    label="Retry Strategy"
                    value={step.jobInitConfig?.retryInterval
                      ? RETRY_INTERVAL_LABELS[step.jobInitConfig.retryInterval]
                      : '—'}
                    status="tbc"
                    note="ICD 3.5"
                  />
                  <SettingRow
                    label="Deadline"
                    value={step.jobInitConfig?.deadlineHours ? `${step.jobInitConfig.deadlineHours}h` : '—'}
                    status="tbc"
                    note="SI-04"
                  />
                </SettingSection>
              )}

              {step.kind === 'SAR' && step.sarStage && (() => {
                const csc = nodeCsc(step);
                const vt = CSC_VT_SECONDS[csc as TargetCsc];
                return (
                  <SettingSection title={`Execution Limits (${csc})`}>
                    {vt !== undefined && (
                      <SettingRow
                        label="Visibility Timeout"
                        value={formatVt(vt)}
                        status="confirmed"
                        note="ICD 6.6"
                      />
                    )}
                    <SettingRow
                      label="Output Type"
                      value={SAR_STAGE_OUTPUT_TYPE[step.sarStage]}
                      status="confirmed"
                    />
                    <SettingRow label="Priority" value="—" status="tbc" note="ICD 6.6" />
                    <SettingRow label="Deadline" value="—" status="tbc" note="SI-04" />
                    <SettingRow label="Retry Strategy" value="—" status="tbc" note="ICD 3.5" />
                  </SettingSection>
                );
              })()}

              {step.kind === 'CATALOG' && (
                <SettingSection title="Catalog Settings">
                  <SettingRow label="Target Levels" value="Level-1 / 2 / 3" status="confirmed" note="Level-0 excluded" />
                  <SettingRow label="Quality Validation" value="—" status="tbc" note="SI-05" />
                  <SettingRow label="SI-05 Interface" value="TBC" status="tbc" note="ICD 2.3" />
                  <SettingRow label="Queue" value={QUEUE_NAME.CATALOG_REGISTRATION} status="confirmed" />
                </SettingSection>
              )}
            </div>

            {/* ── Parameters 탭 — 편집 가능 ── */}
            <div className={cn('h-full flex flex-col min-h-0', activeTab !== 'parameters' && 'hidden')}>
              {/* L1B 한정 sub-stage(필터) 선택 — 같은 stage 노드가 여러 개여도 어떤 처리를 하는지 명확히 구분되도록 */}
              {step.kind === 'SAR' && step.sarStage === 'L1B' && onSaveNode && (
                <div className="shrink-0">
                  <L1BSubStageEditor step={step} onSave={onSaveNode} />
                </div>
              )}

              {/* SAR: stage sub-function — CODE 본문에서 자동 도출되는 readonly 상태 표시 */}
              {step.kind === 'SAR' && allTasks.length > 0 && (
                <div className="shrink-0 px-5 py-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Tasks ({activeTaskCount}/{allTasks.length})
                    </div>
                    <span className="text-[10px] text-muted-foreground/70">Auto-derived from CODE</span>
                  </div>
                  <p className="text-[10px] leading-relaxed text-muted-foreground/70">
                    Active when (1) the task name appears in a <code className="font-mono">#</code> comment (e.g. <code className="font-mono">{`# DEM Integration`}</code>), or (2) a related keyword shows up in actual code. Docstrings don&apos;t count.
                  </p>
                  <div className="space-y-0.5 pt-1">
                    {allTasks.map((task) => {
                      const isActive = taskActiveMap.get(task) ?? false;
                      return (
                        <div
                          key={task}
                          title={isActive
                            ? 'Detected in code — comment out the relevant lines to disable'
                            : 'Not detected in code (or fully commented out)'}
                          className={cn(
                            'flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px]',
                            isActive ? 'bg-accent/10 text-foreground' : 'bg-transparent text-muted-foreground/60',
                          )}
                        >
                          <span className="w-3.5 flex items-center justify-center shrink-0">
                            {isActive ? (
                              <CheckCircle className="w-3.5 h-3.5 text-accent" strokeWidth={2.5} />
                            ) : (
                              <span className="w-2 h-px bg-muted-foreground/30" aria-hidden />
                            )}
                          </span>
                          <span className="flex-1 truncate">{task}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SAR L0/L1x/L2x: 처리 코드 업로드/편집 (CODE 섹션) — 남은 세로 영역을 채움 */}
              {step.kind === 'SAR' && codeEditorEnabled && onSaveNode && (
                <div className="flex-1 min-h-0 flex flex-col px-5 pb-3 border-t border-border pt-3">
                  <div className="shrink-0 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Code
                  </div>
                  <div className="flex-1 min-h-0 rounded-md border border-border overflow-hidden">
                    <NodeCodeEditorPanel step={step} onSave={handleSaveCode} onCodeChange={setCurrentCode} />
                  </div>
                </div>
              )}

              {/* JOB_INIT: 편집 패널 임베드 — 파이프라인 편집 시에는 satelliteId/mode가 없을 수 있음 */}
              {step.kind === 'JOB_INIT' && onSaveNode && availableProfiles && availableProfiles.length > 0 ? (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <JobInitEditPanel
                    step={step}
                    satelliteId={satelliteId}
                    mode={mode}
                    profiles={availableProfiles}
                    onSave={handleSaveJobInit}
                  />
                </div>
              ) : step.kind === 'JOB_INIT' && (
                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-2 text-[12px]">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Job Initialization Settings</div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processing Profile</span>
                    <span className={step.jobInitConfig?.profileId ? 'text-foreground' : 'text-amber-500'}>
                      {step.jobInitConfig?.profileId ?? 'Unassigned'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Polarization</span>
                    <span className="text-foreground">{step.jobInitConfig?.polarization || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Priority</span>
                    <span className="text-foreground">{step.jobInitConfig?.priority ?? 5}</span>
                  </div>
                </div>
              )}

              {/* CATALOG: STAC 엔드포인트 / 매핑 규칙 등 폼 기반 설정 */}
              {step.kind === 'CATALOG' && onSaveNode && (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <CatalogConfigPanel step={step} onSave={handleSaveCatalog} />
                </div>
              )}

              {/* Non-SAR, Non-JOB_INIT, Non-CATALOG: process list */}
              {step.kind !== 'SAR' && step.kind !== 'JOB_INIT' && step.kind !== 'CATALOG' && NODE_KIND_INFO[step.kind]?.processes && (
                <div className="px-5 py-4">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Processes</div>
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
              {step.kind !== 'SAR' && step.kind !== 'JOB_INIT' && step.kind !== 'CATALOG' && !NODE_KIND_INFO[step.kind]?.processes && (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/60">
                  <span className="text-[12px]">This node has no additional parameters</span>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ── Right: OUTPUT ── */}
        <div className="w-[30%] flex flex-col border-l border-border bg-background">
          <div className="shrink-0 h-10 flex items-center justify-between gap-2 pl-4 pr-2 border-b border-border">
            <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">OUTPUT</span>
            {step.kind === 'SAR' && (() => {
              // SAR 실제 실행 가능 여부: 매핑 stage 면 입력(uploadId/prevRunId) 필요.
              // mock fallback stage 면 항상 가능.
              const realRunDisabled = sarStageId !== null && !canRunReal;
              const tooltip = realRunDisabled
                ? (needsH5Upload
                    ? (uploadStatus === 'uploading'
                        ? 'Uploading… enabled when upload completes'
                        : (uploadedFile ? 'Wait for upload to finish' : 'Choose an H5 file first'))
                    : isL1bStage
                      ? (l1bInputMode === 'upstream'
                          ? 'Run the upstream L1A node first — or switch INPUT to "Upload file"'
                          : bundleStatus === 'uploading'
                            ? 'Uploading… enabled when upload completes'
                            : bundleRequiresMeta && (!bundleSlc || !bundleMeta)
                              ? 'Choose both the SLC TIFF and metadata XML'
                              : 'Choose the input TIFF first')
                      : 'No input available')
                : undefined;
              return (
                <button
                  type="button"
                  disabled={isRunning || realRunDisabled}
                  onClick={handleExecute}
                  title={tooltip}
                  data-testid="sar-execute"
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors',
                    'bg-emerald-500 text-white hover:bg-emerald-400 active:bg-emerald-600',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                  )}
                >
                  {isRunning
                    ? <><Loader className="w-3 h-3 animate-spin" /> Running…</>
                    : isDone
                      ? <><CheckCircle className="w-3 h-3" /> Re-run</>
                      : <><Play className="w-3 h-3" fill="currentColor" strokeWidth={0} /> Execute step</>
                  }
                </button>
              );
            })()}
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            {step.kind === 'SAR' ? (
              <div className="flex-1 min-h-0 flex flex-col" data-testid="sar-output">
                {/* CLI 스타일 로그 터미널 — 항상 보임 */}
                <div className={cn('min-h-0', runResult ? 'h-1/2' : 'flex-1')}>
                  <NodeExecutionTerminal
                    lines={logLines}
                    isRunning={isRunning}
                    isDone={isDone}
                    elapsedMs={elapsedMs}
                    title={step.sarStage ? `${step.sarStage.toLowerCase()}-step` : 'sar-step'}
                  />
                </div>
                {/* 결과 또는 에러 — 둘 중 하나라도 있으면 결과 패널 노출 */}
                {(runResult || runError) && (
                  <div className="flex-1 min-h-0 overflow-y-auto border-t border-border" data-testid="sar-result">
                    {runError && (
                      <div className="m-3 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[10px] text-destructive flex items-start gap-1.5">
                        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                        <div className="min-w-0 break-words">{runError}</div>
                      </div>
                    )}
                    {!runResult && (
                      <div className="px-3 pb-3 text-[10px] text-muted-foreground">No execution result (see error above)</div>
                    )}
                    {runResult && (<>

                    {(() => {
                      const png = runResult.files.find((f) => f.kind === 'image');
                      return png ? (
                        <div className="p-3 space-y-2">
                          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">QuickLook</div>
                          <div className="rounded-md border border-border overflow-hidden bg-black flex items-center justify-center">
                            { /* eslint-disable-next-line @next/next/no-img-element */ }
                            <img
                              src={png.url}
                              alt={png.name}
                              className="max-w-full h-auto"
                              data-testid="sar-quicklook-img"
                            />
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono break-all">{png.name} · {(png.sizeBytes / 1e6).toFixed(2)} MB</div>
                        </div>
                      ) : null;
                    })()}
                    <div className="px-3 pb-3 space-y-1.5">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Outputs</div>
                      <div className="space-y-1" data-testid="sar-files">
                        {runResult.files.map((f) => (
                          <a
                            key={f.name}
                            href={f.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 text-[11px] font-mono"
                          >
                            <span className="truncate text-foreground">{f.name}</span>
                            <span className="shrink-0 text-muted-foreground">{(f.sizeBytes / 1e6).toFixed(2)} MB</span>
                          </a>
                        ))}
                      </div>
                      <div className="pt-1 text-[10px] text-muted-foreground">
                        runId <span className="font-mono">{runResult.runId}</span> · exit {runResult.exitCode}
                      </div>
                    </div>
                    </>)}
                  </div>
                )}
              </div>
            ) : (
              // 비-SAR 노드: 기존 mock 데이터 뷰
              <div className="flex-1 overflow-y-auto min-h-0">
                {isRunning && (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                    <Loader className="w-6 h-6 animate-spin text-accent" />
                    <span className="text-[12px]">Running…</span>
                  </div>
                )}
                {isDone && outputData && (
                  <div>
                    <div className="flex items-center gap-1.5 px-3 pt-3 pb-1 text-[11px] text-success font-medium">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Execution complete
                    </div>
                    <DataView data={outputData} />
                  </div>
                )}
                {!isRunning && !isDone && (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/60 px-6 text-center">
                    <ChevronRight className="w-6 h-6 opacity-30 -scale-x-100" />
                    <span className="text-[12px]">No output data</span>
                    {(step.kind === 'CATALOG' || step.kind === 'THUMBNAIL') && (
                      <>
                        <button
                          type="button"
                          onClick={handleExecute}
                          className="mt-1 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-destructive text-white hover:brightness-110 transition-all flex items-center gap-1.5"
                        >
                          <Play className="w-3 h-3" fill="currentColor" strokeWidth={0} />
                          Execute step
                        </button>
                        <span className="text-[10px] text-muted-foreground/40">or configure mock data</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
