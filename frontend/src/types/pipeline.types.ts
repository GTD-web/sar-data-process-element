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
export type PipelineNodeKind = 'TRIGGER' | 'FILE_INPUT' | 'JOB_INIT' | 'SAR' | 'CATALOG' | 'THUMBNAIL';

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
  | 'ALERT_DISPATCHED'
  | 'LOGIN_SUCCEEDED'
  | 'LOGIN_FAILED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_ROLE_CHANGED'
  | 'USER_DEACTIVATED'
  | 'PASSWORD_RESET'
  | 'PASSWORD_CHANGED';

/** ICD 3.5: 재시도 간격 전략 (TBC — 내부 결정 대기) */
export type RetryInterval = 'IMMEDIATE' | 'EXPONENTIAL_BACKOFF';

/** SI-04: 작업 할당 트리거 소스 (확정) */
export type TriggerSource = 'PIPELINE_AUTO' | 'MANUAL_REQUEST' | 'PARTIAL_REPROCESS';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export type PipelineEventType = 'RAW_DATA_RECEIVED' | 'PARTIAL_REPROCESS_REQUESTED' | 'PRODUCT_REPROCESS_REQUESTED';
export type RawDataStatus = 'RECEIVED' | 'MAPPED' | 'READY' | 'HOLD';
export type Hdf5NodeType = 'file' | 'group' | 'dataset';

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
 * CATALOG 노드 외부 STAC publish용 인증 모드.
 * 기본 동작은 ICD §6.8 SI-06(PostgreSQL 직접 쓰기)이라 인증이 불필요하지만,
 * 옵션으로 외부 STAC 브라우저/카탈로그에 추가 publish 할 때만 사용한다.
 */
export type CatalogAuthMode = 'NONE' | 'BEARER' | 'API_KEY';

/**
 * 동일 product key (job_id × product_level × product_type) 재등장 시 처리 정책.
 * - NEW_VERSION_ARCHIVE_PREVIOUS: 신규 버전 등록 + 이전 버전 아카이빙 (ICD OPS-04 확정)
 * - REPLACE_IN_PLACE: 기존 레코드 in-place 갱신 (운영자 정정용)
 * - REJECT_DUPLICATE: 중복 등록 거부, CSC-08에 실패 통보
 */
export type CatalogDuplicatePolicy =
  | 'NEW_VERSION_ARCHIVE_PREVIOUS'
  | 'REPLACE_IN_PLACE'
  | 'REJECT_DUPLICATE';

/** sar_products.status 초기값 (ICD §6.8 sar_products 테이블 컬럼) */
export type CatalogInitialStatus = 'REGISTERED' | 'PUBLISHED';

/** 품질 검증 실패 시 처리 정책 (SAD CSC-07.02 결과 → CSC-08.07 경로) */
export type CatalogQualityFailurePolicy =
  | 'BLOCK_REGISTRATION'
  | 'REGISTER_WITH_FLAG'
  | 'ALERT_ONLY';

/**
 * STAC Collection 매핑 규칙.
 * SAD 12.3 "STAC Collection: 위성별, 처리 레벨별 제품군" 정의에 따라
 * (satellite_id × product_level) → collection_id 로 결정한다.
 * '*' 는 와일드카드이며, 가장 구체적인 규칙이 우선한다.
 */
export interface CollectionMappingRule {
  satelliteId: string;
  productLevel: ProductLevel | '*';
  collectionId: string;
}

/**
 * CSC-07: CATALOG 노드 전용 설정.
 *
 * ICD/SAD 모델 기준:
 * - SI-06(PostgreSQL/PostGIS 직접 쓰기) 가 카탈로그 등록의 1차 경로이며,
 *   외부 HTTP STAC publish 는 옵션이다.
 * - sar_products / stac_items / stac_collections 테이블에 INSERT.
 * - CSU-07.02 품질 검증, CSU-07.05 생명주기, CSU-07.06 Thumbnail 생성을 함께 제어한다.
 */
