// =============================================================================
// SDPE Pipeline Console — Domain Types
// DESIGN.md 6장 기반, libs/sdpe-shared 수기 복제 (v1)
// =============================================================================

// --- Enums / Unions ---

export type JobStatus = 'CREATED' | 'ASSIGNED' | 'COMPLETED' | 'FAILED' | 'CANCELED';
export type StepStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
export type ProductLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

/** D-01: 파이프라인 노드 종류. TRIGGER = 외부 이벤트(EI-01), CSC = 처리 서브시스템 */
export type PipelineNodeKind = 'TRIGGER' | 'CSC';

/**
 * UI 표시용 CSC 범위.
 * ICD interfaces/csc-8의 TargetCsc('CSC-03'~'CSC-06')는 CSC-08이 작업을 할당하는 처리 CSC만 포함.
 * 프론트엔드는 파이프라인 전 구간 시각화를 위해 CSC-02(수집)와 CSC-07(등록)을 추가합니다.
 * v2에서 @sdpe/contracts 패키지 분리 시 프론트 확장 타입으로 명시적 분리 예정.
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

// --- UI Display Helpers ---

export const JOB_STATUS_DISPLAY: Record<JobStatus, string> = {
  CREATED: 'PENDING',
  ASSIGNED: 'RUNNING',
  COMPLETED: 'DONE',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
};

export const CSC_LABELS: Record<TargetCsc, string> = {
  'CSC-02': '데이터 수집',
  'CSC-03': 'L0 Range Compression',
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
  kind?: PipelineNodeKind;
  targetCsc: TargetCsc;
  productLevel: ProductLevel;
  parentOrder?: number | null; // null = root, number = branches from that step
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
