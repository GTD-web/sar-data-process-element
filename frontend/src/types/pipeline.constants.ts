// =============================================================================
// SDPE Pipeline Console — Domain Constants
// sdpe-shared(백엔드 NestJS 라이브러리)의 확정 값을 프론트엔드용으로 복제합니다.
// 출처: libs/sdpe-shared/src/csc08/ (ICD v1.0, 2026-03-20 기준)
// =============================================================================

import type {
  SarStage, TargetCsc, ProductLevel, RetryInterval, TriggerSource, JobStatus, PipelineEventType,
  SarSubStage, SpeckleFilter,
} from './pipeline.types';

// --- L1B Sub-stage Labels & CSU mapping ---

/** Speckle 필터의 사람-친화 라벨. CSU-04.06 sub-step. */
export const SPECKLE_FILTER_LABELS: Record<SpeckleFilter, string> = {
  lee: 'Lee',
  enhanced_lee: 'Enhanced Lee',
  gamma_map: 'Gamma-MAP',
  boxcar: 'Boxcar',
  median: 'Median',
};

/** sarSubStage → 그래프 노드 라벨 ('Multi-look 4×10', 'Speckle Lee 5×5' 등). */
export function subStageLabel(sub?: SarSubStage): string {
  if (!sub) return 'Multi-look';
  switch (sub.kind) {
    case 'multilook': {
      const r = sub.rangeLooks ?? 4;
      const a = sub.azimuthLooks ?? 10;
      return `Multi-look ${r}×${a}`;
    }
    case 'speckle': {
      const wx = sub.winX ?? 5;
      const wy = sub.winY ?? 5;
      return `Speckle ${SPECKLE_FILTER_LABELS[sub.filter]} ${wx}×${wy}`;
    }
    case 'ground-range':
      return 'Ground-range';
    case 'grd':
      return 'GRD';
  }
}

/** sarSubStage → ICD CSU 번호. multilook=04.05, speckle=04.06 등. */
export function subStageCsu(sub?: SarSubStage): string {
  if (!sub) return 'CSU-04.05';
  switch (sub.kind) {
    case 'multilook':    return 'CSU-04.05';
    case 'speckle':      return 'CSU-04.06';
    case 'ground-range': return 'CSU-04.07';
    case 'grd':          return 'CSU-04.08';
  }
}

/**
 * L1B 노드가 sub-stage 별로 실제 수행하는 task 만 골라낸다.
 * 전체 L1B task 리스트(`SAR_STAGE_TASKS.L1B`) 는 4 CSU 가 한 stage 에 묶여 있던
 * 옛 모델 기준이므로, sub-stage 가 정해진 L1B 노드는 그 CSU 가 수행하는 task 만
 * 노출돼야 Parameters 탭이 코드/실행 흐름과 일치한다.
 */
export function l1bSubStageTasks(sub?: SarSubStage): string[] {
  if (!sub) return ['Multi-look Processing'];
  switch (sub.kind) {
    case 'multilook':    return ['Multi-look Processing'];
    case 'speckle':      return ['Speckle Filtering'];
    case 'ground-range': return ['Ground-range Projection'];
    case 'grd':          return ['Amplitude/phase Product'];
  }
}

// --- SAR Stage Labels & Metadata ---

export const SAR_STAGE_LABELS: Record<SarStage, string> = {
  L0:  'Raw Data Processing',
  L1A: 'SAR Focusing (SLC)',
  L1B: 'Multi-look (MLC/GRD)',
  L1C: 'Geometric Terrain Correction (GTC)',
  L2A: 'Map Products',
  L2B: 'Scene Analysis',
  L3:  'Application Products',
};

export const SAR_STAGE_TASKS: Record<SarStage, string[]> = {
  L0:  ['De-packetizer', 'BAQ De-compression', 'Range Line Reconstructor', 'Auxiliary Data Extractor', 'Calibration', 'HDF5 Converter'],
  L1A: ['Range Compression', 'Azimuth Compression', 'SLC Product'],
  L1B: ['Multi-look Processing', 'Speckle Filtering', 'Ground-range Projection', 'Amplitude/phase Product'],
  L1C: ['DEM Integration', 'Geometric Correction', 'Geometric Terrain Correction', 'Map Projection'],
  L2A: ['Incidence Angle Map', 'NESZ Map', 'Number-of-looks Map', 'Layover and Shadow Masks'],
  L2B: ['Incidence Angle Map', 'Shadow Mask', 'Layover Mask', 'Co-registration', 'Object Detection', 'Change Detection'],
  L3:  ['Application Product Generation', 'Quality Validation', 'Customer Metadata Annotation', 'Output Packaging'],
};