export interface CatalogConfig {
  /** Section 1: Storage Target */
  storage: {
    /** Thumbnail / 부가 산출물 NAS 루트 경로 (CI-03 NAS Manager 경유) */
    nasRootPath: string;
    /** 외부 STAC 브라우저/카탈로그에 추가 publish 할지 여부 (옵션) */
    externalPublish: {
      enabled: boolean;
      endpoint?: string;
      authMode?: CatalogAuthMode;
      authSecretRef?: string;
    };
  };

  /** Section 2: Collection Mapping (SAD 12.3) */
  collectionMapping: CollectionMappingRule[];

  /** Section 3: Quality Validation (CSU-07.02) */
  quality: {
    /** SI-05 quality_run 토글 */
    runValidation: boolean;
    /** NESZ 임계값 (dB). 임계값 자체는 ICD TBC. */
    neszThresholdDb: number;
    /** PSLR 임계값 (dB). 임계값 자체는 ICD TBC. */
    pslrThresholdDb: number;
    failurePolicy: CatalogQualityFailurePolicy;
  };

  /** Section 4: Versioning & Lifecycle (OPS-04 재처리 흐름) */
  versioning: {
    duplicatePolicy: CatalogDuplicatePolicy;
    initialStatus: CatalogInitialStatus;
    /** CSU-07.06 Thumbnail 생성 여부 */
    generateThumbnail: boolean;
    /** Thumbnail 최대 변 길이 (px). undefined 면 기본값 사용. */
    thumbnailMaxPx?: number;
  };

