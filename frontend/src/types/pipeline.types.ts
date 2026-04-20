// =============================================================================
// SDPE Pipeline Console — Domain Types
// 순수 타입/인터페이스만 정의합니다. 상수는 pipeline.constants.ts를 참고하세요.
// =============================================================================

// --- Primitive Unions ---

export type JobStatus = 'CREATED' | 'ASSIGNED' | 'COMPLETED' | 'FAILED' | 'CANCELED';
export type StepStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'CANCELED';
export type ProductLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

/** SAR 처리 레벨 단위 스테이지. 파이프라인 노드의 기본 식별자. */
export type SarStage = 'L0' | 'L1A' | 'L1B' | 'L1C' | 'L2A' | 'L2B' | 'L3';

/**
 * D-01: 파이프라인 노드 종류.
 * TRIGGER = 외부 이벤트(EI-01), FILE_INPUT = 기존 처리 결과 파일 입력(SI-07 부분 재처리),
 * JOB_INIT = 작업 생성·프로파일 선택(CSU-08.02),
 * SAR = SAR 처리 스테이지, CATALOG = 카탈로그 등록
 */
export type PipelineNodeKind = 'TRIGGER' | 'FILE_INPUT' | 'JOB_INIT' | 'SAR' | 'CATALOG';

/**
 * UI 표시용 CSC 범위. 백엔드 호환용으로 유지.
 * SAR 스테이지에서 파생되며, 직접 파이프라인 노드 식별자로 사용하지 않습니다.
 * CSC-08 = Pipeline Orchestrator 자신 (JOB_INIT 노드 전용)
 */
export type TargetCsc = 'CSC-02' | 'CSC-03' | 'CSC-04' | 'CSC-05' | 'CSC-06' | 'CSC-07' | 'CSC-08';

export type AlertKind = 'MAX_RETRY' | 'PIPELINE_DELAY' | 'QUALITY_FAIL' | 'RESOURCE_THRESHOLD';

export type AuditEventType =
  | 'JOB_CREATED'
  | 'JOB_ASSIGNED'
  | 'JOB_COMPLETED'
  | 'JOB_FAILED'
  | 'PIPELINE_STARTED'
  | 'PIPELINE_REPROCESSED'
  | 'ALERT_DISPATCHED';

/** ICD 3.5: 재시도 간격 전략 (TBC — 내부 결정 대기) */
export type RetryInterval = 'IMMEDIATE' | 'EXPONENTIAL_BACKOFF';

/** SI-04: 작업 할당 트리거 소스 (확정) */
export type TriggerSource = 'PIPELINE_AUTO' | 'MANUAL_REQUEST' | 'PARTIAL_REPROCESS';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

// --- Domain Interfaces ---

/**
 * FILE_INPUT 노드 전용 설정.
 * 부분 재처리 시 파이프라인에 입력할 기존 처리 결과 파일을 지정합니다.
 */
export interface FileInputConfig {
  /** 입력 파일에 해당하는 씬 식별자 */
  sceneId: string;
  /** 입력 파일 경로 (부분 재처리 시 사용할 기존 처리 결과) */
  inputFilePath: string;
}

/**
 * CSU-08.02: JOB_INIT 노드 전용 설정.
 * 파이프라인 정의(template)에서 프로파일 선택 규칙과 작업 기본값을 정의.
 */
export interface JobInitConfig {
  polarization: string;
  profileId?: string;
  priority: number;
  deadlineHours?: number;
  retryInterval: RetryInterval;
}

/** CSU-08.02에서 선택된 처리 프로파일 요약 정보 (JobDetail에 포함) */
export interface ProcessingProfileSummary {
  id: string;
  name: string;
  mode: string;
  polarization: string;
  description?: string;
}

export interface JobSummary {
  jobId: string;
  pipelineId: string;
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
  /** FILE_INPUT 노드 전용. 파이프라인에 입력되는 기존 처리 결과의 레벨. */
  inputLevel?: ProductLevel;
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
  /**
   * 실제 실행된 태스크 이름 목록.
   * undefined 시 해당 스테이지의 전체 태스크가 실행된 것으로 표시.
   */
  enabledTasks?: string[];
}