/** SAR stage descriptions */
export const SAR_STAGE_DESCRIPTIONS: Record<SarStage, string> = {
  L0:  'Converts raw downlink frames to a calibrated Level-0 HDF5 product (CCSDS → BAQ → range lines → calibration)',
  L1A: 'Focuses SAR signals to generate SLC (Single Look Complex) images',
  L1B: 'Reduces speckle noise via multi-look processing and produces GRD images',
  L1C: 'Generates orthorectified imagery (GTC) via DEM-based geometric terrain correction',
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
  L1C: 'CSC-04',
  L2A: 'CSC-05',
  L2B: 'CSC-05',
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

/** CATALOG 노드 외부 publish 인증 모드 라벨 */
export const CATALOG_AUTH_MODE_LABELS: Record<'NONE' | 'BEARER' | 'API_KEY', string> = {
  NONE:    'No auth',
  BEARER:  'Bearer token',
  API_KEY: 'API key',
};

/** 동일 product key 충돌 시 정책 라벨 (ICD OPS-04 확정 동작은 NEW_VERSION_ARCHIVE_PREVIOUS) */
export const CATALOG_DUPLICATE_POLICY_LABELS: Record<
  'NEW_VERSION_ARCHIVE_PREVIOUS' | 'REPLACE_IN_PLACE' | 'REJECT_DUPLICATE',
  string
> = {
  NEW_VERSION_ARCHIVE_PREVIOUS: 'New version + archive previous',
  REPLACE_IN_PLACE:             'Replace in place',
  REJECT_DUPLICATE:             'Reject duplicate',
};

/** sar_products.status 초기값 라벨 */
export const CATALOG_INITIAL_STATUS_LABELS: Record<'REGISTERED' | 'PUBLISHED', string> = {
  REGISTERED: 'REGISTERED',
  PUBLISHED:  'PUBLISHED',
};

/** 품질 검증 실패 시 처리 정책 라벨 */
export const CATALOG_QUALITY_FAILURE_POLICY_LABELS: Record<
  'BLOCK_REGISTRATION' | 'REGISTER_WITH_FLAG' | 'ALERT_ONLY',
  string
> = {
  BLOCK_REGISTRATION: 'Block registration & alert',
  REGISTER_WITH_FLAG: 'Register with quality_passed=false',
  ALERT_ONLY:         'Alert only',
};

/**
 * Layer (a): 처리 결과 메타 → sar_products 컬럼.
 * ICD §6.8 sar_products 테이블 핵심 스켈레톤(확정) + SI-05 메시지(§6.7) 매핑.
 * read-only 표시용.
 */
export const SAR_PRODUCTS_INGEST_MAPPING: ReadonlyArray<{
  source: string;
  target: string;
  origin: 'SI-05' | 'SI-05 (TBC)' | 'EI-01';
  note?: string;
}> = [
  { source: 'satellite_id',      target: 'satellite_id',     origin: 'SI-05 (TBC)', note: '위성팀 코드 체계' },
  { source: 'product_level',     target: 'product_level',    origin: 'SI-05' },
  { source: 'product_type',      target: 'product_type',     origin: 'SI-05 (TBC)' },
  { source: 'acquisition_start', target: 'acquisition_start', origin: 'SI-05' },
  { source: 'acquisition_end',   target: 'acquisition_end',   origin: 'SI-05' },
  { source: 'footprint_wkt',     target: 'footprint',         origin: 'SI-05 (TBC)', note: 'POLYGON, EPSG:4326' },
  { source: 'product_path',      target: 'file_path',         origin: 'SI-05' },
];

/**
 * Layer (b): sar_products 컬럼 → STAC Item properties.
 * STAC SAR/EO Extension 표준 기반(확정) — 자물쇠로 잠근 채 표시.
 */
export const STAC_STANDARD_MAPPING: ReadonlyArray<{
  source: string;
  target: string;
  extension: 'core' | 'sar' | 'eo' | 'processing';
}> = [
  { source: 'satellite_id',      target: 'platform',           extension: 'core' },
  { source: 'acquisition_start', target: 'start_datetime',     extension: 'core' },
  { source: 'acquisition_end',   target: 'end_datetime',       extension: 'core' },
  { source: 'footprint',         target: 'geometry',           extension: 'core' },
  { source: 'product_level',     target: 'processing:level',   extension: 'processing' },
  { source: 'mode',              target: 'sar:instrument_mode', extension: 'sar' },
  { source: 'polarization',      target: 'sar:polarizations',  extension: 'sar' },
];

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

/**
 * PGMQ 이벤트 → 발행 큐 매핑.
 * - RAW_DATA_RECEIVED: SI-01, `sdpe.reception.events` (확정, ICD 6.6)
 * - PARTIAL/PRODUCT_REPROCESS_REQUESTED: SI-07. 전달 매체(REST vs pgmq) 미확정 — TBD 표기
 *   (출처: interfaces/csc-8/README.md:66, interfaces/csc-9/README.md:60)
 */
export const PGMQ_EVENT_TBD_QUEUE = 'TBD' as const;

export const PIPELINE_EVENT_SOURCE_QUEUE: Record<PipelineEventType, string> = {
  RAW_DATA_RECEIVED: 'sdpe.reception.events',
  PARTIAL_REPROCESS_REQUESTED: PGMQ_EVENT_TBD_QUEUE,
  PRODUCT_REPROCESS_REQUESTED: PGMQ_EVENT_TBD_QUEUE,
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
export const SATELLITE_OPTIONS = ['LumirX-1', 'LumirX-2', 'LumirX-3'] as const;

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
