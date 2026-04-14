// =============================================================================
// SDPE Pipeline Console — Domain Types
// DESIGN.md 6장 기반, libs/sdpe-shared 수기 복제 (v1)
// =============================================================================

// --- Enums / Unions ---

export type JobStatus = 'CREATED' | 'ASSIGNED' | 'COMPLETED' | 'FAILED' | 'CANCELED';
export type StepStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
export type ProductLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

/** SAR 처리 레벨 단위 스테이지. 파이프라인 노드의 기본 식별자. */
export type SarStage = 'L0' | 'L1A' | 'L1B' | 'L1C' | 'L2A' | 'L2B' | 'L3';

/** D-01: 파이프라인 노드 종류. TRIGGER = 외부 이벤트(EI-01), SAR = SAR 처리 스테이지, CATALOG = 카탈로그 등록 */
export type PipelineNodeKind = 'TRIGGER' | 'SAR' | 'CATALOG';

/**
 * UI 표시용 CSC 범위. 백엔드 호환용으로 유지.
 * SAR 스테이지에서 파생되며, 직접 파이프라인 노드 식별자로 사용하지 않습니다.
 */
export type TargetCsc = 'CSC-02' | 'CSC-03' | 'CSC-04' | 'CSC-05' | 'CSC-06' | 'CSC-07';
export type AlertKind = 'MAX_RETRY' | 'PIPELINE_DELAY' | 'QUALITY_FAIL' | 'RESOURCE_THRESHOLD';
export type AuditEventType =
  | 'JOB_CREATED'
  | 'JOB_ASSIGNED'
  | 'JOB_COMPLETED'
  | 'JOB_FAILED'
  | 'PIPELINE_STARTED'
  | 'PIPELINE_REPROCESSED'
  | 'ALERT_DISPATCHED';

// --- SAR Stage Constants ---

export const SAR_STAGE_LABELS: Record<SarStage, string> = {
  L0: 'Raw Data Processing',
  L1A: 'SAR Focusing (SLC)',
  L1B: 'Multi-look (MLC/GRD)',
  L1C: 'Terrain Correction (RTC)',
  L2A: 'Map Products',
  L2B: 'Scene Analysis',
  L3: 'Application Products',
};

export const SAR_STAGE_TASKS: Record<SarStage, string[]> = {
  L0: ['Time Ordering & Synchronization', 'Metadata Extraction', 'Range Line Formatting', 'Calibration'],
  L1A: ['Range Compression', 'Azimuth Compression', 'Autofocusing', 'Multi-mode Support', 'SLC Product'],
  L1B: ['Multi-look Processing', 'Speckle Filtering', 'Ground-range Projection', 'Amplitude/phase Product'],
  L1C: ['DEM Integration', 'Geometric Correction', 'Radiometric Terrain Correction', 'Map Projection'],
  L2A: ['Incidence Angle Map', 'NESZ Map', 'Number-of-looks Map', 'Layover and Shadow Masks'],
  L2B: ['Object Detection', 'Change Detection'],
  L3: ['Application-specific Products'],
};

/** SAR 스테이지 → 산출물 레벨 매핑 (백엔드 호환용) */
export const SAR_STAGE_TO_LEVEL: Record<SarStage, ProductLevel> = {
  L0: 'LEVEL_0',
  L1A: 'LEVEL_1',
  L1B: 'LEVEL_1',
  L1C: 'LEVEL_1',
  L2A: 'LEVEL_2',
  L2B: 'LEVEL_2',
  L3: 'LEVEL_3',
};

/** SAR 스테이지 → 처리 CSC 매핑 (백엔드 호환용) */
export const SAR_STAGE_TO_CSC: Record<SarStage, TargetCsc> = {
  L0: 'CSC-03',
  L1A: 'CSC-04',
  L1B: 'CSC-04',
  L1C: 'CSC-05',
  L2A: 'CSC-05',
  L2B: 'CSC-06',
  L3: 'CSC-06',
};

// --- UI Display Helpers ---

export const JOB_STATUS_DISPLAY: Record<JobStatus, string> = {
  CREATED: 'PENDING',
  ASSIGNED: 'RUNNING',
  COMPLETED: 'DONE',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
};

