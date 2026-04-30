import type { IPipelineUIService } from '@/services/pipeline.service.interface';
import type {
  Alert,
  AuditEvent,
  CreatePipelineData,
  DashboardStats,
  ExecutionLog,
  Hdf5AttributeEntry,
  Hdf5FileSummary,
  Hdf5NodeSummary,
  JobDetail,
  JobSummary,
  LogLevel,
  PaginatedResponse,
  PipelineDefinition,
  PipelineStep,
  ProcessingProfile,
  Product,
  ProductQuality,
  ProductStatus,
  RawDataStatus,
  RawDataSummary,
  QueueHealth,
  QueueMessage,
  QueueDeadLetter,
  QueueDepthPoint,
  SarStage,
  SavePipelineActivationRuleData,
  ServiceResponse,
  ServiceResponseWithData,
  UpdatePipelineData,
  JobStatus,
  StepStatus,
  ProductLevel,
  TargetCsc,
  AlertKind,
  AuditEventType,
  PipelineNodeKind,
  PipelineActivationRule,
  ProcessingProfileSummary,
  TriggerSource,
  JobInitConfig,
} from '@/types/pipeline';
import {
  PIPELINE_EVENT_SOURCE_QUEUE,
  SAR_STAGE_TO_CSC,
  SAR_STAGE_TO_LEVEL,
  SATELLITE_OPTIONS,
  MODE_OPTIONS,
  POLARIZATION_OPTIONS,
} from '@/types/pipeline';
import type {
  CreateUserRequest,
  Session,
  UpdateUserRequest,
  User,
  UserListQuery,
} from '@/types/user';

