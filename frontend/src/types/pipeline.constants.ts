// =============================================================================
// SDPE Pipeline Console — Domain Constants
// sdpe-shared(백엔드 NestJS 라이브러리)의 확정 값을 프론트엔드용으로 복제합니다.
// 출처: libs/sdpe-shared/src/csc08/ (ICD v1.0, 2026-03-20 기준)
// =============================================================================

import type {
  SarStage, TargetCsc, ProductLevel, RetryInterval, TriggerSource, JobStatus, PipelineEventType,
} from './pipeline.types';

// --- SAR Stage Labels & Metadata ---

export const SAR_STAGE_LABELS: Record<SarStage, string> = {
  L0:  'Raw Data Processing',
  L1A: 'SAR Focusing (SLC)',
  L1B: 'Multi-look (MLC/GRD)',
  L1C: 'Terrain Correction (RTC)',
  L2A: 'Map Products',
  L2B: 'Scene Analysis',
  L3:  'Application Products',
};

export const SAR_STAGE_TASKS: Record<SarStage, string[]> = {
  L0:  ['Time Ordering & Synchronization', 'Metadata Extraction', 'Range Line Formatting', 'Calibration'],
  L1A: ['Range Compression', 'Azimuth Compression', 'Autofocusing', 'Multi-mode Support', 'SLC Product'],
  L1B: ['Multi-look Processing', 'Speckle Filtering', 'Ground-range Projection', 'Amplitude/phase Product'],
  L1C: ['DEM Integration', 'Geometric Correction', 'Radiometric Terrain Correction', 'Map Projection'],
  L2A: ['Incidence Angle Map', 'NESZ Map', 'Number-of-looks Map', 'Layover and Shadow Masks'],
  L2B: ['Object Detection', 'Change Detection'],
  L3:  ['Application-specific Products'],
};

/** SAR stage descriptions */
export const SAR_STAGE_DESCRIPTIONS: Record<SarStage, string> = {
  L0:  'Sorts raw data in time order and applies basic calibration',
  L1A: 'Focuses SAR signals to generate SLC (Single Look Complex) images',
  L1B: 'Reduces speckle noise via multi-look processing and produces GRD images',
  L1C: 'Generates orthorectified imagery (RTC) via DEM-based terrain correction',
  L2A: 'Produces auxiliary maps such as incidence angle, NESZ, and number of looks',
  L2B: 'Performs object detection and time-series change detection',
  L3:  'Generates final application products tailored to user requirements',
};

/** Non-SAR node info (descriptions + process list) */
export const NODE_KIND_INFO: Record<string, { description: string; processes: string[] }> = {
  TRIGGER: {
    description: 'Pipeline starts with the EI-01 raw data reception trigger (RAW_DATA_RECEIVED)',
    processes:   ['Reception Event Detection', 'Raw File Integrity Check', 'NAS Staging Verification'],
  },
  FILE_INPUT: {
    description: 'Starts partial reprocessing using existing processing results as input',
    processes:   ['Input File Validation', 'Processing Level Resolution', 'DAG Start Point Selection'],
  },
  JOB_INIT: {
    description: 'Creates a job and selects a processing profile matching the data characteristics',
    processes:   ['Job Record Creation', 'Profile Matching', 'DAG Construction', 'Priority Assignment'],
  },
  CATALOG: {
    description: 'Extracts metadata from completed products and registers them in the catalog',
    processes:   ['Metadata Extraction', 'Quality Validation', 'STAC Registration', 'Version Management'],
  },
  THUMBNAIL: {
    description: 'Generates quick-look preview images early, in parallel with downstream processing (SAD CSU-07.06)',
    processes:   ['Quick-look Rendering', 'KMZ Generation', 'NAS Storage', 'Preview URL Refresh'],
  },
};

// --- SAR Stage Mappings ---

/** SAR 스테이지 → 산출물 레벨 매핑 (백엔드 호환용) */
export const SAR_STAGE_TO_LEVEL: Record<SarStage, ProductLevel> = {
  L0:  'LEVEL_0',
  L1A: 'LEVEL_1',
  L1B: 'LEVEL_1',
  L1C: 'LEVEL_1',
  L2A: 'LEVEL_2',
  L2B: 'LEVEL_2',
  L3:  'LEVEL_3',
};

/** SAR 스테이지 → 처리 CSC 매핑 (백엔드 호환용) */
export const SAR_STAGE_TO_CSC: Record<SarStage, TargetCsc> = {
  L0:  'CSC-03',
  L1A: 'CSC-04',
  L1B: 'CSC-04',
  L1C: 'CSC-05',
  L2A: 'CSC-05',
  L2B: 'CSC-06',
  L3:  'CSC-06',
};

// --- UI Display Labels ---

export const JOB_STATUS_DISPLAY: Record<JobStatus, string> = {
  CREATED:   'PENDING',
  ASSIGNED:  'RUNNING',
  COMPLETED: 'DONE',
  FAILED:    'FAILED',
  CANCELED:  'CANCELED',
};

/** 백엔드 호환용. 직접 노드 레이블로 사용하지 않습니다. */
export const CSC_LABELS: Record<TargetCsc, string> = {
  'CSC-02': 'Data Collection',
  'CSC-03': 'L0 Processing',
  'CSC-04': 'L1 SAR Processing',
  'CSC-05': 'L2 Post Processing',
  'CSC-06': 'L3 Geocoding',
  'CSC-07': 'Catalog Registration',
  'CSC-08': 'Job Initialization',
};