/** 백엔드 호환용. 직접 노드 레이블로 사용하지 않습니다. */
export const CSC_LABELS: Record<TargetCsc, string> = {
  'CSC-02': '데이터 수집',
  'CSC-03': 'L0 Processing',
  'CSC-04': 'L1 SAR Processing',
  'CSC-05': 'L2 Post Processing',
  'CSC-06': 'L3 Geocoding',
  'CSC-07': '카탈로그 등록',
};

export const PRODUCT_LEVEL_LABELS: Record<ProductLevel, string> = {
  LEVEL_0: 'L0',
  LEVEL_1: 'L1',
  LEVEL_2: 'L2',
  LEVEL_3: 'L3',
};

/**
 * OPS-02: CSC별 pgmq Visibility Timeout (초).
 * ICD 6.6절 — CSC-08이 JOB_ASSIGNED 발행 시 적용하는 VT 상한.
 */
export const CSC_VT_SECONDS: Partial<Record<TargetCsc, number>> = {
  'CSC-03': 3_600,
  'CSC-04': 9_000,
  'CSC-05': 2_700,
  'CSC-06': 1_800,
};

// --- Domain Interfaces ---

export interface JobSummary {
  jobId: string;
  sceneId: string;
  status: JobStatus;
  currentLevel: ProductLevel | null;
  currentTargetCsc: TargetCsc | null;
  retryCount: number;
  startedAt: string;
  updatedAt: string;
}

export interface PipelineStep {
  order: number;
  kind?: PipelineNodeKind;
  parentOrder?: number | null;
  /** 표시 기본 필드. SAR 노드의 처리 스테이지. */
  sarStage?: SarStage;
  /** 백엔드 호환용. sarStage에서 파생되거나 백엔드 응답에서 직접 수신. */
  targetCsc: TargetCsc;
  productLevel: ProductLevel;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  outputPath?: string;
}

export interface JobDetail extends JobSummary {
  steps: PipelineStep[];
  acquisitionStart: string;
  acquisitionEnd: string;
  receivedAt: string;
  satelliteId: string;
  mode: string;
  rawDataPath: string;
}

export interface Alert {
  id: string;
  /** S-03: Optimistic concurrency — ETag 역할. If-Match 헤더 동반 전송용. */
  version: number;
  jobId: string;
  kind: AlertKind;
  message: string;
  acknowledged: boolean;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

export interface AuditEvent {
  id: string;
  eventType: AuditEventType;
  jobId: string;
  timestamp: string;
  detail: string;
  operatorId?: string;
}

export interface QueueHealth {
  queue: string;
  depth: number;
  oldestMessageAge: number;
  consumers: number;
  healthy: boolean;
}

export interface PipelineStepDefinition {
  order: number;
  kind: PipelineNodeKind;
  /** SAR 노드의 처리 스테이지. kind='SAR'일 때 필수. */
  sarStage?: SarStage;
  parentOrder?: number | null;
}

export interface PipelineEdge {
  source: number; // step order
  target: number; // step order
}

export interface PipelineDefinition {
  id: string;
  name: string;
  satelliteId: string;
  mode: string;
  steps: PipelineStepDefinition[];
  edges: PipelineEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePipelineData {
  name: string;
  satelliteId: string;
  mode: string;
  steps: Omit<PipelineStepDefinition, 'order'>[];
  edges?: PipelineEdge[];
}

export interface UpdatePipelineData {
  name?: string;
  satelliteId?: string;
  mode?: string;
  steps?: Omit<PipelineStepDefinition, 'order'>[];
  edges?: PipelineEdge[];
}

export interface ProcessingProfile {
  id: string;
  satelliteId: string;
  mode: string;
  polarization: string;
  parameters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// --- Service Response ---

export interface ServiceResponse {
  success: boolean;
  message: string;
  /** HTTP 상태 코드 (예: 409 충돌). 에러 시에만 포함. */
  code?: number;
}

export interface ServiceResponseWithData<T> extends ServiceResponse {
  data?: T;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  nextCursor?: string;
}

// --- Dashboard Stats ---

export interface DashboardStats {
  inflightJobs: number;
  completedLast24h: number;
  failedLast24h: number;
  avgProcessingTimeMs: number;
  unacknowledgedAlerts: number;
}