// =============================================================================
// Mock Data Generators
// =============================================================================

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function randomDate(daysBack: number): string {
  const d = new Date();
  d.setHours(d.getHours() - Math.random() * daysBack * 24);
  return d.toISOString();
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const SCENE_IDS = [
  'LX1-20260401-001', 'LX1-20260401-002', 'LX1-20260402-003',
  'LX1-20260403-004', 'LX1-20260403-005', 'LX1-20260404-006',
  'LX1-20260405-007', 'LX1-20260406-008', 'LX1-20260407-009',
  'LX1-20260408-010', 'LX1-20260409-011', 'LX1-20260410-012',
];

const SATELLITE_IDS = SATELLITE_OPTIONS;
const SATELLITE_SHORT_NAMES: Record<string, string> = {
  'Lumir-X1': 'X1',
  'Lumir-X2': 'X2',
  'Lumir-X3': 'X3',
};
const MODES = MODE_OPTIONS;

const MOCK_PROCESSING_PROFILES: ProcessingProfile[] = [
  { id: 'PROF-L0-INGEST-BASELINE', name: 'L0 Ingest Baseline', processingStage: 'L0', priority: 3, description: 'Generic L0 ingest and raw product preparation profile.', parameters: { rangeLooks: 1, azimuthLooks: 1 }, referencedPipelineCount: 2, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'PROF-L1A-RANGE-BASELINE', name: 'L1A Range Processing Baseline', processingStage: 'L1A', priority: 4, description: 'Generic range compression and calibration preparation profile.', parameters: { rangeWindow: 'hann', calibration: true }, referencedPipelineCount: 3, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'PROF-L1B-AZIMUTH-BASELINE', name: 'L1B Azimuth Processing Baseline', processingStage: 'L1B', priority: 4, description: 'Generic azimuth focusing profile.', parameters: { azimuthWindow: 'kaiser', dopplerCentroid: 'auto' }, referencedPipelineCount: 2, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'PROF-L1C-SLC-BASELINE', name: 'L1C SLC Baseline', processingStage: 'L1C', priority: 5, description: 'Generic SLC formation profile.', parameters: { phasePreserve: true, multilook: false }, referencedPipelineCount: 2, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'PROF-L2-GEOCODE-BASELINE', name: 'L2 Geocoding Baseline', processingStage: 'L2', priority: 5, description: 'Generic terrain correction and geocoding profile.', parameters: { dem: 'default', projection: 'EPSG:4326' }, referencedPipelineCount: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'PROF-L2A-RADIOMETRY-BASELINE', name: 'L2A Radiometry Baseline', processingStage: 'L2A', priority: 6, description: 'Generic radiometric normalization profile.', parameters: { normalizeSigma0: true }, referencedPipelineCount: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'PROF-L2B-ANALYSIS-BASELINE', name: 'L2B Analysis Baseline', processingStage: 'L2B', priority: 6, description: 'Generic analysis-ready product profile.', parameters: { despeckle: 'adaptive' }, referencedPipelineCount: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'PROF-L3-MOSAIC-BASELINE', name: 'L3 Mosaic Baseline', processingStage: 'L3', priority: 7, description: 'Generic L3 aggregation and mosaic profile.', parameters: { tileSize: 2048 }, referencedPipelineCount: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

const MODE_DEFAULT_POLARIZATION: Record<string, string> = {
  Stripmap: 'HH+HV',
  ScanSAR: 'VV',
  Spotlight: 'HH',
};

type StepDef = { kind: PipelineNodeKind; sarStage?: SarStage; inputLevel?: ProductLevel; enabledTasks?: string[] };
type BranchedEdge = { source: number; target: number };

/** D-01: 파이프라인 첫 노드 — RAW_DATA_RECEIVED 트리거 (EI-01) */
const TRIGGER_STEP: StepDef = { kind: 'TRIGGER' };
/** CSU-08.02: 작업 생성 + 처리 프로파일 선택 */
const JOB_INIT_STEP: StepDef = { kind: 'JOB_INIT' };
const CATALOG_STEP: StepDef = { kind: 'CATALOG' };

/** Stripmap 전체 파이프라인: TRIGGER → JOB_INIT → L0 → L1A → L1B → L1C → L2A → L2B → L3 → CATALOG */
const PIPELINE_STEPS: StepDef[] = [
  TRIGGER_STEP,
  JOB_INIT_STEP,
  { kind: 'SAR', sarStage: 'L0' },
  { kind: 'SAR', sarStage: 'L1A' },
  { kind: 'SAR', sarStage: 'L1B' },
  { kind: 'SAR', sarStage: 'L1C' },
  { kind: 'SAR', sarStage: 'L2A' },
  { kind: 'SAR', sarStage: 'L2B' },
  { kind: 'SAR', sarStage: 'L3' },
  CATALOG_STEP,
];

/** L1 까지만 처리하고 종료하는 파이프라인 (Quick-Look / 영상화만 필요한 운영 케이스) */
const PIPELINE_STEPS_TARGET_L1: StepDef[] = [
  TRIGGER_STEP,
  JOB_INIT_STEP,
  { kind: 'SAR', sarStage: 'L0' },
  { kind: 'SAR', sarStage: 'L1A' },
  { kind: 'SAR', sarStage: 'L1B' },
  { kind: 'SAR', sarStage: 'L1C' },
  CATALOG_STEP,
];

/** L2 까지만 처리하고 종료하는 파이프라인 (Geocoding 까지만 필요한 운영 케이스) */
const PIPELINE_STEPS_TARGET_L2: StepDef[] = [
  TRIGGER_STEP,
  JOB_INIT_STEP,
  { kind: 'SAR', sarStage: 'L0' },
  { kind: 'SAR', sarStage: 'L1A' },
  { kind: 'SAR', sarStage: 'L1B' },
  { kind: 'SAR', sarStage: 'L1C' },
  { kind: 'SAR', sarStage: 'L2A' },
  { kind: 'SAR', sarStage: 'L2B' },
  CATALOG_STEP,
];

// ─── 부분 재처리 파이프라인 스텝 정의 (OPS-06) ─────────────────────────────
/** L1 결과 입력 → L2A부터 처리 (OPS-06 주요 시나리오, Stripmap) */
const PARTIAL_L1_STRIPMAP_STEPS: StepDef[] = [
  { kind: 'FILE_INPUT', inputLevel: 'LEVEL_1' },
  JOB_INIT_STEP,
  { kind: 'SAR', sarStage: 'L2A' },
  { kind: 'SAR', sarStage: 'L2B' },
  { kind: 'SAR', sarStage: 'L3' },
  CATALOG_STEP,
];

/** L1 결과 입력 → ScanSAR (L1B까지가 끝이므로 등록만 수행) */
const PARTIAL_L1_SCANSAR_STEPS: StepDef[] = [
  { kind: 'FILE_INPUT', inputLevel: 'LEVEL_1' },
  JOB_INIT_STEP,
  CATALOG_STEP,
];

/** L1 결과 입력 → Spotlight (L1C까지가 끝이므로 등록만 수행) */
const PARTIAL_L1_SPOTLIGHT_STEPS: StepDef[] = [
  { kind: 'FILE_INPUT', inputLevel: 'LEVEL_1' },
  JOB_INIT_STEP,
  CATALOG_STEP,
];

/** L2 결과 입력 → L3만 처리 후 등록 */
const PARTIAL_L2_STEPS: StepDef[] = [
  { kind: 'FILE_INPUT', inputLevel: 'LEVEL_2' },
  JOB_INIT_STEP,
  { kind: 'SAR', sarStage: 'L3' },
  CATALOG_STEP,
];

/** L0 결과 HDF5 입력에서 시작 → L1/L2/L3 후속 흐름 처리 (Raw trigger 없음 → 부분 재처리) */
const START_FROM_L0_STEPS: StepDef[] = [
  { kind: 'FILE_INPUT', inputLevel: 'LEVEL_0' },
  JOB_INIT_STEP,
  { kind: 'SAR', sarStage: 'L1A' },
  { kind: 'SAR', sarStage: 'L1B' },
  { kind: 'SAR', sarStage: 'L1C' },
  { kind: 'SAR', sarStage: 'L2A' },
  { kind: 'SAR', sarStage: 'L2B' },
  { kind: 'SAR', sarStage: 'L3' },
  CATALOG_STEP,
];

/** L1 결과 HDF5 입력에서 시작 → L2/L3 후속 흐름 처리 (Raw trigger 없음 → 부분 재처리) */
const START_FROM_L1_STEPS: StepDef[] = [
  { kind: 'FILE_INPUT', inputLevel: 'LEVEL_1' },
  JOB_INIT_STEP,
  { kind: 'SAR', sarStage: 'L2A' },
  { kind: 'SAR', sarStage: 'L2B' },
  { kind: 'SAR', sarStage: 'L3' },
  CATALOG_STEP,
];

/** L2 결과 HDF5 입력에서 시작 → L3만 처리 후 등록 (Raw trigger 없음 → 부분 재처리) */
const START_FROM_L2_STEPS: StepDef[] = [
  { kind: 'FILE_INPUT', inputLevel: 'LEVEL_2' },
  JOB_INIT_STEP,
  { kind: 'SAR', sarStage: 'L3' },
  CATALOG_STEP,
];

// ─── 분기형 DAG 파이프라인 (DAG-RATIONALE §5) ─────────────────────────────
// 선형 파이프라인으로는 표현 불가능한 구성을 검증하기 위한 샘플.

/** §5.1 다중 레벨 제품 생성: L1C → {L2A, L2B, L3} fan-out → CATALOG fan-in */
const MULTI_LEVEL_BRANCH_STEPS: StepDef[] = [
  TRIGGER_STEP,                          // 1
  JOB_INIT_STEP,                         // 2
  { kind: 'SAR', sarStage: 'L0' },       // 3
  { kind: 'SAR', sarStage: 'L1A' },      // 4
  { kind: 'SAR', sarStage: 'L1B' },      // 5
  { kind: 'SAR', sarStage: 'L1C' },      // 6
  { kind: 'SAR', sarStage: 'L2A' },      // 7
  { kind: 'SAR', sarStage: 'L2B' },      // 8
  { kind: 'SAR', sarStage: 'L3' },       // 9
  CATALOG_STEP,                          // 10
];
const MULTI_LEVEL_BRANCH_EDGES: BranchedEdge[] = [
  { source: 1, target: 2 },
  { source: 2, target: 3 },
  { source: 3, target: 4 },
  { source: 4, target: 5 },
  { source: 5, target: 6 },
  // fan-out
  { source: 6, target: 7 },
  { source: 6, target: 8 },
  { source: 6, target: 9 },
  // fan-in
  { source: 7, target: 10 },
  { source: 8, target: 10 },
  { source: 9, target: 10 },
];

/**
 * §5.1 확장 샘플: 다중 레벨 생성 중 L2A/L2B 저장 연결을 의도적으로 제거한 커스텀 저장 파이프라인.
 * 기본적으로는 L2A/L2B/L3 세 결과를 모두 저장할 수 있지만, 운영자가 두 출력 저장선을 끊고
 * L3만 카탈로그로 넘기도록 구성할 수 있음을 보여주는 UI 검증용 샘플.
 */
const MULTI_LEVEL_CUSTOM_OUTPUT_STEPS: StepDef[] = [
  TRIGGER_STEP,                          // 1
  JOB_INIT_STEP,                         // 2
  { kind: 'SAR', sarStage: 'L0' },       // 3
  { kind: 'SAR', sarStage: 'L1A' },      // 4
  { kind: 'SAR', sarStage: 'L1B' },      // 5
  { kind: 'SAR', sarStage: 'L1C' },      // 6
  { kind: 'SAR', sarStage: 'L2A' },      // 7
  { kind: 'SAR', sarStage: 'L2B' },      // 8
  { kind: 'SAR', sarStage: 'L3' },       // 9
  CATALOG_STEP,                          // 10
];
const MULTI_LEVEL_CUSTOM_OUTPUT_EDGES: BranchedEdge[] = [
  { source: 1, target: 2 },
  { source: 2, target: 3 },
  { source: 3, target: 4 },
  { source: 4, target: 5 },
  { source: 5, target: 6 },
  // 생성은 병렬로 유지
  { source: 6, target: 7 },
  { source: 6, target: 8 },
  { source: 6, target: 9 },
  // 저장선은 L3만 유지하고 L2A/L2B는 의도적으로 끊어 커스텀 구성 사례를 표현
  { source: 9, target: 10 },
];

/**
 * §5.2 편파별 병렬 처리: L0 → L1A(HH)/L1A(HV) 병렬 → L1B 합류 이후 공통 흐름.
 * ⚠ ICD §1369 TBD 가정: "채널별 파일" 방식을 전제. 편파 다채널 처리 방식이 "단일 파일"로 확정되면
 * 두 L1A 노드는 단일 L1A로 축약되어야 한다. DAG UI의 편파 병렬 수용성 검증용 탐색 샘플.
 */
const DUAL_POL_BRANCH_STEPS: StepDef[] = [
  TRIGGER_STEP,                                                   // 1
  JOB_INIT_STEP,                                                  // 2
  { kind: 'SAR', sarStage: 'L0' },                                // 3
  { kind: 'SAR', sarStage: 'L1A', enabledTasks: ['process_hh'] }, // 4
  { kind: 'SAR', sarStage: 'L1A', enabledTasks: ['process_hv'] }, // 5
  { kind: 'SAR', sarStage: 'L1B' },                               // 6
  { kind: 'SAR', sarStage: 'L1C' },                               // 7
  { kind: 'SAR', sarStage: 'L2A' },                               // 8
  { kind: 'SAR', sarStage: 'L2B' },                               // 9
  { kind: 'SAR', sarStage: 'L3' },                                // 10
  CATALOG_STEP,                                                   // 11
];
const DUAL_POL_BRANCH_EDGES: BranchedEdge[] = [
  { source: 1, target: 2 },
  { source: 2, target: 3 },
  // fan-out (편파별 병렬)
  { source: 3, target: 4 },
  { source: 3, target: 5 },
  // fan-in (영상 합성)
  { source: 4, target: 6 },
  { source: 5, target: 6 },
  { source: 6, target: 7 },
  { source: 7, target: 8 },
  { source: 8, target: 9 },
  { source: 9, target: 10 },
  { source: 10, target: 11 },
];

/** §5.4 Quick-look 조기 분기: L1A 완료 시점에 THUMBNAIL 발행(side-branch), 메인 흐름은 L3까지 계속 */
const QUICK_LOOK_BRANCH_STEPS: StepDef[] = [
  TRIGGER_STEP,                           // 1
  JOB_INIT_STEP,                          // 2
  { kind: 'SAR', sarStage: 'L0' },        // 3
  { kind: 'SAR', sarStage: 'L1A' },       // 4 (fan-out 지점)
  { kind: 'THUMBNAIL' },                  // 5 (조기 미리보기 side-branch)
  { kind: 'SAR', sarStage: 'L1B' },       // 6 (메인 흐름 계속)
  { kind: 'SAR', sarStage: 'L1C' },       // 7
  { kind: 'SAR', sarStage: 'L2A' },       // 8
  { kind: 'SAR', sarStage: 'L2B' },       // 9
  { kind: 'SAR', sarStage: 'L3' },        // 10
  CATALOG_STEP,                            // 11 (fan-in)
];
const QUICK_LOOK_BRANCH_EDGES: BranchedEdge[] = [
  { source: 1, target: 2 },
  { source: 2, target: 3 },
  { source: 3, target: 4 },
  // fan-out: L1A → {THUMBNAIL, L1B}
  { source: 4, target: 5 },
  { source: 4, target: 6 },
  // 메인 흐름
  { source: 6, target: 7 },
  { source: 7, target: 8 },
  { source: 8, target: 9 },
  { source: 9, target: 10 },
  { source: 10, target: 11 },
  // side-branch 합류: THUMBNAIL → CATALOG
  { source: 5, target: 11 },
];

// §5.3 복수 진입점 샘플은 제거됨.
// ICD가 "진입점별 별도 파이프라인"으로 설계를 확정했고 (PARTIAL_L1_* / PARTIAL_L2_* 가 이미 반영),
// 두 진입 노드를 한 DAG에 섞는 모델은 ICD 설계와 상충하여 삭제함. (DAG-RATIONALE §5 참조)

function buildSteps(pipelineSteps: StepDef[], status: JobStatus, retryCount: number): PipelineStep[] {
  // TRIGGER·FILE_INPUT·JOB_INIT 스텝은 항상 COMPLETED. 나머지 스텝에만 completedCount 적용
  const activeDagSteps = pipelineSteps.filter((s) => s.kind !== 'TRIGGER' && s.kind !== 'FILE_INPUT' && s.kind !== 'JOB_INIT');
  const completedCount =
    status === 'COMPLETED' ? activeDagSteps.length
    : status === 'ASSIGNED' ? Math.floor(Math.random() * (activeDagSteps.length - 1))
    : status === 'FAILED' ? Math.floor(Math.random() * (activeDagSteps.length - 1))
    : 0;

  let dagStepIdx = 0;
  return pipelineSteps.map((def, i): PipelineStep => {
    let stepStatus: StepStatus;

    if (def.kind === 'TRIGGER' || def.kind === 'FILE_INPUT' || def.kind === 'JOB_INIT') {
      stepStatus = 'COMPLETED';
    } else {
      const idx = dagStepIdx++;
      if (idx < completedCount) {
        stepStatus = 'COMPLETED';
      } else if (idx === completedCount && status === 'ASSIGNED') {
        stepStatus = 'RUNNING';
      } else if (idx === completedCount && status === 'FAILED') {
        stepStatus = 'FAILED';
      } else {
        stepStatus = status === 'CANCELED' ? 'CANCELED' : 'PENDING';
      }
    }

    // 백엔드 호환용 CSC/Level 파생
    const targetCsc: TargetCsc = def.kind === 'TRIGGER' ? 'CSC-02'
      : def.kind === 'FILE_INPUT' ? 'CSC-02'
      : def.kind === 'JOB_INIT' ? 'CSC-08'
      : def.kind === 'CATALOG' ? 'CSC-07'
      : def.kind === 'THUMBNAIL' ? 'CSC-07'
      : SAR_STAGE_TO_CSC[def.sarStage!];
    const productLevel: ProductLevel = def.kind === 'TRIGGER' ? 'LEVEL_0'
      : def.kind === 'FILE_INPUT' ? (def.inputLevel ?? 'LEVEL_0')
      : def.kind === 'JOB_INIT' ? 'LEVEL_0'
      : def.kind === 'CATALOG' ? 'LEVEL_3'
      : def.kind === 'THUMBNAIL' ? 'LEVEL_1'
      : SAR_STAGE_TO_LEVEL[def.sarStage!];

    const baseTime = new Date();
    baseTime.setHours(baseTime.getHours() - (pipelineSteps.length - i) * 0.5);
    const stageId = def.sarStage ?? def.kind;
    const isFixed = def.kind === 'TRIGGER' || def.kind === 'FILE_INPUT' || def.kind === 'JOB_INIT';

    return {
      order: i + 1,
      kind: def.kind,
      sarStage: def.sarStage,
      inputLevel: def.kind === 'FILE_INPUT' ? def.inputLevel : undefined,
      targetCsc,
      productLevel,
      status: stepStatus,
      startedAt: stepStatus !== 'PENDING' && stepStatus !== 'CANCELED' ? baseTime.toISOString() : undefined,
      finishedAt: stepStatus === 'COMPLETED' ? new Date(baseTime.getTime() + (isFixed ? 1500 : (600 + Math.random() * 3000)) * 1000).toISOString() : undefined,
      durationMs: stepStatus === 'COMPLETED'
        ? (def.kind === 'TRIGGER' ? undefined : def.kind === 'JOB_INIT' ? Math.floor(500 + Math.random() * 1500) : Math.floor((600 + Math.random() * 3000) * 1000))
        : undefined,
      errorCode: stepStatus === 'FAILED' ? `ERR_${targetCsc.replace('-', '')}_${1000 + Math.floor(Math.random() * 100)}` : undefined,
      errorMessage: stepStatus === 'FAILED'
        ? retryCount >= 3 ? `Max retry exceeded for ${stageId}` : `Processing timeout at ${stageId}`
        : undefined,
      outputPath: stepStatus === 'COMPLETED' && !isFixed ? `/mnt/nas/sdpe/output/${productLevel.toLowerCase()}/scene_xxx.h5` : undefined,
    };
  });
}

// =============================================================================
// Generate Mock Dataset
// =============================================================================

/** PipelineDefinition의 steps를 buildSteps용 StepDef[]로 변환 */
function toStepDefs(pipeline: PipelineDefinition): StepDef[] {
  return pipeline.steps.map((s) => ({
    kind: s.kind,
    sarStage: s.sarStage,
    ...(s.inputLevel !== undefined && { inputLevel: s.inputLevel }),
  }));
}

/**
 * Job 생성. RAW 단위로 묶어서 처리 일관성을 보장한다:
 *   - 각 RAW에 1개 이상의 "primary"(FILE_INPUT 없음, RAW 트리거) 실행을 먼저 보장
 *   - partial-reprocess(FILE_INPUT)는 primary 실행이 있는 RAW에만 추가
 *   - 결과적으로 동일 RAW에 여러 알고리즘 변형이 공존하여 SUBWAY MAP의 다중 노선 케이스를 표현
 *
 * 반환되는 각 JobDetail은 자신이 사용한 RAW의 id를 `rawDataId`로 보관하여 이후 product 생성 시 일치시킨다.
 */
type RawBoundJob = JobDetail & { rawDataId: string };

function generateJobs(rawData: RawDataSummary[], pipelines: PipelineDefinition[]): RawBoundJob[] {
  const statuses: JobStatus[] = ['CREATED', 'ASSIGNED', 'COMPLETED', 'FAILED', 'CANCELED'];
  const weights = [0.05, 0.25, 0.45, 0.15, 0.1];

  const isPrimary = (p: PipelineDefinition) =>
    !p.archived && !p.steps.some((s) => s.kind === 'FILE_INPUT');
  const isPartial = (p: PipelineDefinition) =>
    !p.archived && p.steps.some((s) => s.kind === 'FILE_INPUT');

  const primaryPipelines = pipelines.filter(isPrimary);
  const partialPipelines = pipelines.filter(isPartial);

  const profileForPipeline = (p: PipelineDefinition): ProcessingProfileSummary => {
    const jobInit = p.steps.find((s) => s.kind === 'JOB_INIT');
    const profileId = jobInit?.jobInitConfig?.profileId ?? 'PROF-L1A-RANGE-BASELINE';
    const profile = MOCK_PROCESSING_PROFILES.find((mp) => mp.id === profileId);
    return {
      id: profile?.id ?? 'PROF-L1A-RANGE-BASELINE',
      name: profile?.name ?? 'L1A Range Processing Baseline',
      description: profile?.description ?? 'Generic processing profile',
    };
  };

  const pickStatus = (): JobStatus => {
    const r = Math.random();
    let cumulative = 0;
    for (let j = 0; j < weights.length; j++) {
      cumulative += weights[j];
      if (r < cumulative) return statuses[j];
    }
    return 'COMPLETED';
  };

  const jobs: RawBoundJob[] = [];
  let jobSeq = 0;
  const nextJobId = () => `JOB-${String(++jobSeq).padStart(4, '0')}`;

  rawData.forEach((raw, rawIdx) => {
    // 각 RAW 당 총 20~30개의 노선이 생성되도록 primary / partial 개수를 부풀린다.
    // primary 18~25개 + partial 2~5개 → 총 20~30개
    const primaryCount = 18 + (rawIdx % 8);
    let primaryDone = 0;

    // 한 RAW 내부에서는 primary가 partial 보다 시각적으로 먼저(=startedAt 더 이른) 표시되도록
    // receivedAt를 기준으로 deterministic 시간을 주입한다.
    const baseMs = new Date(raw.receivedAt).getTime();
    let cursorMs = baseMs + 5 * 60_000;

    for (let p = 0; p < primaryCount && primaryPipelines.length > 0; p++) {
      const pipeline = primaryPipelines[(rawIdx + p) % primaryPipelines.length];
      const status: JobStatus = p === 0 ? 'COMPLETED' : pickStatus();
      const startedAt = new Date(cursorMs).toISOString();
      jobs.push(buildJob({ raw, rawIdx, pipeline, status, jobId: nextJobId(), startedAt, profileForPipeline }));
      cursorMs += 15 * 60_000;
      if (status === 'COMPLETED') primaryDone++;
    }

    if (primaryDone > 0 && partialPipelines.length > 0) {
      const partialCount = 2 + (rawIdx % 4);
      for (let p = 0; p < partialCount; p++) {
        const pipeline = partialPipelines[(rawIdx + p) % partialPipelines.length];
        const status: JobStatus = pickStatus();
        const startedAt = new Date(cursorMs).toISOString();
        jobs.push(buildJob({ raw, rawIdx, pipeline, status, jobId: nextJobId(), startedAt, profileForPipeline }));
        cursorMs += 30 * 60_000;
      }
    }
  });

  return jobs;
}

function buildJob({
  raw,
  rawIdx,
  pipeline,
  status,
  jobId,
  startedAt,
  profileForPipeline,
}: {
  raw: RawDataSummary;
  rawIdx: number;
  pipeline: PipelineDefinition;
  status: JobStatus;
  jobId: string;
  startedAt: string;
  profileForPipeline: (p: PipelineDefinition) => ProcessingProfileSummary;
}): RawBoundJob {
  const pipelineStepDefs = toStepDefs(pipeline);
  const retryCount = status === 'FAILED' ? Math.floor(Math.random() * 4) : 0;
  const steps = buildSteps(pipelineStepDefs, status, retryCount);
  const runningStep = steps.find((s) => s.status === 'RUNNING' || s.status === 'FAILED');

  const isPartial = pipelineStepDefs.some((s) => s.kind === 'FILE_INPUT');
  const triggerSource: TriggerSource = isPartial
    ? (rawIdx % 2 === 0 ? 'PARTIAL_REPROCESS' : 'MANUAL_REQUEST')
    : (rawIdx % 5 === 0 ? 'MANUAL_REQUEST' : 'PIPELINE_AUTO');

  const lastSarStep = [...pipelineStepDefs].reverse().find((s) => s.kind === 'SAR');
  const finalLevel: ProductLevel = lastSarStep?.sarStage
    ? SAR_STAGE_TO_LEVEL[lastSarStep.sarStage]
    : 'LEVEL_3';

  return {
    jobId,
    pipelineId: pipeline.id,
    sceneId: SCENE_IDS[rawIdx % SCENE_IDS.length],
    status,
    currentLevel: runningStep?.productLevel ?? (status === 'COMPLETED' ? finalLevel : null),
    currentTargetCsc: runningStep?.targetCsc ?? null,
    retryCount,
    startedAt,
    updatedAt: new Date(new Date(startedAt).getTime() + (5 + Math.floor(Math.random() * 30)) * 60_000).toISOString(),
    steps,
    acquisitionStart: raw.capturedAt,
    acquisitionEnd: new Date(new Date(raw.capturedAt).getTime() + 120000).toISOString(),
    receivedAt: raw.receivedAt,
    satelliteId: raw.satelliteId,
    mode: raw.mode,
    rawDataPath: raw.rawDataPath,
    processingProfile: profileForPipeline(pipeline),
    priority: 3 + Math.floor(Math.random() * 5),
    triggerSource,
    rawDataId: raw.id,
  };
}

function generateAlerts(jobs: JobDetail[]): Alert[] {
  const failedJobs = jobs.filter((j) => j.status === 'FAILED');
  const kinds: AlertKind[] = ['MAX_RETRY', 'PIPELINE_DELAY', 'QUALITY_FAIL', 'RESOURCE_THRESHOLD'];
  const messages: Record<AlertKind, string> = {
    MAX_RETRY: 'Max retry attempts exceeded',
    PIPELINE_DELAY: 'Pipeline processing delayed (> 2h)',
    QUALITY_FAIL: 'Output quality validation failed',
    RESOURCE_THRESHOLD: 'NAS disk usage exceeded 90%',
  };

  return failedJobs.map((job, i) => {
    const kind = i < failedJobs.length * 0.6 ? 'MAX_RETRY' : randomChoice(kinds);
    const acked = Math.random() > 0.6;
    return {
      id: `ALERT-${String(i + 1).padStart(4, '0')}`,
      version: 1,
      jobId: job.jobId,
      kind,
      message: `${messages[kind]} — Job: ${job.jobId}, Scene: ${job.sceneId}`,
      acknowledged: acked,
      createdAt: randomDate(2),
      acknowledgedAt: acked ? randomDate(1) : undefined,
      acknowledgedBy: acked ? 'operator-01' : undefined,
    };
  });
}

function generateAuditEvents(jobs: JobDetail[]): AuditEvent[] {
  const events: AuditEvent[] = [];

  for (const job of jobs.slice(0, 30)) {
    const startMs = new Date(job.startedAt).getTime();
    const updatedMs = new Date(job.updatedAt).getTime();
    const endMs = updatedMs > startMs ? updatedMs : startMs + 30 * 60_000;

    const isReprocess = job.triggerSource === 'MANUAL_REQUEST' || job.triggerSource === 'PARTIAL_REPROCESS';

    const seq: AuditEventType[] = [
      isReprocess ? 'PIPELINE_REPROCESSED' : 'PIPELINE_STARTED',
      'JOB_CREATED',
    ];
    if (job.status !== 'CREATED') seq.push('JOB_ASSIGNED');
    if (job.status === 'COMPLETED') seq.push('JOB_COMPLETED');
    else if (job.status === 'FAILED') seq.push('JOB_FAILED', 'ALERT_DISPATCHED');

    seq.forEach((eventType, idx) => {
      const fraction = seq.length <= 1 ? 0 : idx / (seq.length - 1);
      const timestamp = new Date(startMs + (endMs - startMs) * fraction).toISOString();
      events.push({
        id: `EVT-${randomId()}`,
        eventType,
        jobId: job.jobId,
        timestamp,
        detail: `${eventType} for ${job.jobId} (${job.sceneId})`,
        operatorId: eventType === 'PIPELINE_REPROCESSED' ? 'operator-01' : undefined,
      });
    });
  }

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function generateExecutionLogs(jobs: JobDetail[]): ExecutionLog[] {
  const logs: ExecutionLog[] = [];
  let logSeq = 0;

  const INFO_MESSAGES = [
    'Step started',
    'Input data loaded successfully',
    'Processing parameters applied',
    'Output written to NAS',
    'Step completed',
    'Checkpoint saved',
  ];
  const WARN_MESSAGES = [
    'Processing time exceeding expected threshold',
    'Memory usage above 80%',
    'Retry attempt initiated',
    'Input data quality degraded — proceeding with fallback parameters',
    'DEM resolution lower than optimal',
    'Disk I/O latency elevated',
  ];
  const ERROR_MESSAGES: Record<string, string[]> = {
    L0: ['Raw data checksum mismatch', 'Time synchronization failed — GPS timestamps inconsistent', 'Metadata extraction error: missing orbit parameters'],
    L1A: ['Range compression divergence detected', 'Azimuth compression failed — insufficient Doppler samples', 'Autofocus convergence error after 50 iterations'],
    L1B: ['Multi-look processing OOM — requested 16GB, available 12GB', 'Speckle filter kernel allocation failed', 'Ground-range projection: invalid DEM tile'],
    L1C: ['DEM file not found: /mnt/nas/dem/srtm_30m_N37E127.tif', 'Geometric correction failed — GCP count below minimum (3 required, 1 found)', 'Radiometric terrain correction NaN values in shadow regions'],
    L2A: ['Incidence angle computation timeout', 'NESZ map generation failed — calibration data missing', 'Layover mask computation segfault (signal 11)'],
    L2B: ['Object detection model load failed — ONNX runtime error', 'Change detection: reference image not available', 'GPU memory allocation failed for inference'],
    L3: ['Application product generation timeout (exceeded 30min SLA)', 'Output format conversion error — unsupported projection EPSG:32652'],
    JOB_INIT: ['Processing profile not found for given satellite/mode combination', 'Profile validation failed — missing required parameter "azimuthLooks"', 'Priority queue insertion failed — queue depth exceeded'],
    CATALOG: ['STAC metadata validation failed — missing "datetime" field', 'Catalog registration timeout — database connection pool exhausted', 'Duplicate product ID detected in catalog'],
  };

  for (const job of jobs) {
    const baseTime = new Date(job.startedAt).getTime();

    for (const step of job.steps) {
      const source = step.sarStage ?? step.kind ?? 'SYSTEM';
      const stepBaseTime = step.startedAt ? new Date(step.startedAt).getTime() : baseTime + step.order * 60000;

      logs.push({
        id: `LOG-${String(++logSeq).padStart(5, '0')}`,
        timestamp: new Date(stepBaseTime).toISOString(),
        level: 'INFO',
        jobId: job.jobId,
        source,
        message: `[${source}] ${INFO_MESSAGES[0]} — order=${step.order}`,
      });

      if (step.status === 'COMPLETED') {
        if (Math.random() > 0.7) {
          logs.push({
            id: `LOG-${String(++logSeq).padStart(5, '0')}`,
            timestamp: new Date(stepBaseTime + 5000 + Math.random() * 30000).toISOString(),
            level: 'WARN',
            jobId: job.jobId,
            source,
            message: `[${source}] ${WARN_MESSAGES[Math.floor(Math.random() * WARN_MESSAGES.length)]}`,
          });
        }
        logs.push({
          id: `LOG-${String(++logSeq).padStart(5, '0')}`,
          timestamp: new Date(stepBaseTime + (step.durationMs ?? 60000)).toISOString(),
          level: 'INFO',
          jobId: job.jobId,
          source,
          message: `[${source}] Step completed — duration=${step.durationMs ?? 0}ms`,
        });
      }

      if (step.status === 'RUNNING') {
        logs.push({
          id: `LOG-${String(++logSeq).padStart(5, '0')}`,
          timestamp: new Date(stepBaseTime + 3000).toISOString(),
          level: 'INFO',
          jobId: job.jobId,
          source,
          message: `[${source}] ${INFO_MESSAGES[Math.floor(Math.random() * INFO_MESSAGES.length)]}`,
        });
      }

      if (step.status === 'FAILED') {
        const errPool = ERROR_MESSAGES[source] ?? ERROR_MESSAGES['L0'];
        const errMsg = errPool[Math.floor(Math.random() * errPool.length)];
        logs.push({
          id: `LOG-${String(++logSeq).padStart(5, '0')}`,
          timestamp: new Date(stepBaseTime + 2000).toISOString(),
          level: 'WARN',
          jobId: job.jobId,
          source,
          message: `[${source}] ${WARN_MESSAGES[Math.floor(Math.random() * WARN_MESSAGES.length)]}`,
        });
        logs.push({
          id: `LOG-${String(++logSeq).padStart(5, '0')}`,
          timestamp: new Date(stepBaseTime + 5000).toISOString(),
          level: 'ERROR',
          jobId: job.jobId,
          source,
          message: `[${source}] ${errMsg}`,
          detail: step.errorCode ? `${step.errorCode}: ${step.errorMessage ?? errMsg}` : errMsg,
        });
        if (job.retryCount > 0) {
          for (let r = 0; r < Math.min(job.retryCount, 3); r++) {
            logs.push({
              id: `LOG-${String(++logSeq).padStart(5, '0')}`,
              timestamp: new Date(stepBaseTime + 10000 + r * 15000).toISOString(),
              level: r === job.retryCount - 1 ? 'ERROR' as LogLevel : 'WARN' as LogLevel,
              jobId: job.jobId,
              source,
              message: `[${source}] Retry ${r + 1}/${job.retryCount} — ${r === job.retryCount - 1 ? 'Max retry exceeded' : 'Retrying...'}`,
            });
          }
        }
      }
    }
  }

  return logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

// =============================================================================
// Product Mock Data
// =============================================================================

function generateProducts(jobs: JobDetail[], rawData: RawDataSummary[], pipelines: PipelineDefinition[]): Product[] {
  const completedJobs = jobs.filter((j) => j.status === 'COMPLETED' || j.status === 'FAILED');
  const products: Product[] = [];
  const pipelinesById = new Map(pipelines.map((p) => [p.id, p]));
  const rawById = new Map(rawData.map((r) => [r.id, r]));
  const levelOrder: ProductLevel[] = ['LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];

  // Per-level processing offset from acquisitionEnd. Reflects the natural
  // chronology RAW → L0 (HDF5) → L1 → L2 → L3 in mock timestamps.
  const LEVEL_OFFSET_MS: Record<ProductLevel, number> = {
    LEVEL_0: 5 * 60_000,
    LEVEL_1: 30 * 60_000,
    LEVEL_2: 60 * 60_000,
    LEVEL_3: 120 * 60_000,
  };

  for (const [jobIndex, job] of completedJobs.entries()) {
    // 작업이 자신이 사용한 RAW를 보관하는 경우(rawDataId) 그것을 우선 사용. 폴백은 인덱스 기반.
    const boundRawId = (job as JobDetail & { rawDataId?: string }).rawDataId;
    const sourceRawData = (boundRawId ? rawById.get(boundRawId) : undefined) ?? rawData[jobIndex % rawData.length];
    const pipeline = pipelinesById.get(job.pipelineId);

    // Levels actually produced by this pipeline = unique product levels of SAR steps,
    // ordered by pipeline step order. Excludes FILE_INPUT (input only, not output).
    const pipelineProducedLevels: ProductLevel[] = pipeline
      ? Array.from(
          new Set(
            pipeline.steps
              .filter((s) => s.kind === 'SAR' && s.sarStage)
              .map((s) => SAR_STAGE_TO_LEVEL[s.sarStage!]),
          ),
        ).sort((a, b) => levelOrder.indexOf(a) - levelOrder.indexOf(b))
      : levelOrder;

    if (pipelineProducedLevels.length === 0) continue;

    // COMPLETED 작업은 파이프라인이 생성하는 모든 레벨을 산출. FAILED는 어느 레벨까지 진행됐는지를 랜덤 잘라서 표현.
    const maxProducts = pipelineProducedLevels.length;
    const numProducts = job.status === 'COMPLETED'
      ? maxProducts
      : Math.floor(Math.random() * maxProducts) + (Math.random() > 0.4 ? 1 : 0);

    for (let i = 0; i < numProducts; i++) {
      const level = pipelineProducedLevels[i];
      const status: ProductStatus = job.status === 'FAILED' && i === numProducts - 1 ? 'FAILED' : 'COMPLETED';

      const quality: ProductQuality | undefined = status === 'COMPLETED' ? {
        nesz: { value: -22 - Math.random() * 6, unit: 'dB', pass: Math.random() > 0.1 },
        pslr: { value: -20 - Math.random() * 10, unit: 'dB', pass: Math.random() > 0.1 },
        geometricAccuracy: { value: 1 + Math.random() * 4, unit: 'm', pass: Math.random() > 0.15 },
        radiometricCalibration: { pass: Math.random() > 0.1, detail: 'Calibration within tolerance' },
      } : undefined;

      const baseLat = 35 + Math.random() * 3;
      const baseLon = 126 + Math.random() * 3;
      const rawDataName = sourceRawData?.title ?? job.rawDataPath.split('/').pop() ?? `${job.sceneId}.raw`;

      products.push({
        id: `PROD-${job.jobId}-${level}`,
        rawDataId: sourceRawData?.id ?? job.sceneId,
        sceneId: job.sceneId,
        rawDataName,
        jobId: job.jobId,
        level,
        satelliteId: job.satelliteId,
        mode: job.mode,
        polarization: 'HH',
        status,
        spatialExtent: {
          west: baseLon,
          south: baseLat,
          east: baseLon + 0.5 + Math.random() * 0.5,
          north: baseLat + 0.5 + Math.random() * 0.5,
        },
        acquisitionStart: job.acquisitionStart,
        acquisitionEnd: job.acquisitionEnd,
        resolutionRange: level === 'LEVEL_0' ? 0 : 1 + Math.random() * 4,
        resolutionAzimuth: level === 'LEVEL_0' ? 0 : 1 + Math.random() * 4,
        processingTimeMs: Math.floor(60_000 + Math.random() * 3_600_000),
        quality,
        thumbnailUrl: status === 'COMPLETED' ? `/api/products/PROD-${job.jobId}-${level}/thumbnail` : undefined,
        createdAt: new Date(
          new Date(job.acquisitionEnd).getTime() + LEVEL_OFFSET_MS[level],
        ).toISOString(),
      });
    }
  }

  return products.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function formatRawDataTitle(satelliteId: string, capturedAt: string, latitude: number, longitude: number): string {
  const shortName = SATELLITE_SHORT_NAMES[satelliteId] ?? satelliteId.replace('Lumir-', '');
  const ts = new Date(capturedAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  const datePart = `${ts.getUTCFullYear()}${pad(ts.getUTCMonth() + 1)}${pad(ts.getUTCDate())}`;
  const timePart = `${pad(ts.getUTCHours())}${pad(ts.getUTCMinutes())}${pad(ts.getUTCSeconds())}`;
  const latPart = latitude.toFixed(6).replace('.', '-');
  const lonPart = longitude.toFixed(6).replace('.', '-');
  return `${shortName}_${datePart}_${timePart}_${latPart}_${lonPart}`;
}

function buildRawDataFootprint(latitude: number, longitude: number, footprintKm: number, mode: string, idx: number): [number, number][] {
  const widthRatio = mode === 'ScanSAR' ? 0.72 : mode === 'Spotlight' ? 0.34 : 0.46;
  const halfAlongKm = footprintKm / 2;
  const halfAcrossKm = (footprintKm * widthRatio) / 2;
  const heading = ((idx * 23) % 140 - 70) * (Math.PI / 180);
  const latKm = 110.574;
  const lonKm = Math.max(1, 111.32 * Math.cos(latitude * Math.PI / 180));
  const corners = [
    [-halfAlongKm, -halfAcrossKm],
    [halfAlongKm, -halfAcrossKm],
    [halfAlongKm, halfAcrossKm],
    [-halfAlongKm, halfAcrossKm],
  ];

  const ring = corners.map(([along, across]) => {
    const eastKm = along * Math.sin(heading) + across * Math.cos(heading);
    const northKm = along * Math.cos(heading) - across * Math.sin(heading);
    return [
      Number((longitude + eastKm / lonKm).toFixed(6)),
      Number((latitude + northKm / latKm).toFixed(6)),
    ] as [number, number];
  });

  return [...ring, ring[0]!];
}

function generateRawData(pipelines: PipelineDefinition[]): RawDataSummary[] {
  const now = Date.now();
  return Array.from({ length: 24 }, (_, idx) => {
    const satelliteId = SATELLITE_IDS[idx % SATELLITE_IDS.length];
    const mode = MODES[idx % MODES.length];
    const polarization = mode === 'ScanSAR' ? 'VV' : idx % 2 === 0 ? 'HH+HV' : 'HH';
    const recentOffsetsMinutes = [6, 18, 42, 95, 160, 245, 390, 560];
    const capturedAt = idx < recentOffsetsMinutes.length
      ? new Date(now - recentOffsetsMinutes[idx] * 60_000 - (12 + idx * 3) * 60_000).toISOString()
      : new Date(Date.UTC(2026, 3, 12 + (idx % 9), 8 + (idx % 10), 10 + (idx * 3) % 50, 24 + idx)).toISOString();
    const receivedAt = idx < recentOffsetsMinutes.length
      ? new Date(now - recentOffsetsMinutes[idx] * 60_000).toISOString()
      : new Date(new Date(capturedAt).getTime() + (8 + (idx % 6)) * 60_000).toISOString();
    const latitude = 34.95 + (idx * 0.18324) % 3.6;
    const longitude = 126.14 + (idx * 0.21437) % 3.8;
    const footprintKm = 22 + (idx % 6) * 4.5;
    const preferredPipeline = pipelines.find((pipeline) => (
      !pipeline.archived &&
      pipeline.steps[0]?.kind !== 'FILE_INPUT'
    )) ?? null;
    const mapped = idx % 5 !== 0 && preferredPipeline;
    const status: RawDataStatus = mapped ? (idx % 4 === 0 ? 'READY' : 'MAPPED') : (idx % 7 === 0 ? 'HOLD' : 'RECEIVED');

    return {
      id: `RAW-${String(idx + 1).padStart(4, '0')}`,
      title: formatRawDataTitle(satelliteId, capturedAt, latitude, longitude),
      satelliteId,
      mode,
      polarization,
      capturedAt,
      receivedAt,
      latitude,
      longitude,
      footprintKm,
      footprint: buildRawDataFootprint(latitude, longitude, footprintKm, mode, idx),
      fileSizeBytes: 18_000_000_000 + idx * 630_000_000,
      status,
      rawDataPath: `/mnt/nas/sdpe/raw/${satelliteId}/${mode.toLowerCase()}/${formatRawDataTitle(satelliteId, capturedAt, latitude, longitude)}.dat`,
      mappedPipelineId: mapped ? preferredPipeline.id : null,
      mappedPipelineName: mapped ? preferredPipeline.name : null,
    };
  }).sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
}

function generateHdf5AttributeFiles(rawData: RawDataSummary[]): Hdf5FileSummary[] {
  const templates = [
    {
      rootGroup: 'ST0',
      notes: [
        'Like the Object Info tab, exposes metadata from the file root group and first observation group together.',
        'When a dataset is selected, parent group attributes are displayed first to preserve the desktop app navigation flow.',
      ],
      nodes: [
        { pathSuffix: '', name: 'file', type: 'file', dtype: undefined, shape: undefined },
        { pathSuffix: '/ST0', name: 'ST0', type: 'group', dtype: undefined, shape: undefined },
        { pathSuffix: '/ST0/Raw_data', name: 'Raw_data', type: 'dataset', dtype: 'complex64', shape: [32768, 16384] },
        { pathSuffix: '/ST0/Replica', name: 'Replica', type: 'dataset', dtype: 'float32', shape: [4096] },
        { pathSuffix: '/ST0/GPSDATA_HQ', name: 'GPSDATA_HQ', type: 'dataset', dtype: 'float64', shape: [1200, 6] },
        { pathSuffix: '/Products', name: 'Products', type: 'group', dtype: undefined, shape: undefined },
        { pathSuffix: '/Products/Image', name: 'Image', type: 'group', dtype: undefined, shape: undefined },
        { pathSuffix: '/Products/Image/SLC_RDA', name: 'SLC_RDA', type: 'dataset', dtype: 'complex64', shape: [8192, 4096] },
      ],
      attributes: (raw: RawDataSummary, filePath: string): Record<string, Hdf5AttributeEntry[]> => ({
        [filePath]: [
          { name: 'Group Names', type: 'String[]', arraySize: '2', value: ['ST0', 'Products'], variableName: 'group_names' },
          { name: 'First Group Name', type: 'String', arraySize: 'Scalar', value: 'ST0', variableName: 'first_group_name' },
          { name: 'Platform', type: 'String', arraySize: 'Scalar', value: raw.satelliteId, variableName: 'platform' },
        ],
        [`${filePath}/ST0`]: [
          { name: 'Platform Height', type: '64-bit floating-point', arraySize: 'Scalar', value: 5300.25, variableName: 'platform_height_m' },
          { name: 'Chirp baseband start', type: '64-bit floating-point', arraySize: 'Scalar', value: -32_500_000, variableName: 'chirp_start_hz' },
          { name: 'Chirp baseband stop', type: '64-bit floating-point', arraySize: 'Scalar', value: 32_500_000, variableName: 'chirp_stop_hz' },
          { name: 'Pulse Width', type: '64-bit floating-point', arraySize: 'Scalar', value: 0.000016, variableName: 'pulse_width_s' },
          { name: 'Sampling Frequency', type: '64-bit floating-point', arraySize: 'Scalar', value: 65_000_000, variableName: 'sampling_frequency_hz' },
          { name: 'PRF', type: '64-bit floating-point', arraySize: 'Scalar', value: 1450.5, variableName: 'prf_hz' },
          { name: 'Carrier Frequency', type: '64-bit floating-point', arraySize: 'Scalar', value: 9_650_000_000, variableName: 'carrier_frequency_hz' },
          { name: 'Look Angle', type: '64-bit floating-point', arraySize: 'Scalar', value: 34.2, variableName: 'look_angle_deg' },
          { name: 'Flight Speed', type: '64-bit floating-point', arraySize: 'Scalar', value: 122.8, variableName: 'flight_speed_mps' },
          { name: 'Polarization', type: 'String', arraySize: 'Scalar', value: raw.polarization, variableName: 'polarization' },
          { name: 'Acquisition Time', type: 'String', arraySize: 'Scalar', value: raw.capturedAt, variableName: 'acquisition_time' },
        ],
        [`${filePath}/ST0/Raw_data`]: [],
        [`${filePath}/ST0/Replica`]: [
          { name: 'Normalization', type: 'String', arraySize: 'Scalar', value: 'peak', variableName: 'replica_norm' },
        ],
        [`${filePath}/ST0/GPSDATA_HQ`]: [
          { name: 'Columns', type: 'String[]', arraySize: '6', value: ['time', 'lat', 'lon', 'alt', 'roll', 'pitch'], variableName: 'gps_columns' },
        ],
        [`${filePath}/Products`]: [
          { name: 'Generated By', type: 'String', arraySize: 'Scalar', value: 'CSC-04 Level 1 Processor', variableName: 'generated_by' },
        ],
        [`${filePath}/Products/Image`]: [],
        [`${filePath}/Products/Image/SLC_RDA`]: [
          { name: 'Processed Level', type: 'String', arraySize: 'Scalar', value: 'LEVEL_1', variableName: 'processed_level' },
          { name: 'Quicklook Ready', type: 'Boolean', arraySize: 'Scalar', value: true, variableName: 'quicklook_ready' },
        ],
      }),
    },
    {
      rootGroup: 'ST1',
      notes: [
        'Spotlight observations have many metadata entries, so the top filter and search are important.',
        'Dataset shape and dtype are shown in the right panel, matching the desktop app General Object Info.',
      ],
      nodes: [
        { pathSuffix: '', name: 'file', type: 'file', dtype: undefined, shape: undefined },
        { pathSuffix: '/ST1', name: 'ST1', type: 'group', dtype: undefined, shape: undefined },
        { pathSuffix: '/ST1/Raw_data', name: 'Raw_data', type: 'dataset', dtype: 'complex64', shape: [65536, 8192] },
        { pathSuffix: '/ST1/Antenna_Azimuth_Pattern', name: 'Antenna_Azimuth_Pattern', type: 'dataset', dtype: 'float32', shape: [512] },
        { pathSuffix: '/ST1/Doppler_Centroid_Profile', name: 'Doppler_Centroid_Profile', type: 'dataset', dtype: 'float64', shape: [1024] },
        { pathSuffix: '/Products', name: 'Products', type: 'group', dtype: undefined, shape: undefined },
        { pathSuffix: '/Products/Image', name: 'Image', type: 'group', dtype: undefined, shape: undefined },
        { pathSuffix: '/Products/Image/img_ML', name: 'img_ML', type: 'dataset', dtype: 'uint16', shape: [2048, 2048] },
      ],
      attributes: (raw: RawDataSummary, filePath: string): Record<string, Hdf5AttributeEntry[]> => ({
        [filePath]: [
          { name: 'Group Names', type: 'String[]', arraySize: '2', value: ['ST1', 'Products'], variableName: 'group_names' },
          { name: 'First Group Name', type: 'String', arraySize: 'Scalar', value: 'ST1', variableName: 'first_group_name' },
          { name: 'Mode', type: 'String', arraySize: 'Scalar', value: raw.mode, variableName: 'acquisition_mode' },
        ],
        [`${filePath}/ST1`]: [
          { name: 'Squint Angle', type: '64-bit floating-point', arraySize: 'Scalar', value: 2.75, variableName: 'squint_angle_deg' },
          { name: 'Doppler Centroid', type: '64-bit floating-point', arraySize: 'Scalar', value: 185.2, variableName: 'doppler_centroid_hz' },
          { name: 'Doppler Centroid Profile', type: '64-bit floating-point', arraySize: '8', value: [173.1, 176.2, 179.4, 182.3, 186.1, 188.7, 191.6, 194.4], variableName: 'doppler_centroid_profile' },
          { name: 'Sampling Window Start Time', type: '64-bit floating-point', arraySize: 'Scalar', value: 0.0001234, variableName: 'sampling_window_start_s' },
          { name: 'Latitude', type: '64-bit floating-point', arraySize: 'Scalar', value: Number(raw.latitude.toFixed(6)), variableName: 'scene_latitude' },
          { name: 'Longitude', type: '64-bit floating-point', arraySize: 'Scalar', value: Number(raw.longitude.toFixed(6)), variableName: 'scene_longitude' },
        ],
        [`${filePath}/ST1/Raw_data`]: [],
        [`${filePath}/ST1/Antenna_Azimuth_Pattern`]: [
          { name: 'Pattern Source', type: 'String', arraySize: 'Scalar', value: 'calibrated', variableName: 'pattern_source' },
        ],
        [`${filePath}/ST1/Doppler_Centroid_Profile`]: [],
        [`${filePath}/Products`]: [
          { name: 'Catalog Ready', type: 'Boolean', arraySize: 'Scalar', value: true, variableName: 'catalog_ready' },
        ],
        [`${filePath}/Products/Image`]: [],
        [`${filePath}/Products/Image/img_ML`]: [
          { name: 'Rendered By', type: 'String', arraySize: 'Scalar', value: 'Quick-look pipeline', variableName: 'rendered_by' },
        ],
      }),
    },
  ] as const;

  return rawData.slice(0, 6).map((item, index) => {
    const template = templates[index % templates.length];
    const fileName = `${item.title}.h5`;
    const filePath = `/${fileName}`;
    const attributeMap = template.attributes(item, filePath);
    const nodes: Hdf5NodeSummary[] = template.nodes.map((node) => {
      const path = `${filePath}${node.pathSuffix}`;
      const depth = path.split('/').filter(Boolean).length - 1;
      const childCount = template.nodes.filter((candidate) => candidate.pathSuffix !== node.pathSuffix && candidate.pathSuffix.startsWith(`${node.pathSuffix}/`) && candidate.pathSuffix.split('/').filter(Boolean).length === node.pathSuffix.split('/').filter(Boolean).length + 1).length;
      return {
        path,
        name: node.name === 'file' ? fileName : node.name,
        type: node.type,
        depth,
        attributeCount: attributeMap[path]?.length ?? 0,
        childCount,
        dtype: node.dtype,
        shape: node.shape ? [...node.shape] : undefined,
      };
    });

    // L0 (HDF5) is generated AFTER the raw data is ingested. Bump receivedAt
    // a few minutes past the raw's receivedAt so the lineage strip shows L0
    // chronologically downstream of RAW.
    const hdf5ReceivedAt = new Date(new Date(item.receivedAt).getTime() + 5 * 60_000).toISOString();

    return {
      id: `H5-${item.id}`,
      rawDataId: item.id,
      title: item.title,
      fileName,
      satelliteId: item.satelliteId,
      mode: item.mode,
      receivedAt: hdf5ReceivedAt,
      capturedAt: item.capturedAt,
      fileSizeBytes: Math.round(item.fileSizeBytes * 0.92),
      rootGroups: [template.rootGroup, 'Products'],
      nodes,
      attributes: attributeMap,
      notes: [...template.notes],
    };
  });
}

function cloneAttributeValue(value: Hdf5AttributeEntry['value']): Hdf5AttributeEntry['value'] {
  if (!Array.isArray(value)) return value;
  return value.every((item) => typeof item === 'number')
    ? [...value] as number[]
    : [...value] as string[];
}

function cloneHdf5FileSummary(file: Hdf5FileSummary): Hdf5FileSummary {
  return {
    ...file,
    rootGroups: [...file.rootGroups],
    nodes: file.nodes.map((node) => ({ ...node, shape: node.shape ? [...node.shape] : undefined })),
    attributes: Object.fromEntries(
      Object.entries(file.attributes).map(([path, attributes]) => [
        path,
        attributes.map((attribute) => ({
          ...attribute,
          value: cloneAttributeValue(attribute.value),
        })),
      ]),
    ),
    notes: [...file.notes],
  };
}

function buildUploadedHdf5FileSummary(file: Pick<File, 'name' | 'size' | 'lastModified'>, rawDataId?: string): Hdf5FileSummary {
  const normalizedName = file.name.trim() || `uploaded-${randomId()}.h5`;
  const fileName = /\.(h5|hdf5)$/i.test(normalizedName) ? normalizedName : `${normalizedName}.h5`;
  const title = fileName.replace(/\.(h5|hdf5)$/i, '');
  const filePath = `/${fileName}`;
  const receivedAt = new Date().toISOString();
  const capturedAt = file.lastModified ? new Date(file.lastModified).toISOString() : receivedAt;
  const rootGroups = ['Upload', 'Products'];

  const nodeDefinitions: Array<Pick<Hdf5NodeSummary, 'name' | 'type' | 'dtype' | 'shape'> & { pathSuffix: string }> = [
    { pathSuffix: '', name: fileName, type: 'file', dtype: undefined, shape: undefined },
    { pathSuffix: '/Upload', name: 'Upload', type: 'group', dtype: undefined, shape: undefined },
    { pathSuffix: '/Upload/Metadata', name: 'Metadata', type: 'group', dtype: undefined, shape: undefined },
    { pathSuffix: '/Upload/Metadata/Header', name: 'Header', type: 'dataset', dtype: 'string', shape: [12] },
    { pathSuffix: '/Upload/Raw_data', name: 'Raw_data', type: 'dataset', dtype: 'complex64', shape: [2048, 2048] },
    { pathSuffix: '/Products', name: 'Products', type: 'group', dtype: undefined, shape: undefined },
    { pathSuffix: '/Products/Preview', name: 'Preview', type: 'dataset', dtype: 'uint8', shape: [512, 512] },
  ];

  const attributes: Record<string, Hdf5AttributeEntry[]> = {
    [filePath]: [
      { name: 'Group Names', type: 'String[]', arraySize: '2', value: rootGroups, variableName: 'group_names' },
      { name: 'Source', type: 'String', arraySize: 'Scalar', value: 'Manual upload', variableName: 'source' },
      { name: 'Imported At', type: 'String', arraySize: 'Scalar', value: receivedAt, variableName: 'imported_at' },
    ],
    [`${filePath}/Upload`]: [
      { name: 'Original Filename', type: 'String', arraySize: 'Scalar', value: fileName, variableName: 'original_filename' },
      { name: 'File Size', type: '64-bit integer', arraySize: 'Scalar', value: file.size, variableName: 'file_size_bytes' },
      { name: 'Last Modified', type: 'String', arraySize: 'Scalar', value: capturedAt, variableName: 'last_modified' },
    ],
    [`${filePath}/Upload/Metadata`]: [
      { name: 'Parser State', type: 'String', arraySize: 'Scalar', value: 'Mock preview generated', variableName: 'parser_state' },
      { name: 'Root Group', type: 'String', arraySize: 'Scalar', value: 'Upload', variableName: 'root_group' },
    ],
    [`${filePath}/Upload/Metadata/Header`]: [
      { name: 'Header Fields', type: 'String[]', arraySize: '4', value: ['platform', 'mode', 'polarization', 'acquisition_time'], variableName: 'header_fields' },
    ],
    [`${filePath}/Upload/Raw_data`]: [],
    [`${filePath}/Products`]: [
      { name: 'Preview Generated', type: 'Boolean', arraySize: 'Scalar', value: true, variableName: 'preview_generated' },
    ],
    [`${filePath}/Products/Preview`]: [
      { name: 'Render Pipeline', type: 'String', arraySize: 'Scalar', value: 'UI mock upload renderer', variableName: 'render_pipeline' },
    ],
  };

  const nodes: Hdf5NodeSummary[] = nodeDefinitions.map((node) => {
    const path = `${filePath}${node.pathSuffix}`;
    const childCount = nodeDefinitions.filter((candidate) => candidate.pathSuffix !== node.pathSuffix && candidate.pathSuffix.startsWith(`${node.pathSuffix}/`) && candidate.pathSuffix.split('/').filter(Boolean).length === node.pathSuffix.split('/').filter(Boolean).length + 1).length;
    return {
      path,
      name: node.name,
      type: node.type,
      depth: Math.max(0, path.split('/').filter(Boolean).length - 1),
      attributeCount: attributes[path]?.length ?? 0,
      childCount,
      dtype: node.dtype,
      shape: node.shape ? [...node.shape] : undefined,
    };
  });

  return {
    id: `H5-UP-${randomId()}`,
    rawDataId: rawDataId ?? `manual-upload-${randomId()}`,
    title,
    fileName,
    satelliteId: 'Manual Upload',
    mode: 'Uploaded',
    receivedAt,
    capturedAt,
    fileSizeBytes: file.size,
    rootGroups,
    nodes,
    attributes,
    notes: [
      'Uploaded HDF5 files can be explored immediately via the frontend mock preview.',
      'Once the real parser API is connected, this section will be replaced by nodes/attributes extracted on the server.',
    ],
  };
}

const QUEUE_NAMES = [
  'sdpe.reception.events',
  'sdpe.processing.events',
  'sdpe.jobs.csc03',
  'sdpe.jobs.csc04',
  'sdpe.jobs.csc05',
  'sdpe.jobs.csc06',
  'sdpe.catalog.registration',
];

const QUEUE_SAR_STAGE_MAP: Record<string, SarStage | undefined> = {
  'sdpe.jobs.csc03': 'L0',
  'sdpe.jobs.csc04': 'L1A',
  'sdpe.jobs.csc05': 'L2A',
  'sdpe.jobs.csc06': 'L3',
};

const SATELLITES = ['Lumir-X1', 'Lumir-X2', 'Lumir-X3'];

function generateQueueMessages(queue: string, depth: number): QueueMessage[] {
  const now = Date.now();
  return Array.from({ length: depth }, (_, i) => ({
    messageId: `msg-${queue.split('.').pop()}-${String(i + 1).padStart(3, '0')}`,
    jobId: `JOB-${String(1000 + Math.floor(Math.random() * 9000)).padStart(4, '0')}`,
    satelliteId: SATELLITES[Math.floor(Math.random() * SATELLITES.length)]!,
    sarStage: QUEUE_SAR_STAGE_MAP[queue],
    enqueuedAt: new Date(now - Math.floor(Math.random() * 3600_000)).toISOString(),
    priority: Math.random() > 0.7 ? 1 : Math.random() > 0.5 ? 2 : 3,
  }));
}

function generateDeadLetters(queue: string): QueueDeadLetter[] {
  const count = Math.random() > 0.6 ? Math.floor(Math.random() * 4) : 0;
  const now = Date.now();
  const errors = [
    'Max retries exceeded: processing timeout after 3600s',
    'OutOfMemoryError: heap limit reached during range compression',
    'FileNotFoundException: raw data file missing from NAS',
    'ChecksumMismatchError: corrupted input data detected',
    'DEM integration failed: elevation model unavailable for region',
  ];
  return Array.from({ length: count }, (_, i) => ({
    messageId: `dlq-${queue.split('.').pop()}-${String(i + 1).padStart(3, '0')}`,
    jobId: `JOB-${String(2000 + Math.floor(Math.random() * 8000)).padStart(4, '0')}`,
    failedAt: new Date(now - Math.floor(Math.random() * 86400_000)).toISOString(),
    retryCount: 3,
    errorMessage: errors[Math.floor(Math.random() * errors.length)]!,
  }));
}

function generateDepthHistory(): QueueDepthPoint[] {
  const now = Date.now();
  let depth = Math.floor(Math.random() * 8);
  return Array.from({ length: 12 }, (_, i) => {
    depth = Math.max(0, depth + Math.floor(Math.random() * 7) - 3);
    return {
      timestamp: new Date(now - (11 - i) * 5 * 60_000).toISOString(),
      depth,
    };
  });
}

function generateQueueHealth(): QueueHealth[] {
  const now = Date.now();
  return QUEUE_NAMES.map((queue) => {
    const depth = Math.floor(Math.random() * 20);
    const messages = generateQueueMessages(queue, depth);
    const oldestMessageAge = messages.length
      ? Math.max(...messages.map((m) => Math.floor((now - new Date(m.enqueuedAt).getTime()) / 1000)))
      : 0;
    return {
      queue,
      depth,
      oldestMessageAge,
      consumers: 1 + Math.floor(Math.random() * 3),
      healthy: depth < 15 && Math.random() > 0.1,
      messages,
      throughput: {
        processed1h: Math.floor(Math.random() * 50),
        processed24h: Math.floor(Math.random() * 500) + 50,
        avgProcessingMs: Math.floor(Math.random() * 300_000) + 30_000,
      },
      deadLetters: generateDeadLetters(queue),
      depthHistory: generateDepthHistory(),
    };
  });
}

/** 순차 steps -> steps + edges 변환 */
function toDAGSteps(flat: Omit<import('@/types/pipeline').PipelineStepDefinition, 'order'>[]) {
  const steps = flat.map((s, i) => ({
    order: i + 1,
    kind: s.kind,
    sarStage: s.sarStage,
    ...(s.inputLevel !== undefined && { inputLevel: s.inputLevel }),
    ...(s.enabledTasks !== undefined && { enabledTasks: s.enabledTasks }),
    ...(s.jobInitConfig !== undefined && { jobInitConfig: s.jobInitConfig }),
    ...(s.fileInputConfig !== undefined && { fileInputConfig: s.fileInputConfig }),
    ...(s.disabled !== undefined && { disabled: s.disabled }),
  }));
  const edges: { source: number; target: number }[] = [];
  for (let i = 0; i < steps.length - 1; i++) {
    edges.push({ source: steps[i].order, target: steps[i + 1].order });
  }
  return { steps, edges };
}

/** 모드별로 서로 다른 파이프라인 구성 */
const MODE_STEP_VARIANTS: Record<string, StepDef[]> = {
  Stripmap: PIPELINE_STEPS,
  ScanSAR: [
    TRIGGER_STEP,
    JOB_INIT_STEP,
    { kind: 'SAR', sarStage: 'L0' },
    { kind: 'SAR', sarStage: 'L1A' },
    { kind: 'SAR', sarStage: 'L1B' },
    CATALOG_STEP,
  ],
  Spotlight: [
    TRIGGER_STEP,
    JOB_INIT_STEP,
    { kind: 'SAR', sarStage: 'L0' },
    { kind: 'SAR', sarStage: 'L1A' },
    { kind: 'SAR', sarStage: 'L1B' },
    { kind: 'SAR', sarStage: 'L1C' },
    CATALOG_STEP,
  ],
};

function buildPipelineFromSteps(
  id: string,
  name: string,
  stepDefs: StepDef[],
  createdAt = '2026-01-15T09:00:00Z',
): PipelineDefinition {
  const matchingProfile = MOCK_PROCESSING_PROFILES.find((p) => p.processingStage === 'L1A') ?? MOCK_PROCESSING_PROFILES[0];
  const defaultPolarization = matchingProfile?.polarizationTags?.[0]
    ?? matchingProfile?.polarization
    ?? 'HH';
  const stepsWithConfig = stepDefs.map((s) => {
    if (s.kind === 'JOB_INIT') {
      const config: JobInitConfig = {
        polarization: defaultPolarization,
        profileId: matchingProfile?.id,
        priority: 5,
        deadlineHours: 4,
        retryInterval: 'IMMEDIATE',
      };
      return { ...s, jobInitConfig: config };
    }
    return s;
  });
  const { steps, edges } = toDAGSteps(stepsWithConfig);
  return {
    id,
    name,
    steps,
    edges,
    createdAt,
    updatedAt: createdAt,
  };
}

/** 명시적 엣지를 받아 분기형 DAG 파이프라인을 생성한다 (fan-out, fan-in, 복수 진입점 등). */
function buildBranchedPipeline(
  id: string,
  name: string,
  stepDefs: StepDef[],
  edges: BranchedEdge[],
  createdAt = '2026-03-20T09:00:00Z',
): PipelineDefinition {
  const matchingProfile = MOCK_PROCESSING_PROFILES.find((p) => p.processingStage === 'L1A') ?? MOCK_PROCESSING_PROFILES[0];
  const defaultPolarization = matchingProfile?.polarizationTags?.[0]
    ?? matchingProfile?.polarization
    ?? 'HH';
  const steps = stepDefs.map((s, i) => {
    const base = {
      order: i + 1,
      kind: s.kind,
      sarStage: s.sarStage,
      ...(s.inputLevel !== undefined && { inputLevel: s.inputLevel }),
      ...(s.enabledTasks !== undefined && { enabledTasks: s.enabledTasks }),
    };
    if (s.kind === 'JOB_INIT') {
      const config: JobInitConfig = {
        polarization: defaultPolarization,
        profileId: matchingProfile?.id,
        priority: 5,
        deadlineHours: 4,
        retryInterval: 'IMMEDIATE',
      };
      return { ...base, jobInitConfig: config };
    }
    return base;
  });
  return {
    id,
    name,
    steps,
    edges: edges.map((e) => ({ ...e })),
    createdAt,
    updatedAt: createdAt,
  };
}

function generatePipelines(): PipelineDefinition[] {
  // 운영 환경에서는 위성/모드/편파가 한 종류씩이므로, 의도(처리 목적) 기반으로 파이프라인을
  // 구성한다. satellite/mode/polarization은 태그로 표현해 다중 매칭은 가능하지만 기본적으로
  // 하나씩만 부여한다.
  // 동일 RAW에 대해 여러 알고리즘 변형으로 처리될 수 있도록, Full SAR 흐름의 알고리즘 변형(RDA/CSA/BPA 등)을 추가한다.
  const active: PipelineDefinition[] = [
    buildPipelineFromSteps('PL-FULL-SAR-PROCESSING', 'Full SAR Processing (RDA)', PIPELINE_STEPS, '2026-01-15T09:00:00Z'),
    buildPipelineFromSteps('PL-FULL-SAR-CSA', 'Full SAR Processing (CSA)', PIPELINE_STEPS, '2026-01-16T09:00:00Z'),
    buildPipelineFromSteps('PL-FULL-SAR-BPA', 'Full SAR Processing (BPA)', PIPELINE_STEPS, '2026-01-17T09:00:00Z'),
    buildPipelineFromSteps('PL-FULL-SAR-FAST', 'Full SAR Fast (Lightweight)', PIPELINE_STEPS, '2026-01-18T09:00:00Z'),
    buildPipelineFromSteps('PL-FULL-SAR-HIRES', 'Full SAR Hi-Precision', PIPELINE_STEPS, '2026-01-19T09:00:00Z'),
    buildPipelineFromSteps('PL-QUICKLOOK-L1', 'Quick-Look (L1 Only)', PIPELINE_STEPS_TARGET_L1, '2026-02-05T09:00:00Z'),
    buildPipelineFromSteps('PL-IMAGE-ONLY-L1', 'Image-Only Calibration (L1)', PIPELINE_STEPS_TARGET_L1, '2026-02-06T09:00:00Z'),
    buildPipelineFromSteps('PL-GEOCODING-L2', 'Geocoded Output (L2 Only)', PIPELINE_STEPS_TARGET_L2, '2026-02-10T09:00:00Z'),
    buildPipelineFromSteps('PL-RADIOMETRY-L2', 'Radiometric L2 (No L3)', PIPELINE_STEPS_TARGET_L2, '2026-02-11T09:00:00Z'),
    buildPipelineFromSteps('PL-START-FROM-L0', 'Start from L0 Processing', START_FROM_L0_STEPS, '2026-01-20T09:00:00Z'),
    buildPipelineFromSteps('PL-START-FROM-L1', 'Start from L1 Processing', START_FROM_L1_STEPS, '2026-01-25T09:00:00Z'),
    buildPipelineFromSteps('PL-START-FROM-L2', 'Start from L2 Processing', START_FROM_L2_STEPS, '2026-01-30T09:00:00Z'),
    buildPipelineFromSteps('PL-PARTIAL-REPROCESS-FROM-L1', 'Partial Reprocess from L1', PARTIAL_L1_STRIPMAP_STEPS, '2026-02-01T09:00:00Z'),
    buildPipelineFromSteps('PL-PARTIAL-REPROCESS-FROM-L2', 'Partial Reprocess from L2', PARTIAL_L2_STEPS, '2026-03-01T09:00:00Z'),
    buildBranchedPipeline('PL-MULTI-LEVEL-BRANCHED', 'Multi-level Branched', MULTI_LEVEL_BRANCH_STEPS, MULTI_LEVEL_BRANCH_EDGES, '2026-03-20T09:00:00Z'),
    buildBranchedPipeline('PL-MULTI-LEVEL-CUSTOM-OUTPUT', 'Multi-level Branched (L3 Only Output)', MULTI_LEVEL_CUSTOM_OUTPUT_STEPS, MULTI_LEVEL_CUSTOM_OUTPUT_EDGES, '2026-03-22T09:00:00Z'),
    buildBranchedPipeline('PL-DUAL-POL-BRANCHED', 'Dual-Polarization Branched', DUAL_POL_BRANCH_STEPS, DUAL_POL_BRANCH_EDGES, '2026-03-25T09:00:00Z'),
    buildBranchedPipeline('PL-QUICK-LOOK-BRANCHED', 'Quick-look Branched', QUICK_LOOK_BRANCH_STEPS, QUICK_LOOK_BRANCH_EDGES, '2026-04-15T09:00:00Z'),
  ];

  const archived: PipelineDefinition[] = [
    {
      ...buildPipelineFromSteps('PL-ARCHIVE-FULL-V1', 'Full SAR Processing (v1 — deprecated)', PIPELINE_STEPS, '2025-06-01T09:00:00Z'),
      archived: true,
      archivedAt: '2026-01-12T02:40:00Z',
      archiveReason: 'Built against the initial DAG and no longer matches current operational routing conditions.',
    },
    {
      ...buildPipelineFromSteps('PL-ARCHIVE-SCANSAR-LEGACY', 'Legacy ScanSAR Pipeline', MODE_STEP_VARIANTS['ScanSAR'] ?? PIPELINE_STEPS, '2025-08-15T09:00:00Z'),
      archived: true,
      archivedAt: '2026-02-18T05:15:00Z',
      archiveReason: 'A test pipeline for performance verification, excluded from operational auto-execution.',
    },
    {
      ...buildPipelineFromSteps('PL-ARCHIVE-SPOTLIGHT-LEGACY', 'Legacy Spotlight Pipeline', MODE_STEP_VARIANTS['Spotlight'] ?? PIPELINE_STEPS, '2025-10-20T09:00:00Z'),
      archived: true,
      archivedAt: '2026-03-07T08:30:00Z',
      archiveReason: 'The Spotlight processing profile was replaced by a new profile, so the previous experimental configuration was retired.',
    },
  ];

  return [...active, ...archived];
}

const DEFAULT_DEPLOYED_PIPELINE_IDS = new Set([
  // RAW_DATA_RECEIVED 라우팅: 자동 실행 활성화 샘플
  'PL-FULL-SAR-PROCESSING',
  'PL-MULTI-LEVEL-BRANCHED',
  'PL-QUICK-LOOK-BRANCHED',

  // PRODUCT_REPROCESS_REQUESTED 라우팅: 부분 재처리 자동 실행 샘플
  'PL-PARTIAL-REPROCESS-FROM-L1',
  'PL-PARTIAL-REPROCESS-FROM-L2',
]);

/**
 * 파이프라인의 매칭 태그는 JOB_INIT 스텝에 할당된 처리 프로파일에서 파생된다.
 * 프로파일이 없거나 프로파일에 태그가 없으면 빈 배열을 반환한다.
 */
function getPipelineProfileTags(
  pipeline: PipelineDefinition,
  profiles: ProcessingProfile[],
): { satelliteTags: string[]; modeTags: string[]; polarizationTags: string[] } {
  const jobInitStep = pipeline.steps.find((s) => s.kind === 'JOB_INIT');
  const profileId = jobInitStep?.jobInitConfig?.profileId;
  const profile = profileId ? profiles.find((p) => p.id === profileId) : undefined;
  return {
    satelliteTags: profile?.satelliteTags ?? [],
    modeTags: profile?.modeTags ?? [],
    polarizationTags: profile?.polarizationTags ?? [],
  };
}

type ActivationRouteCandidate = Pick<PipelineActivationRule, 'sourceQueue' | 'eventType' | 'match' | 'active'> & {
  id?: string;
};

function activationMatchValuesKey(values?: readonly string[]): string {
  return values && values.length > 0 ? [...values].sort().join(',') : '*';
}

function activationRouteKey(rule: Pick<PipelineActivationRule, 'sourceQueue' | 'eventType' | 'match'>): string {
  return [
    rule.sourceQueue,
    rule.eventType,
    activationMatchValuesKey(rule.match.satelliteIds),
    activationMatchValuesKey(rule.match.modes),
    activationMatchValuesKey(rule.match.polarizations),
    rule.match.inputLevel ?? '*',
  ].join('|');
}

function activationEventQueueKey(rule: Pick<PipelineActivationRule, 'sourceQueue' | 'eventType'>): string {
  return `${rule.sourceQueue}|${rule.eventType}`;
}

function withUniqueActivationRoute(
  rule: PipelineActivationRule,
  existingRouteKeys: Set<string>,
  offset: number,
): PipelineActivationRule {
  if (!existingRouteKeys.has(activationRouteKey(rule))) return rule;

  const candidates = [
    { satelliteIds: [SATELLITE_OPTIONS[offset % SATELLITE_OPTIONS.length]] },
    { modes: [MODE_OPTIONS[offset % MODE_OPTIONS.length]] },
    { polarizations: [POLARIZATION_OPTIONS[offset % POLARIZATION_OPTIONS.length]] },
    {
      satelliteIds: [SATELLITE_OPTIONS[offset % SATELLITE_OPTIONS.length]],
      modes: [MODE_OPTIONS[Math.floor(offset / SATELLITE_OPTIONS.length) % MODE_OPTIONS.length]],
    },
  ];

  for (const candidate of candidates) {
    const nextRule = { ...rule, match: { ...rule.match, ...candidate } };
    if (!existingRouteKeys.has(activationRouteKey(nextRule))) return nextRule;
  }

  return rule;
}

function buildActivationRuleForPipeline(
  pipeline: PipelineDefinition,
  profiles: ProcessingProfile[],
  active = false,
): PipelineActivationRule | null {
  if (pipeline.archived) return null;
  const entry = pipeline.steps[0];
  const isPartial = entry?.kind === 'FILE_INPUT';
  const tags = getPipelineProfileTags(pipeline, profiles);

  return {
    id: `AR-${pipeline.id}`,
    pipelineId: pipeline.id,
    active,
    eventType: isPartial ? 'PRODUCT_REPROCESS_REQUESTED' : 'RAW_DATA_RECEIVED',
    sourceQueue: PIPELINE_EVENT_SOURCE_QUEUE[isPartial ? 'PRODUCT_REPROCESS_REQUESTED' : 'RAW_DATA_RECEIVED'],
    match: {
      satelliteIds: tags.satelliteTags.length > 0 ? [...tags.satelliteTags] : undefined,
      modes: tags.modeTags.length > 0 ? [...tags.modeTags] : undefined,
      polarizations: isPartial
        ? undefined
        : (tags.polarizationTags.length > 0 ? [...tags.polarizationTags] : undefined),
      inputLevel: entry?.kind === 'FILE_INPUT' ? entry.inputLevel : undefined,
    },
    triggerSource: isPartial ? 'PARTIAL_REPROCESS' : 'PIPELINE_AUTO',
    deployedAt: active ? pipeline.updatedAt : undefined,
    description: isPartial
      ? 'When a product/operational reprocess request arrives, launches the partial reprocessing DAG matching the input level and mode.'
      : 'When the data collection backend writes raw data received events to pgmq, matches them by processing profile tag conditions.',
  };
}

function generateActivationRules(
  pipelines: PipelineDefinition[],
  profiles: ProcessingProfile[],
): PipelineActivationRule[] {
  const routeKeys = new Set<string>();
  const activeEventQueueKeys = new Set<string>();
  return pipelines.reduce<PipelineActivationRule[]>((rules, pipeline) => {
    const rule = buildActivationRuleForPipeline(pipeline, profiles, DEFAULT_DEPLOYED_PIPELINE_IDS.has(pipeline.id));
    if (!rule) return rules;
    const uniqueRule = withUniqueActivationRoute(rule, routeKeys, rules.length);
    if (uniqueRule.active) {
      const eventQueueKey = activationEventQueueKey(uniqueRule);
      if (activeEventQueueKeys.has(eventQueueKey)) {
        uniqueRule.active = false;
        uniqueRule.deployedAt = undefined;
      } else {
        activeEventQueueKeys.add(eventQueueKey);
      }
    }
    routeKeys.add(activationRouteKey(uniqueRule));
    rules.push(uniqueRule);
    return rules;
  }, []);
}

let nextPipelineSeq = 100;

// =============================================================================
// Sequential Execution Simulator
// =============================================================================

/** 스텝 간 실행 시간 (ms). TRIGGER/JOB_INIT/FILE_INPUT은 짧고, SAR/CATALOG는 길다. */
function stepDurationMs(kind: PipelineNodeKind): number {
  if (kind === 'TRIGGER' || kind === 'FILE_INPUT') return 800;
  if (kind === 'JOB_INIT') return 1200;
  if (kind === 'CATALOG') return 1500;
  return 2000 + Math.floor(Math.random() * 2000); // SAR: 2~4초
}

/** 스텝을 PENDING으로 되돌릴 때 이전 실행 흔적(에러·소요시간·산출물)을 함께 지운다. */
function resetStepRuntimeFields(step: PipelineStep) {
  step.errorCode = undefined;
  step.errorMessage = undefined;
  step.startedAt = undefined;
  step.finishedAt = undefined;
  step.durationMs = undefined;
  step.outputPath = undefined;
}

/**
 * Job의 스텝을 순차적으로 RUNNING → COMPLETED로 진행시킨다.
 * 각 스텝이 일정 시간 후 COMPLETED로 전환되고 다음 스텝이 RUNNING으로 변경된다.
 */
function simulateJobExecution(job: JobDetail) {
  job.status = 'ASSIGNED';
  job.updatedAt = new Date().toISOString();

  const steps = job.steps;
  // 재처리 시 이미 COMPLETED인 앞쪽 스텝은 건너뛰고, 첫 PENDING 스텝부터 실행한다.
  let currentIdx = steps.findIndex((s) => s.status !== 'COMPLETED');
  if (currentIdx === -1) currentIdx = steps.length;

  function advanceStep() {
    if (currentIdx >= steps.length) {
      // 모든 스텝 완료
      job.status = 'COMPLETED';
      job.updatedAt = new Date().toISOString();
      return;
    }

    const step = steps[currentIdx];
    step.status = 'RUNNING';
    step.startedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    // 현재 RUNNING 스텝에 맞는 currentLevel/currentTargetCsc 갱신
    job.currentLevel = step.productLevel;
    job.currentTargetCsc = step.targetCsc;

    const duration = stepDurationMs(step.kind ?? 'SAR');

    setTimeout(() => {
      step.status = 'COMPLETED';
      step.finishedAt = new Date().toISOString();
      step.durationMs = duration;
      step.outputPath = step.kind === 'SAR'
        ? `/mnt/nas/sdpe/output/${step.productLevel.toLowerCase()}/${job.sceneId}.h5`
        : undefined;
      job.updatedAt = new Date().toISOString();

      currentIdx++;
      advanceStep();
    }, duration);
  }

  advanceStep();
}

// =============================================================================
// Mock Service Implementation
// =============================================================================

class MockPipelineUIService implements IPipelineUIService {
  private rawData: RawDataSummary[];
  private hdf5Files: Hdf5FileSummary[];
  private jobs: JobDetail[];
  private alerts: Alert[];
  private auditEvents: AuditEvent[];
  private queueHealth: QueueHealth[];
  private pipelines: PipelineDefinition[];
  private activationRules: PipelineActivationRule[];
  private executionLogs: ExecutionLog[];
  private profiles: ProcessingProfile[];
  private products: Product[];

  constructor() {
    this.pipelines = generatePipelines();
    this.profiles = [...MOCK_PROCESSING_PROFILES];
    this.activationRules = generateActivationRules(this.pipelines, this.profiles);
    this.rawData = generateRawData(this.pipelines);
    this.hdf5Files = generateHdf5AttributeFiles(this.rawData);
    this.jobs = generateJobs(this.rawData, this.pipelines);
    this.alerts = generateAlerts(this.jobs);
    this.auditEvents = generateAuditEvents(this.jobs);
    this.queueHealth = generateQueueHealth();
    this.executionLogs = generateExecutionLogs(this.jobs);
    this.products = generateProducts(this.jobs, this.rawData, this.pipelines);
  }

  private upsertActivationRule(pipeline: PipelineDefinition, active?: boolean): PipelineActivationRule | null {
    const current = this.activationRules.find((rule) => rule.pipelineId === pipeline.id);
    const nextActive = active ?? current?.active ?? false;
    const nextRule = current
      ? {
          ...current,
          active: nextActive,
          deployedAt: nextActive ? new Date().toISOString() : undefined,
        }
      : buildActivationRuleForPipeline(pipeline, this.profiles, nextActive);
    this.activationRules = this.activationRules.filter((rule) => rule.pipelineId !== pipeline.id);
    if (nextRule) this.activationRules.push(nextRule);
    return nextRule;
  }

  private hasDuplicateActiveRoute(candidate: ActivationRouteCandidate): boolean {
    if (!candidate.active) return false;
    const nextKey = activationEventQueueKey(candidate);
    return this.activationRules.some((rule) => (
      rule.active
        && rule.id !== candidate.id
        && activationEventQueueKey(rule) === nextKey
    ));
  }

  private saveActivationRule(data: SavePipelineActivationRuleData): PipelineActivationRule | null {
    const pipeline = this.pipelines.find((p) => p.id === data.pipelineId);
    if (!pipeline || pipeline.archived) return null;

    const current = data.id
      ? this.activationRules.find((rule) => rule.id === data.id)
      : undefined;
    const id = current?.id ?? `AR-${data.pipelineId}-${randomId()}`;
    const rule: PipelineActivationRule = {
      id,
      pipelineId: data.pipelineId,
      active: data.active,
      eventType: data.eventType,
      sourceQueue: data.sourceQueue,
      match: { ...data.match },
      triggerSource: data.triggerSource,
      deployedAt: data.active ? new Date().toISOString() : undefined,
      description: data.description?.trim()
        || 'Matches pgmq incoming events against conditions to automatically run the designated pipeline.',
    };

    this.activationRules = this.activationRules.filter((item) => item.id !== id);
    this.activationRules.push(rule);
    return rule;
  }

  async 대시보드_통계를_조회한다(): Promise<ServiceResponseWithData<DashboardStats>> {
    const now = Date.now();
    const h24 = 24 * 60 * 60 * 1000;
    const recent = this.jobs.filter((j) => now - new Date(j.updatedAt).getTime() < h24);

    return {
      success: true,
      message: 'OK',
      data: {
        inflightJobs: this.jobs.filter((j) => j.status === 'ASSIGNED' || j.status === 'CREATED').length,
        completedLast24h: recent.filter((j) => j.status === 'COMPLETED').length,
        failedLast24h: recent.filter((j) => j.status === 'FAILED').length,
        avgProcessingTimeMs: Math.floor(
          this.jobs
            .filter((j) => j.status === 'COMPLETED')
            .reduce((sum, j) => sum + j.steps.reduce((s, st) => s + (st.durationMs ?? 0), 0), 0) /
            Math.max(1, this.jobs.filter((j) => j.status === 'COMPLETED').length),
        ),
        unacknowledgedAlerts: this.alerts.filter((a) => !a.acknowledged).length,
      },
    };
  }

  async 원시데이터_목록을_조회한다(params?: {
    satelliteId?: string;
    mode?: string;
    mapped?: boolean;
    limit?: number;
  }): Promise<ServiceResponseWithData<PaginatedResponse<RawDataSummary>>> {
    let filtered = [...this.rawData];
    if (params?.satelliteId) filtered = filtered.filter((item) => item.satelliteId === params.satelliteId);
    if (params?.mode) filtered = filtered.filter((item) => item.mode === params.mode);
    if (params?.mapped !== undefined) {
      filtered = filtered.filter((item) => params.mapped ? !!item.mappedPipelineId : !item.mappedPipelineId);
    }
    const limit = params?.limit ?? filtered.length;
    return {
      success: true,
      message: 'OK',
      data: {
        items: filtered.slice(0, limit).map((item) => ({ ...item })),
        total: filtered.length,
      },
    };
  }

  async 원시데이터_파이프라인을_매핑한다(rawDataId: string, pipelineId: string | null): Promise<ServiceResponseWithData<RawDataSummary>> {
    const rawData = this.rawData.find((item) => item.id === rawDataId);
    if (!rawData) return { success: false, message: 'Raw data not found' };

    if (pipelineId === null) {
      rawData.mappedPipelineId = null;
      rawData.mappedPipelineName = null;
      rawData.status = 'RECEIVED';
      return { success: true, message: 'Pipeline mapping cleared', data: { ...rawData } };
    }

    const pipeline = this.pipelines.find((item) => item.id === pipelineId && !item.archived);
    if (!pipeline) return { success: false, message: 'Pipeline to map not found' };

    rawData.mappedPipelineId = pipeline.id;
    rawData.mappedPipelineName = pipeline.name;
    rawData.status = 'MAPPED';

    return {
      success: true,
      message: `Raw data linked to "${pipeline.name}"`,
      data: { ...rawData },
    };
  }

  async HDF5_애트리뷰트_목록을_조회한다(params?: {
    rawDataId?: string;
  }): Promise<ServiceResponseWithData<Hdf5FileSummary[]>> {
    const filtered = params?.rawDataId
      ? this.hdf5Files.filter((file) => file.rawDataId === params.rawDataId)
      : this.hdf5Files;
    return {
      success: true,
      message: 'OK',
      data: filtered.map(cloneHdf5FileSummary),
    };
  }

  async HDF5_파일을_업로드한다(file: File, rawDataId?: string): Promise<ServiceResponseWithData<Hdf5FileSummary>> {
    if (!/\.(h5|hdf5)$/i.test(file.name)) {
      return { success: false, message: 'Only HDF5 files (.h5, .hdf5) can be uploaded.' };
    }

    const uploaded = buildUploadedHdf5FileSummary(file, rawDataId);
    this.hdf5Files = [uploaded, ...this.hdf5Files];

    return {
      success: true,
      message: `"${uploaded.fileName}" has been added.`,
      data: cloneHdf5FileSummary(uploaded),
    };
  }

  async Job_목록을_조회한다(params?: {
    status?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: number;
  }): Promise<ServiceResponseWithData<PaginatedResponse<JobSummary>>> {
    let filtered = [...this.jobs];

    if (params?.status) {
      filtered = filtered.filter((j) => j.status === params.status);
    }

    filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const limit = params?.limit ?? 20;
    const startIdx = params?.cursor ? filtered.findIndex((j) => j.jobId === params.cursor) + 1 : 0;
    const page = filtered.slice(startIdx, startIdx + limit);

    return {
      success: true,
      message: 'OK',
      data: {
        items: page.map((j): JobSummary => ({
            jobId: j.jobId,
            pipelineId: j.pipelineId,
            sceneId: j.sceneId,
            status: j.status,
            currentLevel: j.currentLevel,
            currentTargetCsc: j.currentTargetCsc,
            retryCount: j.retryCount,
            startedAt: j.startedAt,
            updatedAt: j.updatedAt,
          })),
        total: filtered.length,
        nextCursor: startIdx + limit < filtered.length ? page[page.length - 1]?.jobId : undefined,
      },
    };
  }

  async Job_상세를_조회한다(jobId: string): Promise<ServiceResponseWithData<JobDetail>> {
    const job = this.jobs.find((j) => j.jobId === jobId);
    if (!job) {
      return { success: false, message: `Job ${jobId} not found` };
    }
    return { success: true, message: 'OK', data: job };
  }

  async Job을_재처리한다(jobId: string): Promise<ServiceResponse> {
    const job = this.jobs.find((j) => j.jobId === jobId);
    if (!job) return { success: false, message: 'Job not found' };
    job.status = 'CREATED';
    job.retryCount = 0;
    job.updatedAt = new Date().toISOString();
    job.steps.forEach((s) => {
      s.status = (s.kind === 'TRIGGER' || s.kind === 'FILE_INPUT' || s.kind === 'JOB_INIT') ? 'COMPLETED' : 'PENDING';
      if (s.status === 'PENDING') resetStepRuntimeFields(s);
    });
    simulateJobExecution(job);
    return { success: true, message: `Reprocessing requested for Job ${jobId}` };
  }

  async 부분_재처리를_요청한다(jobId: string, params: { sarStage: SarStage }): Promise<ServiceResponse> {
    const job = this.jobs.find((j) => j.jobId === jobId);
    if (!job) return { success: false, message: 'Job not found' };
    // 해당 sarStage 이후 스텝을 PENDING으로 리셋 (TRIGGER는 항상 COMPLETED 유지)
    let resetActive = false;
    job.steps.forEach((s) => {
      if (s.kind === 'TRIGGER' || s.kind === 'JOB_INIT') return;
      if (s.sarStage === params.sarStage) resetActive = true;
      if (resetActive) {
        s.status = 'PENDING';
        resetStepRuntimeFields(s);
      }
    });
    job.status = 'CREATED';
    job.updatedAt = new Date().toISOString();
    simulateJobExecution(job);
    return { success: true, message: `Partial reprocessing requested for Job ${jobId} (from ${params.sarStage})` };
  }

  async Job을_취소한다(jobId: string): Promise<ServiceResponse> {
    const job = this.jobs.find((j) => j.jobId === jobId);
    if (!job) return { success: false, message: 'Job not found' };
    job.status = 'CANCELED';
    job.updatedAt = new Date().toISOString();
    job.steps.forEach((s) => {
      if (s.status === 'PENDING' || s.status === 'RUNNING') s.status = 'CANCELED';
    });
    return { success: true, message: `Job ${jobId} has been canceled` };
  }

  async Alert_목록을_조회한다(params?: {
    acknowledged?: boolean;
  }): Promise<ServiceResponseWithData<Alert[]>> {
    let filtered = [...this.alerts];
    if (params?.acknowledged !== undefined) {
      filtered = filtered.filter((a) => a.acknowledged === params.acknowledged);
    }
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { success: true, message: 'OK', data: filtered };
  }

  async Alert을_확인한다(alertId: string, options?: { ifMatchVersion?: number }): Promise<ServiceResponse> {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (!alert) return { success: false, message: 'Alert not found' };
    // S-03: 이미 ack된 Alert에 version 포함 요청 → 409 시뮬레이션
    if (alert.acknowledged && options?.ifMatchVersion !== undefined) {
      return { success: false, message: 'Already acknowledged by another operator', code: 409 };
    }
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = 'operator-01';
    alert.version += 1;
    return { success: true, message: `Alert ${alertId} has been acknowledged` };
  }

  async 감사로그를_조회한다(params?: {
    jobId?: string;
    eventType?: AuditEventType;
    from?: string;
    to?: string;
    page?: number;
    size?: number;
    sortBy?: keyof AuditEvent;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ServiceResponseWithData<PaginatedResponse<AuditEvent>>> {
    let filtered = [...this.auditEvents];
    if (params?.jobId) {
      filtered = filtered.filter((e) => e.jobId.toLowerCase().includes(params.jobId!.toLowerCase()));
    }
    if (params?.eventType) {
      filtered = filtered.filter((e) => e.eventType === params.eventType);
    }
    if (params?.from) {
      const fromDate = new Date(params.from).getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= fromDate);
    }
    if (params?.to) {
      const toDate = new Date(params.to).getTime() + 86400000; // end of day
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() < toDate);
    }
    if (params?.sortBy) {
      const key = params.sortBy;
      const dir = params.sortOrder === 'desc' ? -1 : 1;
      filtered.sort((a, b) => {
        const va = a[key] ?? '';
        const vb = b[key] ?? '';
        if (va < vb) return -dir;
        if (va > vb) return dir;
        if (key !== 'timestamp') {
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        }
        return 0;
      });
    }
    const page = params?.page ?? 1;
    const size = params?.size ?? 20;
    const start = (page - 1) * size;
    return {
      success: true,
      message: 'OK',
      data: {
        items: filtered.slice(start, start + size),
        total: filtered.length,
      },
    };
  }

  async 큐_상태를_조회한다(): Promise<ServiceResponseWithData<QueueHealth[]>> {
    return { success: true, message: 'OK', data: this.queueHealth };
  }

  async 파이프라인_목록을_조회한다(): Promise<ServiceResponseWithData<PipelineDefinition[]>> {
    // 아카이브되지 않은 파이프라인만 반환, 참조 반환 방지를 위해 복사본 반환
    const active = this.pipelines.filter((p) => !p.archived);
    return { success: true, message: 'OK', data: active.map((p) => ({ ...p, steps: [...p.steps] })) };
  }

  async 아카이브_파이프라인_목록을_조회한다(): Promise<ServiceResponseWithData<PipelineDefinition[]>> {
    const archived = this.pipelines.filter((p) => p.archived);
    return { success: true, message: 'OK', data: archived.map((p) => ({ ...p, steps: [...p.steps] })) };
  }

  async 파이프라인을_조회한다(id: string): Promise<ServiceResponseWithData<PipelineDefinition>> {
    const pl = this.pipelines.find((p) => p.id === id);
    if (!pl) return { success: false, message: 'Pipeline not found' };
    return { success: true, message: 'OK', data: { ...pl, steps: [...pl.steps] } };
  }

  async 파이프라인을_생성한다(data: CreatePipelineData): Promise<ServiceResponseWithData<PipelineDefinition>> {
    const now = new Date().toISOString();
    const id = `PL-${++nextPipelineSeq}`;
    const { steps, edges } = toDAGSteps(data.steps);
    const pl: PipelineDefinition = {
      id,
      name: data.name,
      steps,
      edges: data.edges ?? edges,
      createdAt: now,
      updatedAt: now,
    };
    this.pipelines.push(pl);
    const rule = buildActivationRuleForPipeline(pl, this.profiles, false);
    if (rule) this.activationRules.push(rule);
    return { success: true, message: 'Pipeline created', data: { ...pl, steps: [...pl.steps] } };
  }

  async 파이프라인을_수정한다(id: string, data: UpdatePipelineData): Promise<ServiceResponseWithData<PipelineDefinition>> {
    const pl = this.pipelines.find((p) => p.id === id);
    if (!pl) return { success: false, message: 'Pipeline not found' };
    if (data.name !== undefined) pl.name = data.name;
    if (data.steps !== undefined) {
      pl.steps = data.steps.map((s, i) => ({
        order: i + 1,
        kind: s.kind,
        sarStage: s.sarStage,
        ...(s.inputLevel !== undefined && { inputLevel: s.inputLevel }),
        ...(s.enabledTasks !== undefined && { enabledTasks: s.enabledTasks }),
        ...(s.jobInitConfig !== undefined && { jobInitConfig: s.jobInitConfig }),
        ...(s.fileInputConfig !== undefined && { fileInputConfig: s.fileInputConfig }),
        ...(s.disabled !== undefined && { disabled: s.disabled }),
      }));
    }
    if (data.edges !== undefined) {
      pl.edges = data.edges;
    }
    pl.updatedAt = new Date().toISOString();
    this.upsertActivationRule(pl);
    return { success: true, message: 'Pipeline updated', data: { ...pl, steps: [...pl.steps] } };
  }

  async 파이프라인을_삭제한다(id: string): Promise<ServiceResponse> {
    const idx = this.pipelines.findIndex((p) => p.id === id);
    if (idx === -1) return { success: false, message: 'Pipeline not found' };
    this.pipelines.splice(idx, 1);
    this.activationRules = this.activationRules.filter((rule) => rule.pipelineId !== id);
    return { success: true, message: 'Pipeline deleted' };
  }

  async 파이프라인을_복제한다(id: string): Promise<ServiceResponseWithData<PipelineDefinition>> {
    const src = this.pipelines.find((p) => p.id === id);
    if (!src) return { success: false, message: 'Pipeline not found' };
    const now = new Date().toISOString();
    const newId = `PL-${++nextPipelineSeq}`;
    const dup: PipelineDefinition = {
      ...src,
      id: newId,
      name: `${src.name} (copy)`,
      steps: src.steps.map((s) => ({ ...s })),
      edges: src.edges.map((e) => ({ ...e })),
      createdAt: now,
      updatedAt: now,
      archived: false,
    };
    this.pipelines.push(dup);
    const rule = buildActivationRuleForPipeline(dup, this.profiles, false);
    if (rule) this.activationRules.push(rule);
    return { success: true, message: 'Pipeline cloned', data: { ...dup, steps: [...dup.steps] } };
  }

  async 파이프라인을_아카이브한다(id: string, archived: boolean, archiveReason?: string): Promise<ServiceResponse> {
    const pl = this.pipelines.find((p) => p.id === id);
    if (!pl) return { success: false, message: 'Pipeline not found' };
    pl.archived = archived;
    if (archived) {
      pl.archivedAt = new Date().toISOString();
      pl.archiveReason = archiveReason?.trim() || 'No archive reason provided.';
    } else {
      pl.archivedAt = undefined;
      pl.archiveReason = undefined;
    }
    pl.updatedAt = new Date().toISOString();
    this.upsertActivationRule(pl, false);
    return { success: true, message: archived ? 'Pipeline archived' : 'Pipeline restored' };
  }

  async 파이프라인을_실행한다(pipelineId: string): Promise<ServiceResponseWithData<JobSummary>> {
    const pl = this.pipelines.find((p) => p.id === pipelineId);
    if (!pl) return { success: false, message: 'Pipeline not found', data: null as unknown as JobSummary };
    const jobId = `job-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const summary: JobSummary = {
      jobId,
      pipelineId,
      sceneId: `SCN-${Date.now().toString(36).toUpperCase()}`,
      status: 'CREATED',
      currentLevel: null,
      currentTargetCsc: null,
      retryCount: 0,
      startedAt: now,
      updatedAt: now,
    };
    const detail: JobDetail = {
      ...summary,
      steps: pl.steps.map((s) => {
        const targetCsc: TargetCsc = s.kind === 'TRIGGER' ? 'CSC-02'
          : s.kind === 'FILE_INPUT' ? 'CSC-02'
          : s.kind === 'JOB_INIT' ? 'CSC-08'
          : s.kind === 'CATALOG' ? 'CSC-07'
          : SAR_STAGE_TO_CSC[s.sarStage!];
        const productLevel: ProductLevel = s.kind === 'TRIGGER' ? 'LEVEL_0'
          : s.kind === 'FILE_INPUT' ? 'LEVEL_0'
          : s.kind === 'JOB_INIT' ? 'LEVEL_0'
          : s.kind === 'CATALOG' ? 'LEVEL_3'
          : SAR_STAGE_TO_LEVEL[s.sarStage!];
        return {
          order: s.order,
          kind: s.kind,
          sarStage: s.sarStage,
          targetCsc,
          productLevel,
          status: 'PENDING' as const,
        };
      }),
      acquisitionStart: now,
      acquisitionEnd: now,
      receivedAt: now,
      satelliteId: SATELLITE_IDS[0],
      mode: MODES[0],
      rawDataPath: `/nas/raw/${jobId}/`,
      processingProfile: undefined,
    };
    this.jobs.push(detail);

    // 순차 실행 시뮬레이션 시작
    simulateJobExecution(detail);

    return { success: true, message: `Pipeline "${pl.name}" execution requested`, data: summary };
  }

  async 파이프라인_자동실행규칙을_조회한다(pipelineId?: string): Promise<ServiceResponseWithData<PipelineActivationRule[]>> {
    const rules = pipelineId
      ? this.activationRules.filter((rule) => rule.pipelineId === pipelineId)
      : this.activationRules;
    return {
      success: true,
      message: 'OK',
      data: rules.map((rule) => ({ ...rule, match: { ...rule.match } })),
    };
  }

  async 파이프라인_자동실행규칙을_저장한다(
    data: SavePipelineActivationRuleData,
  ): Promise<ServiceResponseWithData<PipelineActivationRule>> {
    if (this.hasDuplicateActiveRoute(data)) {
      return { success: false, message: '동일한 이벤트와 큐가 이미 활성화되어 있습니다.' };
    }
    const rule = this.saveActivationRule(data);
    if (!rule) return { success: false, message: 'Failed to save activation rule' };
    return {
      success: true,
      message: 'Activation rule saved',
      data: { ...rule, match: { ...rule.match } },
    };
  }

  async 파이프라인_배포상태를_변경한다(
    pipelineId: string,
    active: boolean,
  ): Promise<ServiceResponseWithData<PipelineActivationRule>> {
    const pipeline = this.pipelines.find((p) => p.id === pipelineId);
    if (!pipeline) return { success: false, message: 'Pipeline not found' };
    if (pipeline.archived) return { success: false, message: 'Archived pipelines cannot be activated' };

    const rule = this.upsertActivationRule(pipeline, active);
    if (!rule) return { success: false, message: 'Failed to create activation rule' };
    return {
      success: true,
      message: active ? 'Auto-execution connection enabled' : 'Auto-execution connection disabled',
      data: { ...rule, match: { ...rule.match } },
    };
  }

  async 처리_프로파일_목록을_조회한다(params?: {
    satelliteId?: string;
    mode?: string;
  }): Promise<ServiceResponseWithData<ProcessingProfile[]>> {
    let filtered = [...this.profiles];
    if (params?.satelliteId) {
      filtered = filtered.filter((p) => !p.satelliteTags?.length || p.satelliteTags.includes(params.satelliteId!));
    }
    if (params?.mode) {
      filtered = filtered.filter((p) => !p.modeTags?.length || p.modeTags.includes(params.mode!));
    }
    return { success: true, message: 'OK', data: filtered };
  }

  async 처리_프로파일을_생성한다(data: Omit<ProcessingProfile, 'id' | 'createdAt' | 'updatedAt' | 'referencedPipelineCount'>): Promise<ServiceResponseWithData<ProcessingProfile>> {
    const now = new Date().toISOString();
    const profile: ProcessingProfile = {
      ...data,
      id: `PROF-${randomId()}`,
      referencedPipelineCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.profiles.push(profile);
    return { success: true, message: 'Processing profile created', data: profile };
  }

  async 처리_프로파일을_수정한다(id: string, data: Partial<Omit<ProcessingProfile, 'id' | 'createdAt' | 'updatedAt' | 'referencedPipelineCount'>>): Promise<ServiceResponseWithData<ProcessingProfile>> {
    const profile = this.profiles.find((p) => p.id === id);
    if (!profile) return { success: false, message: 'Profile not found' };
    Object.assign(profile, data, { updatedAt: new Date().toISOString() });
    // 프로파일 태그 변경은 이를 참조하는 파이프라인의 활성화 규칙에 즉시 반영되어야 한다.
    for (const pipeline of this.pipelines) {
      const usesProfile = pipeline.steps.some((s) => s.jobInitConfig?.profileId === id);
      if (usesProfile) this.upsertActivationRule(pipeline);
    }
    return { success: true, message: 'Processing profile updated', data: { ...profile } };
  }

  async 처리_프로파일을_삭제한다(id: string): Promise<ServiceResponse> {
    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx === -1) return { success: false, message: 'Profile not found' };
    const profile = this.profiles[idx];
    if (profile.referencedPipelineCount && profile.referencedPipelineCount > 0) {
      return { success: false, message: `${profile.referencedPipelineCount} pipeline(s) reference this profile. Please detach them first.` };
    }
    this.profiles.splice(idx, 1);
    return { success: true, message: 'Processing profile deleted' };
  }

  async 제품_목록을_조회한다(params?: {
    rawDataId?: string;
    level?: string;
    satelliteId?: string;
    mode?: string;
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<ServiceResponseWithData<PaginatedResponse<Product>>> {
    let filtered = [...this.products];
    if (params?.rawDataId) filtered = filtered.filter((p) => p.rawDataId === params.rawDataId);
    if (params?.level) filtered = filtered.filter((p) => p.level === params.level);
    if (params?.satelliteId) filtered = filtered.filter((p) => p.satelliteId === params.satelliteId);
    if (params?.mode) filtered = filtered.filter((p) => p.mode === params.mode);
    if (params?.status) filtered = filtered.filter((p) => p.status === params.status);
    const limit = params?.limit ?? 20;
    const startIdx = params?.cursor ? filtered.findIndex((p) => p.id === params.cursor) + 1 : 0;
    const page = filtered.slice(startIdx, startIdx + limit);
    return {
      success: true,
      message: 'OK',
      data: {
        items: page,
        total: filtered.length,
        nextCursor: startIdx + limit < filtered.length ? page[page.length - 1]?.id : undefined,
      },
    };
  }

  async 제품_상세를_조회한다(productId: string): Promise<ServiceResponseWithData<Product>> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) return { success: false, message: 'Product not found' };
    return { success: true, message: 'OK', data: { ...product } };
  }

  async 제품_다운로드_URL을_발급한다(productId: string): Promise<ServiceResponseWithData<{ url: string; expiresIn: number }>> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) return { success: false, message: 'Product not found' };
    return {
      success: true,
      message: 'OK',
      data: {
        url: `https://storage.sdpe.example.com/products/${productId}/download?token=mock-presigned-token`,
        expiresIn: 3600,
      },
    };
  }

  async 제품_재처리를_요청한다(productId: string, params: { targetLevel: string }): Promise<ServiceResponseWithData<{ jobId: string }>> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) return { success: false, message: 'Product not found' };
    const newJobId = `JOB-RP-${Date.now().toString(36)}`;
    return {
      success: true,
      message: `Reprocessing requested (from ${params.targetLevel})`,
      data: { jobId: newJobId },
    };
  }

  async 실행_로그를_조회한다(params?: {
    jobId?: string;
    level?: string;
    limit?: number;
  }): Promise<ServiceResponseWithData<ExecutionLog[]>> {
    let filtered = [...this.executionLogs];
    if (params?.jobId) filtered = filtered.filter((l) => l.jobId === params.jobId);
    if (params?.level) filtered = filtered.filter((l) => l.level === params.level);
    const limit = params?.limit ?? 200;
    return { success: true, message: 'OK', data: filtered.slice(0, limit) };
  }

  // =========================================================================
  // Auth (UC43~UC46) — Mock
  // =========================================================================

  private mockSession: Session | null = null;

  async 로그인한다(req: { username: string; password: string }): Promise<ServiceResponseWithData<Session>> {
    await new Promise((r) => setTimeout(r, 400));
    const user = mockUsers.find((u) => u.username === req.username);
    if (!user) return { success: false, message: 'Incorrect username or password', code: 401 };
    if (!user.active) return { success: false, message: 'Account is deactivated. Please contact your administrator.', code: 403 };
    if (req.password.length < 4) {
      return { success: false, message: 'Incorrect username or password', code: 401 };
    }
    const session: Session = {
      accessToken: `mock-access-${Date.now().toString(36)}`,
      refreshToken: `mock-refresh-${Date.now().toString(36)}`,
      user: { ...user, lastLoginAt: new Date().toISOString(), lastLoginIp: '10.0.0.42' },
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
    this.mockSession = session;
    user.lastLoginAt = session.user.lastLoginAt;
    user.lastLoginIp = session.user.lastLoginIp;
    return { success: true, message: 'OK', data: session };
  }

  async 로그아웃한다(): Promise<ServiceResponse> {
    this.mockSession = null;
    return { success: true, message: 'OK' };
  }

  async 토큰을_갱신한다(): Promise<ServiceResponseWithData<Session>> {
    if (!this.mockSession) return { success: false, message: 'Session expired', code: 401 };
    const next: Session = {
      ...this.mockSession,
      accessToken: `mock-access-${Date.now().toString(36)}`,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
    this.mockSession = next;
    return { success: true, message: 'OK', data: next };
  }

  async 본인_비밀번호를_변경한다(req: {
    currentPassword: string;
    newPassword: string;
  }): Promise<ServiceResponse> {
    if (!this.mockSession) return { success: false, message: 'Login required', code: 401 };
    if (req.currentPassword.length < 4) return { success: false, message: 'Current password is incorrect', code: 400 };
    if (req.newPassword.length < 12) return { success: false, message: 'New password must be at least 12 characters', code: 400 };
    const u = mockUsers.find((x) => x.id === this.mockSession?.user.id);
    if (u) u.requiresPasswordReset = false;
    return { success: true, message: 'Password has been changed' };
  }

  async 현재_사용자를_조회한다(): Promise<ServiceResponseWithData<User>> {
    if (!this.mockSession) return { success: false, message: 'Login required', code: 401 };
    return { success: true, message: 'OK', data: this.mockSession.user };
  }

  // =========================================================================
  // User Management (UC47~UC50) — Mock
  // =========================================================================

  async 사용자목록을_조회한다(params?: UserListQuery): Promise<ServiceResponseWithData<PaginatedResponse<User>>> {
    let filtered = [...mockUsers];
    const q = params?.search?.trim().toLowerCase();
    if (q) filtered = filtered.filter((u) => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    if (params?.role) filtered = filtered.filter((u) => u.role === params.role);
    if (params?.active === true) filtered = filtered.filter((u) => u.active);
    if (params?.active === false) filtered = filtered.filter((u) => !u.active);

    const sortBy = params?.sortBy;
    if (sortBy) {
      const order = params?.sortOrder === 'desc' ? -1 : 1;
      filtered.sort((a, b) => {
        const av = a[sortBy];
        const bv = b[sortBy];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return -1 * order;
        if (av > bv) return 1 * order;
        return 0;
      });
    } else {
      filtered.sort((a, b) => a.username.localeCompare(b.username));
    }

    const page = params?.page ?? 1;
    const size = params?.size ?? 25;
    const total = filtered.length;
    const items = filtered.slice((page - 1) * size, page * size);
    return { success: true, message: 'OK', data: { items, total } };
  }

  async 사용자를_생성한다(req: CreateUserRequest): Promise<ServiceResponseWithData<User>> {
    if (mockUsers.some((u) => u.username === req.username)) {
      return { success: false, message: 'Username already exists', code: 409 };
    }
    if (mockUsers.some((u) => u.email === req.email)) {
      return { success: false, message: 'Email is already registered', code: 409 };
    }
    const user: User = {
      id: `user-${Date.now().toString(36)}`,
      username: req.username,
      email: req.email,
      role: req.role,
      active: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
      lastLoginIp: null,
      requiresPasswordReset: true,
    };
    mockUsers.push(user);
    return { success: true, message: 'User created', data: user };
  }

  async 사용자를_수정한다(id: string, req: UpdateUserRequest): Promise<ServiceResponseWithData<User>> {
    const user = mockUsers.find((u) => u.id === id);
    if (!user) return { success: false, message: 'User not found', code: 404 };

    if (req.active === false && user.role === 'Administrator') {
      const activeAdmins = mockUsers.filter((u) => u.role === 'Administrator' && u.active && u.id !== id).length;
      if (activeAdmins === 0) {
        return { success: false, message: 'At least one active Administrator is required', code: 409 };
      }
    }

    if (req.email != null) user.email = req.email;
    if (req.role != null) user.role = req.role;
    if (req.active != null) user.active = req.active;
    return { success: true, message: 'User information updated', data: user };
  }

  async 사용자_비밀번호를_초기화한다(id: string): Promise<ServiceResponseWithData<{ temporaryPassword: string }>> {
    const user = mockUsers.find((u) => u.id === id);
    if (!user) return { success: false, message: 'User not found', code: 404 };
    const temp = generateTempPassword();
    user.requiresPasswordReset = true;
    return { success: true, message: 'Password has been reset', data: { temporaryPassword: temp } };
  }
}

// =============================================================================
// Mock Users (UC47~UC50)
// =============================================================================

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const specials = '!@#$%^&*';
  let out = '';
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
  out += specials[Math.floor(Math.random() * specials.length)];
  return out;
}

const mockUsers: User[] = [
  {
    id: 'user-admin-01',
    username: 'admin',
    email: 'admin@sdpe.lumir.local',
    role: 'Administrator',
    active: true,
    createdAt: '2025-09-01T00:00:00Z',
    lastLoginAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    lastLoginIp: '10.0.0.12',
    requiresPasswordReset: false,
  },
  {
    id: 'user-admin-02',
    username: 'admin-backup',
    email: 'admin.backup@sdpe.lumir.local',
    role: 'Administrator',
    active: true,
    createdAt: '2025-09-02T00:00:00Z',
    lastLoginAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    lastLoginIp: '10.0.0.13',
    requiresPasswordReset: false,
  },
  {
    id: 'user-op-01',
    username: 'operator-01',
    email: 'operator01@sdpe.lumir.local',
    role: 'Operator',
    active: true,
    createdAt: '2025-09-15T00:00:00Z',
    lastLoginAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    lastLoginIp: '10.0.0.41',
    requiresPasswordReset: false,
  },
  {
    id: 'user-op-02',
    username: 'operator-02',
    email: 'operator02@sdpe.lumir.local',
    role: 'Operator',
    active: true,
    createdAt: '2025-10-02T00:00:00Z',
    lastLoginAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    lastLoginIp: '10.0.0.42',
    requiresPasswordReset: false,
  },
  {
    id: 'user-op-03',
    username: 'operator-03',
    email: 'operator03@sdpe.lumir.local',
    role: 'Operator',
    active: true,
    createdAt: '2025-11-11T00:00:00Z',
    lastLoginAt: null,
    lastLoginIp: null,
    requiresPasswordReset: true,
  },
  {
    id: 'user-op-04',
    username: 'operator-04',
    email: 'operator04@sdpe.lumir.local',
    role: 'Operator',
    active: false,
    createdAt: '2025-08-20T00:00:00Z',
    lastLoginAt: '2025-12-15T09:12:00Z',
    lastLoginIp: '10.0.0.44',
    requiresPasswordReset: false,
  },
];

export const mockPipelineService = new MockPipelineUIService();
