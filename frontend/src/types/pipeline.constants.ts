// =============================================================================
// SDPE Pipeline Console — Domain Constants
// sdpe-shared(백엔드 NestJS 라이브러리)의 확정 값을 프론트엔드용으로 복제합니다.
// 출처: libs/sdpe-shared/src/csc08/ (ICD v1.0, 2026-03-20 기준)
// =============================================================================

import type {
  SarStage, TargetCsc, ProductLevel, RetryInterval, TriggerSource, JobStatus,
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

/** SAR 스테이지별 한글 설명 */
export const SAR_STAGE_DESCRIPTIONS: Record<SarStage, string> = {
  L0:  '원시 데이터를 시간 순으로 정렬하고 기본 보정을 수행합니다',
  L1A: 'SAR 신호의 초점을 맞추어 SLC(Single Look Complex) 영상을 생성합니다',
  L1B: '멀티룩 처리로 스펙클 노이즈를 줄이고 GRD 영상을 생성합니다',
  L1C: 'DEM 기반 지형 보정으로 정사 투영 영상(RTC)을 생성합니다',
  L2A: '입사각·NESZ·룩수 맵 등 부가 정보 산출물을 생성합니다',
  L2B: '객체 탐지 및 시계열 변화 탐지를 수행합니다',
  L3:  '사용자 요구에 맞는 최종 응용 제품을 생성합니다',
};

/** 비-SAR 노드별 정보 (한글 설명 + 프로세스 목록) */
export const NODE_KIND_INFO: Record<string, { description: string; processes: string[] }> = {
  TRIGGER: {
    description: 'EI-01 원시 데이터 수신 트리거(RAW_DATA_RECEIVED)로 파이프라인이 시작됩니다',
    processes:   ['수신 이벤트 감지', '원시 파일 무결성 검증', 'NAS 저장 확인'],
  },
  FILE_INPUT: {
    description: '기존 처리 결과를 입력으로 부분 재처리를 시작합니다',
    processes:   ['입력 파일 검증', '처리 레벨 확인', 'DAG 시작점 결정'],
  },
  JOB_INIT: {
    description: '작업을 생성하고 데이터 특성에 맞는 처리 프로파일을 선택합니다',
    processes:   ['Job 레코드 생성', '프로파일 매칭', 'DAG 구성', '우선순위 설정'],
  },
  CATALOG: {
    description: '처리 완료된 산출물의 메타데이터를 추출하고 카탈로그에 등록합니다',
    processes:   ['메타데이터 추출', '품질 검증', 'STAC 등록', '버전 관리'],
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
  'CSC-02': '데이터 수집',
  'CSC-03': 'L0 Processing',
  'CSC-04': 'L1 SAR Processing',
  'CSC-05': 'L2 Post Processing',
  'CSC-06': 'L3 Geocoding',
  'CSC-07': '카탈로그 등록',
  'CSC-08': '작업 초기화',
};

export const PRODUCT_LEVEL_LABELS: Record<ProductLevel, string> = {
  LEVEL_0: 'L0',
  LEVEL_1: 'L1',
  LEVEL_2: 'L2',
  LEVEL_3: 'L3',
};

export const RETRY_INTERVAL_LABELS: Record<RetryInterval, string> = {
  IMMEDIATE:           '즉시 재시도',
  EXPONENTIAL_BACKOFF: '지수 백오프',
};

export const TRIGGER_SOURCE_LABELS: Record<TriggerSource, string> = {
  PIPELINE_AUTO:    '자동 파이프라인',
  MANUAL_REQUEST:   '수동 요청',
  PARTIAL_REPROCESS: '부분 재처리',
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
  { csc: 'CSC-03' as TargetCsc, label: 'L0 처리',  vtSeconds: 3_600, stages: ['L0']           as SarStage[] },
  { csc: 'CSC-04' as TargetCsc, label: 'L1 처리',  vtSeconds: 9_000, stages: ['L1A', 'L1B', 'L1C'] as SarStage[] },
  { csc: 'CSC-05' as TargetCsc, label: 'L2 처리',  vtSeconds: 2_700, stages: ['L2A', 'L2B']   as SarStage[] },
  { csc: 'CSC-06' as TargetCsc, label: 'L3 처리',  vtSeconds: 1_800, stages: ['L3']           as SarStage[] },
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

/** ICD 3.5, 시스템 설계서 2.2: 최대 자동 재시도 횟수 (확정) */
export const MAX_RETRY_COUNT = 3;

/** SI-04 TBC: 처리 기한 옵션 (시간 단위). SLA 정책 확정 후 조정. */
export const DEADLINE_HOUR_OPTIONS = [2, 4, 6, 8, 12, 24] as const;

/** JOB_INIT에 처리 프로파일이 없을 때 캔버스 노드·콘솔·토스트 등에 공통 표시 */
export const JOB_INIT_PROFILE_MISSING_MESSAGE =
  '처리 프로파일이 선택되지 않았습니다. CSU-08.02에 따라 이 노드에서 위성·모드에 맞는 프로파일을 지정해야 하며, 미지정 상태로 실행하면 JOB_INIT 검증 또는 이후 CSC 단계에서 오류가 발생할 수 있습니다.';