export interface JobDetail extends JobSummary {
  steps: PipelineStep[];
  acquisitionStart: string;
  acquisitionEnd: string;
  receivedAt: string;
  satelliteId: string;
  mode: string;
  rawDataPath: string;
  /** CSU-08.02: 작업 생성 시 선택된 처리 프로파일 */
  processingProfile?: ProcessingProfileSummary;
  priority?: number;
  triggerSource?: TriggerSource;
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

/** 큐 내 대기 중인 개별 메시지 */
export interface QueueMessage {
  messageId: string;
  jobId: string;
  satelliteId: string;
  sarStage?: SarStage;
  enqueuedAt: string;
  priority: number;
}

/** 큐별 처리량 통계 */
export interface QueueThroughput {
  processed1h: number;
  processed24h: number;
  avgProcessingMs: number;
}

/** Dead Letter — 최대 재시도 초과 실패 메시지 */
export interface QueueDeadLetter {
  messageId: string;
  jobId: string;
  failedAt: string;
  retryCount: number;
  errorMessage: string;
}

/** 큐 depth 추이 데이터 포인트 (sparkline용) */
export interface QueueDepthPoint {
  timestamp: string;
  depth: number;
}

export interface QueueHealth {
  queue: string;
  depth: number;
  oldestMessageAge: number;
  consumers: number;
  healthy: boolean;
  /** 대기 중인 메시지 목록 */
  messages: QueueMessage[];
  /** 처리량 통계 */
  throughput: QueueThroughput;
  /** Dead Letter 목록 */
  deadLetters: QueueDeadLetter[];
  /** 최근 1시간 depth 추이 (5분 간격, 12개 포인트) */
  depthHistory: QueueDepthPoint[];
}

export interface PipelineStepDefinition {
  order: number;
  kind: PipelineNodeKind;
  /** SAR 노드의 처리 스테이지. kind='SAR'일 때 필수. */
  sarStage?: SarStage;
  /** FILE_INPUT 노드 전용. 파이프라인에 입력되는 기존 처리 결과의 레벨. */
  inputLevel?: ProductLevel;
  parentOrder?: number | null;
  /**
   * SAR 노드에서 실행할 태스크 이름 목록.
   * undefined 또는 생략 시 해당 스테이지의 전체 태스크를 실행함 (기본값).
   */
  enabledTasks?: string[];
  /** JOB_INIT 노드 전용. 처리 프로파일 선택 규칙 + 작업 기본값. */
  jobInitConfig?: JobInitConfig;
  /** FILE_INPUT 노드 전용. 입력 파일 선택 설정. */
  fileInputConfig?: FileInputConfig;
  /** UC13: 실행 시 건너뛰도록 비활성화된 노드. 진입 노드는 비활성화하지 않습니다. */
  disabled?: boolean;
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
  archived?: boolean;
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
  name: string;
  satelliteId: string;
  mode: string;
  polarization: string;
  priority: number;
  description?: string;
  parameters: Record<string, unknown>;
  referencedPipelineCount?: number;
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

// --- Execution Logs ---

export interface ExecutionLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  jobId?: string;
  /** 로그를 발생시킨 스텝 (SAR 스테이지명 또는 노드 종류) */
  source: string;
  message: string;
  detail?: string;
}

// --- Products ---

export type ProductStatus = 'COMPLETED' | 'FAILED' | 'PROCESSING';

export interface ProductQuality {
  nesz: { value: number; unit: string; pass: boolean };
  pslr: { value: number; unit: string; pass: boolean };
  geometricAccuracy: { value: number; unit: string; pass: boolean };
  radiometricCalibration: { pass: boolean; detail?: string };
}

export interface Product {
  id: string;
  sceneId: string;
  jobId: string;
  level: ProductLevel;
  satelliteId: string;
  mode: string;
  polarization: string;
  status: ProductStatus;
  spatialExtent: { west: number; south: number; east: number; north: number };
  acquisitionStart: string;
  acquisitionEnd: string;
  resolutionRange: number;
  resolutionAzimuth: number;
  processingTimeMs: number;
  quality?: ProductQuality;
  thumbnailUrl?: string;
  createdAt: string;
}

// --- Dashboard Stats ---

export interface DashboardStats {
  inflightJobs: number;
  completedLast24h: number;
  failedLast24h: number;
  avgProcessingTimeMs: number;
  unacknowledgedAlerts: number;
}