  /**
   * Section 5: STAC Item Mapping.
   * 표준 매핑(SAR/EO Extension)은 코드 상수에서 read-only 로 표시하고,
   * 여기서는 사용자 정의 추가 매핑만 보관한다.
   * key = sar_products 컬럼명, value = STAC property 명
   */
  stacMapping: {
    customProperties: Record<string, string>;
  };
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
  mode?: string;
  polarization?: string;
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
  /** L1B 한정 sub-stage (Multi-look / Speckle / Ground-range / GRD 분기). */
  sarSubStage?: SarSubStage;
  /** FILE_INPUT 노드 전용. 파이프라인에 입력되는 기존 처리 결과의 레벨. */
  inputLevel?: ProductLevel;
  /** TRIGGER/FILE_INPUT 노드 전용. 시작 노드에 들어가는 입력 파일의 씬 식별자 (UI 표시용). */
  fileInputSceneId?: string;
  /** TRIGGER/FILE_INPUT 노드 전용. 시작 노드에 들어가는 입력 파일 경로 (UI 표시용). */
  fileInputFilePath?: string;
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

export interface RawDataSummary {
  id: string;
  title: string;
  satelliteId: string;
  mode: string;
  polarization: string;
  capturedAt: string;
  receivedAt: string;
  latitude: number;
  longitude: number;
  footprintKm: number;
  /** EPSG:4326 lon/lat ring coordinates describing the captured ground footprint. */
  footprint?: [number, number][];
  fileSizeBytes: number;
  status: RawDataStatus;
  rawDataPath: string;
  mappedPipelineId: string | null;
  mappedPipelineName?: string | null;
}

export interface Hdf5AttributeEntry {
  name: string;
  type: string;
  arraySize: string;
  value: string | number | boolean | string[] | number[];
  variableName?: string;
  description?: string;
}

export interface Hdf5NodeSummary {
  path: string;
  name: string;
  type: Hdf5NodeType;
  depth: number;
  attributeCount: number;
  childCount: number;
  dtype?: string;
  shape?: number[];
}

export interface Hdf5FileSummary {
  id: string;
  rawDataId: string;
  title: string;
  fileName: string;
  satelliteId: string;
  mode: string;
  receivedAt: string;
  capturedAt: string;
  fileSizeBytes: number;
  rootGroups: string[];
  nodes: Hdf5NodeSummary[];
  attributes: Record<string, Hdf5AttributeEntry[]>;
  notes: string[];
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

/**
 * L1B sub-stage. 한 L1B SarStage 안에 여러 CSU/필터가 있어 노드별로 어떤 처리인지
 * 구분해야 할 때 사용. 같은 sarStage='L1B' 노드를 여러 개 직렬로 연결하면서
 * 각 노드가 어떤 sub-operation 인지 그래프에서 직관적으로 표현하기 위함.
 *
 * - multilook: CSU-04.05 (한 파이프라인 안에서 보통 1번)
 * - speckle  : CSU-04.06, 필터 종류별로 직렬 중첩 가능 (lee → gamma_map → ...)
 * - ground-range / grd: CSU-04.07/08 (TBD, mock)
 */
export type SpeckleFilter = 'lee' | 'enhanced_lee' | 'gamma_map' | 'boxcar' | 'median';

export type SarSubStage =
  | { kind: 'multilook'; rangeLooks?: number; azimuthLooks?: number }
  | { kind: 'speckle'; filter: SpeckleFilter; winX?: number; winY?: number }
  | { kind: 'ground-range' }
  | { kind: 'grd' };

export interface PipelineStepDefinition {
  order: number;
  kind: PipelineNodeKind;
  /** SAR 노드의 처리 스테이지. kind='SAR'일 때 필수. */
  sarStage?: SarStage;
  /**
   * SAR L1B 한정 — 한 L1B 단계 안에서 어떤 CSU/필터를 수행하는지.
   * 같은 sarStage='L1B' 노드라도 sub-stage 가 달라 라벨/실행이 분기된다.
   * 미설정 시 default 는 multilook 으로 간주.
   */
  sarSubStage?: SarSubStage;
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
  /** CATALOG 노드 전용. STAC 엔드포인트/매핑 규칙 등. */
  catalogConfig?: CatalogConfig;
  /** UC13: 실행 시 건너뛰도록 비활성화된 노드. 진입 노드는 비활성화하지 않습니다. */
  disabled?: boolean;
  /** L1/L2 SAR 노드 전용. 사용자 업로드 처리 코드 (Mock — 사용자 정의 알고리즘). */
  code?: string;
  /** 업로드 코드의 언어 (monaco 식별자, 예: 'python', 'cpp'). */
  codeLanguage?: string;
  /** 업로드 시점의 원본 파일명. */
  codeFilename?: string;
}

export interface PipelineEdge {
  source: number; // step order
  target: number; // step order
}

export interface PipelineDefinition {
  id: string;
  name: string;
  steps: PipelineStepDefinition[];
  edges: PipelineEdge[];
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  archivedAt?: string;
  archiveReason?: string;
}

export interface PipelineActivationRule {
  id: string;
  pipelineId: string;
  active: boolean;
  eventType: PipelineEventType;
  sourceQueue: string;
  /** 이벤트 매칭 조건. 각 필드는 OR 매칭 (둘 중 어느 값이든 매칭되면 통과). */
  match: {
    satelliteIds?: string[];
    modes?: string[];
    polarizations?: string[];
    inputLevel?: ProductLevel;
  };
  triggerSource: TriggerSource;
  deployedAt?: string;
  description: string;
}

export interface SavePipelineActivationRuleData {
  id?: string;
  pipelineId: string;
  active: boolean;
  eventType: PipelineEventType;
  sourceQueue: string;
  match: {
    satelliteIds?: string[];
    modes?: string[];
    polarizations?: string[];
    inputLevel?: ProductLevel;
  };
  triggerSource: TriggerSource;
  description?: string;
}

export interface CreatePipelineData {
  name: string;
  steps: Omit<PipelineStepDefinition, 'order'>[];
  edges?: PipelineEdge[];
}

export interface UpdatePipelineData {
  name?: string;
  steps?: Omit<PipelineStepDefinition, 'order'>[];
  edges?: PipelineEdge[];
}

export interface ProcessingProfile {
  id: string;
  name: string;
  satelliteId?: string;
  mode?: string;
  polarization?: string;
  satelliteTags?: string[];
  modeTags?: string[];
  polarizationTags?: string[];
  processingStage?: string;
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
  rawDataId: string;
  sceneId: string;
  rawDataName?: string;
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