export const PRODUCT_LEVEL_LABELS: Record<ProductLevel, string> = {
  LEVEL_0: 'L0',
  LEVEL_1: 'L1',
  LEVEL_2: 'L2',
  LEVEL_3: 'L3',
};

export const RETRY_INTERVAL_LABELS: Record<RetryInterval, string> = {
  IMMEDIATE:           'Immediate retry',
  EXPONENTIAL_BACKOFF: 'Exponential backoff',
};

export const TRIGGER_SOURCE_LABELS: Record<TriggerSource, string> = {
  PIPELINE_AUTO:    'Auto on raw reception',
  MANUAL_REQUEST:   'Manual request',
  PARTIAL_REPROCESS: 'Partial reprocess',
};

export const PIPELINE_EVENT_TYPE_LABELS: Record<PipelineEventType, string> = {
  RAW_DATA_RECEIVED: 'Raw data received',
  PARTIAL_REPROCESS_REQUESTED: 'Partial reprocess requested',
  PRODUCT_REPROCESS_REQUESTED: 'Product reprocess requested',
};

// --- ICD Operational Constants ---
// 출처: libs/sdpe-shared 확정 값 (ICD v1.0 기준)

/**
 * OPS-02: CSC별 pgmq Visibility Timeout (초).
 * ICD 6.6절 — CSC-08이 JOB_ASSIGNED 발행 시 적용하는 VT 상한.
 * 출처: sdpe-shared/src/csc08/constant/queue-name.constant.ts (확정)
 */
export const CSC_VT_SECONDS: Partial<Record<TargetCsc, number>> = {
  'CSC-03': 3_600,  // 1시간
  'CSC-04': 9_000,  // 2.5시간
  'CSC-05': 2_700,  // 45분
  'CSC-06': 1_800,  // 30분
};

/**
 * OPS-02 정상 처리 흐름 — 스테퍼용 CSC 처리 레벨 그룹 정의.
 * 세분화된 SAR 스테이지(L1A/L1B/L1C)를 CSC 단위로 묶어서 표시.
 */
export const CSC_PROCESSING_LEVELS = [
  { csc: 'CSC-03' as TargetCsc, label: 'L0 Processing',  vtSeconds: 3_600, stages: ['L0']           as SarStage[] },
  { csc: 'CSC-04' as TargetCsc, label: 'L1 Processing',  vtSeconds: 9_000, stages: ['L1A', 'L1B', 'L1C'] as SarStage[] },
  { csc: 'CSC-05' as TargetCsc, label: 'L2 Processing',  vtSeconds: 2_700, stages: ['L2A', 'L2B']   as SarStage[] },
  { csc: 'CSC-06' as TargetCsc, label: 'L3 Processing',  vtSeconds: 1_800, stages: ['L3']           as SarStage[] },
] as const;

/**
 * PGMQ 큐 이름 (확정).
 * 출처: sdpe-shared/src/csc08/constant/queue-name.constant.ts
 */
export const QUEUE_NAME = {
  RECEPTION_EVENTS:    'sdpe.reception.events',
  PROCESSING_EVENTS:   'sdpe.processing.events',
  JOBS_CSC02:          'sdpe.jobs.csc02',
  JOBS_CSC03:          'sdpe.jobs.csc03',
  JOBS_CSC04:          'sdpe.jobs.csc04',
  JOBS_CSC05:          'sdpe.jobs.csc05',
  JOBS_CSC06:          'sdpe.jobs.csc06',
  CATALOG_REGISTRATION: 'sdpe.catalog.registration',
} as const;

/** EI-01 TBC: 편파 구성 옵션. 위성팀 협의 후 확정 예정. */
export const POLARIZATION_OPTIONS = ['HH', 'VV', 'HH+HV', 'VV+VH', 'HH+HV+VH+VV'] as const;

/**
 * 매칭 가능한 위성 식별자.
 * 처리 프로파일 / 파이프라인 / 자동 실행 규칙이 공통으로 사용한다.
 */
export const SATELLITE_OPTIONS = ['Lumir-X1', 'Lumir-X2', 'Lumir-X3'] as const;

/**
 * 매칭 가능한 관측 모드.
 * 처리 프로파일 / 파이프라인 / 자동 실행 규칙이 공통으로 사용한다.
 */
export const MODE_OPTIONS = ['Stripmap', 'ScanSAR', 'Spotlight'] as const;

/** ICD 3.5, 시스템 설계서 2.2: 최대 자동 재시도 횟수 (확정) */
export const MAX_RETRY_COUNT = 3;

/** SI-04 TBC: 처리 기한 옵션 (시간 단위). SLA 정책 확정 후 조정. */
export const DEADLINE_HOUR_OPTIONS = [2, 4, 6, 8, 12, 24] as const;

/** Shared message shown on canvas nodes, console, and toasts when JOB_INIT has no processing profile */
export const JOB_INIT_PROFILE_MISSING_MESSAGE =
  'No processing profile is selected. Per CSU-08.02, this node must specify a profile matching the satellite and mode; running without one may cause errors in JOB_INIT validation or in later CSC stages.';
