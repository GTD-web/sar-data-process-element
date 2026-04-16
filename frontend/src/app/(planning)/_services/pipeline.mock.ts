import type { IPipelineUIService } from '@/services/pipeline.service.interface';
import type {
  Alert,
  AuditEvent,
  CreatePipelineData,
  DashboardStats,
  ExecutionLog,
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
  QueueHealth,
  QueueMessage,
  QueueDeadLetter,
  QueueDepthPoint,
  SarStage,
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
  ProcessingProfileSummary,
  TriggerSource,
  JobInitConfig,
} from '@/types/pipeline';
import {
  SAR_STAGE_TO_CSC,
  SAR_STAGE_TO_LEVEL,
} from '@/types/pipeline';

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

const SATELLITE_IDS = ['Lumir-X1', 'Lumir-X2', 'Lumir-X3'];
const MODES = ['Stripmap', 'ScanSAR', 'Spotlight'];

const MOCK_PROCESSING_PROFILES: ProcessingProfile[] = SATELLITE_IDS.flatMap((sat) => [
  { id: `PROF-${sat}-SM-HHHV`, name: `${sat} Stripmap Dual`, satelliteId: sat, mode: 'Stripmap', polarization: 'HH+HV', priority: 3, description: 'Stripmap 이중편파 표준 처리', parameters: { azimuthLooks: 4, rangeLooks: 1 }, referencedPipelineCount: 2, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: `PROF-${sat}-SM-HH`, name: `${sat} Stripmap Single`, satelliteId: sat, mode: 'Stripmap', polarization: 'HH', priority: 5, description: 'Stripmap 단일편파 표준 처리', parameters: { azimuthLooks: 4, rangeLooks: 1 }, referencedPipelineCount: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: `PROF-${sat}-SC-VV`, name: `${sat} ScanSAR VV`, satelliteId: sat, mode: 'ScanSAR', polarization: 'VV', priority: 4, description: 'ScanSAR 단일편파 광역 처리', parameters: { burstOverlap: 0.1 }, referencedPipelineCount: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: `PROF-${sat}-SC-VVVH`, name: `${sat} ScanSAR Dual`, satelliteId: sat, mode: 'ScanSAR', polarization: 'VV+VH', priority: 5, description: 'ScanSAR 이중편파 광역 처리', parameters: { burstOverlap: 0.1 }, referencedPipelineCount: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: `PROF-${sat}-SL-HH`, name: `${sat} Spotlight HH`, satelliteId: sat, mode: 'Spotlight', polarization: 'HH', priority: 2, description: 'Spotlight 고해상도 처리', parameters: { azimuthLooks: 1, rangeLooks: 1 }, referencedPipelineCount: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: `PROF-${sat}-SL-HHHV`, name: `${sat} Spotlight Dual`, satelliteId: sat, mode: 'Spotlight', polarization: 'HH+HV', priority: 6, description: 'Spotlight 이중편파 고해상도 처리', parameters: { azimuthLooks: 1, rangeLooks: 1 }, referencedPipelineCount: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
]);

const MODE_DEFAULT_POLARIZATION: Record<string, string> = {
  Stripmap: 'HH+HV',
  ScanSAR: 'VV',
  Spotlight: 'HH',
};

type StepDef = { kind: PipelineNodeKind; sarStage?: SarStage; inputLevel?: ProductLevel };

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
      : SAR_STAGE_TO_CSC[def.sarStage!];
    const productLevel: ProductLevel = def.kind === 'TRIGGER' ? 'LEVEL_0'
      : def.kind === 'FILE_INPUT' ? 'LEVEL_0'
      : def.kind === 'JOB_INIT' ? 'LEVEL_0'
      : def.kind === 'CATALOG' ? 'LEVEL_3'
      : SAR_STAGE_TO_LEVEL[def.sarStage!];

    const baseTime = new Date();
    baseTime.setHours(baseTime.getHours() - (pipelineSteps.length - i) * 0.5);
    const stageId = def.sarStage ?? def.kind;
    const isFixed = def.kind === 'TRIGGER' || def.kind === 'FILE_INPUT' || def.kind === 'JOB_INIT';

    return {
      order: i + 1,
      kind: def.kind,
      sarStage: def.sarStage,
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

function generateJobs(count: number, pipelines: PipelineDefinition[]): JobDetail[] {
  const statuses: JobStatus[] = ['CREATED', 'ASSIGNED', 'COMPLETED', 'FAILED', 'CANCELED'];
  const weights = [0.05, 0.25, 0.45, 0.15, 0.1];

  return Array.from({ length: count }, (_, idx) => {
    const r = Math.random();
    let cumulative = 0;
    let status: JobStatus = 'CREATED';
    for (let j = 0; j < weights.length; j++) {
      cumulative += weights[j];
      if (r < cumulative) { status = statuses[j]; break; }
    }

    const pipeline = pipelines[idx % pipelines.length];
    const pipelineStepDefs = toStepDefs(pipeline);
    const satelliteId = pipeline.satelliteId;
    const mode = pipeline.mode;

    const retryCount = status === 'FAILED' ? Math.floor(Math.random() * 4) : 0;
    const steps = buildSteps(pipelineStepDefs, status, retryCount);
    const runningStep = steps.find((s) => s.status === 'RUNNING' || s.status === 'FAILED');
    const acqStart = randomDate(7);
    const acqEnd = new Date(new Date(acqStart).getTime() + 120000).toISOString();

    // 파이프라인에 FILE_INPUT이 있으면 부분 재처리
    const isPartial = pipelineStepDefs.some((s) => s.kind === 'FILE_INPUT');
    const triggerSource: TriggerSource = isPartial ? 'PARTIAL_REPROCESS' : (idx < 40 ? 'PIPELINE_AUTO' : randomChoice(['PIPELINE_AUTO', 'MANUAL_REQUEST', 'PARTIAL_REPROCESS'] as TriggerSource[]));

    // 완료 시 최종 산출물 레벨은 파이프라인의 마지막 SAR 스테이지 기준
    const lastSarStep = [...pipelineStepDefs].reverse().find((s) => s.kind === 'SAR');
    const finalLevel: ProductLevel = lastSarStep?.sarStage ? SAR_STAGE_TO_LEVEL[lastSarStep.sarStage] : 'LEVEL_3';

    const PROFILE_POLARIZATIONS: Record<string, string> = {
      Stripmap: 'HH+HV',
      ScanSAR: 'VV',
      Spotlight: 'HH',
    };
    const processingProfile: ProcessingProfileSummary = {
      id: `PROF-${satelliteId}-${mode}`.replace(/\s/g, ''),
      name: `${satelliteId} ${mode} Standard`,
      mode,
      polarization: PROFILE_POLARIZATIONS[mode] ?? 'HH',
      description: `${mode} 모드 표준 처리 프로파일`,
    };

    return {
      jobId: `JOB-${String(idx + 1).padStart(4, '0')}`,
      pipelineId: pipeline.id,
      sceneId: SCENE_IDS[idx % SCENE_IDS.length],
      status,
      currentLevel: runningStep?.productLevel ?? (status === 'COMPLETED' ? finalLevel : null),
      currentTargetCsc: runningStep?.targetCsc ?? null,
      retryCount,
      startedAt: randomDate(3),
      updatedAt: randomDate(0.5),
      steps,
      acquisitionStart: acqStart,
      acquisitionEnd: acqEnd,
      receivedAt: new Date(new Date(acqEnd).getTime() + 300000).toISOString(),
      satelliteId,
      mode,
      rawDataPath: `/mnt/nas/sdpe/raw/${SCENE_IDS[idx % SCENE_IDS.length]}.raw`,
      processingProfile,
      priority: 3 + Math.floor(Math.random() * 5),
      triggerSource,
    };
  });
}

function generateAlerts(jobs: JobDetail[]): Alert[] {
  const failedJobs = jobs.filter((j) => j.status === 'FAILED');
  const kinds: AlertKind[] = ['MAX_RETRY', 'PIPELINE_DELAY', 'QUALITY_FAIL', 'RESOURCE_THRESHOLD'];
  const messages: Record<AlertKind, string> = {
    MAX_RETRY: '최대 재시도 횟수 초과',
    PIPELINE_DELAY: '파이프라인 처리 지연 (> 2시간)',
    QUALITY_FAIL: '산출물 품질 검증 실패',
    RESOURCE_THRESHOLD: 'NAS 디스크 사용률 90% 초과',
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

function generateProducts(jobs: JobDetail[]): Product[] {
  const completedJobs = jobs.filter((j) => j.status === 'COMPLETED' || j.status === 'FAILED');
  const products: Product[] = [];
  const levels: ProductLevel[] = ['LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];

  for (const job of completedJobs) {
    const numProducts = job.status === 'COMPLETED' ? 1 + Math.floor(Math.random() * 3) : (Math.random() > 0.5 ? 1 : 0);
    for (let i = 0; i < numProducts; i++) {
      const level = levels[Math.min(i, levels.length - 1)];
      const status: ProductStatus = job.status === 'FAILED' && i === numProducts - 1 ? 'FAILED' : 'COMPLETED';

      const quality: ProductQuality | undefined = status === 'COMPLETED' ? {
        nesz: { value: -22 - Math.random() * 6, unit: 'dB', pass: Math.random() > 0.1 },
        pslr: { value: -20 - Math.random() * 10, unit: 'dB', pass: Math.random() > 0.1 },
        geometricAccuracy: { value: 1 + Math.random() * 4, unit: 'm', pass: Math.random() > 0.15 },
        radiometricCalibration: { pass: Math.random() > 0.1, detail: 'Calibration within tolerance' },
      } : undefined;

      const baseLat = 35 + Math.random() * 3;
      const baseLon = 126 + Math.random() * 3;

      products.push({
        id: `PROD-${job.jobId}-${level}`,
        sceneId: job.sceneId,
        jobId: job.jobId,
        level,
        satelliteId: job.satelliteId,
        mode: job.mode,
        polarization: job.processingProfile?.polarization ?? 'HH',
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
        createdAt: job.updatedAt,
      });
    }
  }

  return products.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
  return QUEUE_NAMES.map((queue) => {
    const depth = Math.floor(Math.random() * 20);
    return {
      queue,
      depth,
      oldestMessageAge: depth > 0 ? Math.floor(Math.random() * 7200) : 0,
      consumers: 1 + Math.floor(Math.random() * 3),
      healthy: depth < 15 && Math.random() > 0.1,
      messages: generateQueueMessages(queue, depth),
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
  sat: string,
  mode: string,
  stepDefs: StepDef[],
  createdAt = '2026-01-15T09:00:00Z',
): PipelineDefinition {
  const pol = MODE_DEFAULT_POLARIZATION[mode] ?? 'HH';
  const matchingProfile = MOCK_PROCESSING_PROFILES.find(
    (p) => p.satelliteId === sat && p.mode === mode && p.polarization === pol,
  );
  const stepsWithConfig = stepDefs.map((s) => {
    if (s.kind === 'JOB_INIT') {
      const config: JobInitConfig = {
        polarization: pol,
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
  return { id, name, satelliteId: sat, mode, steps, edges, createdAt, updatedAt: createdAt };
}

function generatePipelines(): PipelineDefinition[] {
  // 전체 처리 파이프라인 (위성 × 모드)
  const full = SATELLITE_IDS.flatMap((sat) =>
    MODES.map((mode) => {
      const modeSteps = MODE_STEP_VARIANTS[mode] ?? PIPELINE_STEPS;
      return buildPipelineFromSteps(
        `PL-${sat}-${mode}`.replace(/\s/g, ''),
        `${sat} ${mode} Pipeline`,
        sat, mode, modeSteps,
      );
    }),
  );

  // 부분 재처리 파이프라인 (OPS-06) — FILE_INPUT 시작
  const partial: PipelineDefinition[] = [
    buildPipelineFromSteps(
      'PL-LX1-Partial-L1-Stripmap',
      'Lumir-X1 L1 입력 재처리 (Stripmap)',
      'Lumir-X1', 'Stripmap', PARTIAL_L1_STRIPMAP_STEPS, '2026-02-01T09:00:00Z',
    ),
    buildPipelineFromSteps(
      'PL-LX2-Partial-L1-Stripmap',
      'Lumir-X2 L1 입력 재처리 (Stripmap)',
      'Lumir-X2', 'Stripmap', PARTIAL_L1_STRIPMAP_STEPS, '2026-02-10T09:00:00Z',
    ),
    buildPipelineFromSteps(
      'PL-LX3-Partial-L1-Stripmap',
      'Lumir-X3 L1 입력 재처리 (Stripmap)',
      'Lumir-X3', 'Stripmap', PARTIAL_L1_STRIPMAP_STEPS, '2026-02-10T09:00:00Z',
    ),
    buildPipelineFromSteps(
      'PL-LX1-Partial-L1-ScanSAR',
      'Lumir-X1 L1 입력 재처리 (ScanSAR)',
      'Lumir-X1', 'ScanSAR', PARTIAL_L1_SCANSAR_STEPS, '2026-02-15T09:00:00Z',
    ),
    buildPipelineFromSteps(
      'PL-LX1-Partial-L1-Spotlight',
      'Lumir-X1 L1 입력 재처리 (Spotlight)',
      'Lumir-X1', 'Spotlight', PARTIAL_L1_SPOTLIGHT_STEPS, '2026-02-15T09:00:00Z',
    ),
    buildPipelineFromSteps(
      'PL-LX1-Partial-L2-Stripmap',
      'Lumir-X1 L2 입력 재처리 (Stripmap)',
      'Lumir-X1', 'Stripmap', PARTIAL_L2_STEPS, '2026-03-01T09:00:00Z',
    ),
    buildPipelineFromSteps(
      'PL-LX2-Partial-L2-Stripmap',
      'Lumir-X2 L2 입력 재처리 (Stripmap)',
      'Lumir-X2', 'Stripmap', PARTIAL_L2_STEPS, '2026-03-01T09:00:00Z',
    ),
  ];

  // 아카이브된 파이프라인 (구버전, 테스트용 등)
  const archived: PipelineDefinition[] = [
    { ...buildPipelineFromSteps(
      'PL-LX1-Archive-1', 'Lumir-X1 Stripmap Pipeline (v1 — 폐기)',
      'Lumir-X1', 'Stripmap', PIPELINE_STEPS, '2025-06-01T09:00:00Z',
    ), archived: true },
    { ...buildPipelineFromSteps(
      'PL-LX1-Archive-2', 'Lumir-X1 ScanSAR 테스트 파이프라인',
      'Lumir-X1', 'ScanSAR', MODE_STEP_VARIANTS['ScanSAR'] ?? PIPELINE_STEPS, '2025-08-15T09:00:00Z',
    ), archived: true },
    { ...buildPipelineFromSteps(
      'PL-LX2-Archive-1', 'Lumir-X2 Spotlight 실험 파이프라인',
      'Lumir-X2', 'Spotlight', MODE_STEP_VARIANTS['Spotlight'] ?? PIPELINE_STEPS, '2025-10-20T09:00:00Z',
    ), archived: true },
  ];

  return [...full, ...partial, ...archived];
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

/**
 * Job의 스텝을 순차적으로 RUNNING → COMPLETED로 진행시킨다.
 * 각 스텝이 일정 시간 후 COMPLETED로 전환되고 다음 스텝이 RUNNING으로 변경된다.
 */
function simulateJobExecution(job: JobDetail) {
  job.status = 'ASSIGNED';
  job.updatedAt = new Date().toISOString();

  const steps = job.steps;
  let currentIdx = 0;

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
  private jobs: JobDetail[];
  private alerts: Alert[];
  private auditEvents: AuditEvent[];
  private queueHealth: QueueHealth[];
  private pipelines: PipelineDefinition[];
  private executionLogs: ExecutionLog[];
  private profiles: ProcessingProfile[];
  private products: Product[];

  constructor() {
    this.pipelines = generatePipelines();
    this.jobs = generateJobs(50, this.pipelines);
    this.alerts = generateAlerts(this.jobs);
    this.auditEvents = generateAuditEvents(this.jobs);
    this.queueHealth = generateQueueHealth();
    this.executionLogs = generateExecutionLogs(this.jobs);
    this.profiles = [...MOCK_PROCESSING_PROFILES];
    this.products = generateProducts(this.jobs);
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
      return { success: false, message: `Job ${jobId}을(를) 찾을 수 없습니다` };
    }
    return { success: true, message: 'OK', data: job };
  }

  async Job을_재처리한다(jobId: string): Promise<ServiceResponse> {
    const job = this.jobs.find((j) => j.jobId === jobId);
    if (!job) return { success: false, message: 'Job을 찾을 수 없습니다' };
    job.status = 'CREATED';
    job.retryCount = 0;
    job.updatedAt = new Date().toISOString();
    job.steps.forEach((s) => { s.status = (s.kind === 'TRIGGER' || s.kind === 'FILE_INPUT' || s.kind === 'JOB_INIT') ? 'COMPLETED' : 'PENDING'; });
    return { success: true, message: `Job ${jobId} 재처리가 요청되었습니다` };
  }

  async 부분_재처리를_요청한다(jobId: string, params: { sarStage: SarStage }): Promise<ServiceResponse> {
    const job = this.jobs.find((j) => j.jobId === jobId);
    if (!job) return { success: false, message: 'Job을 찾을 수 없습니다' };
    // 해당 sarStage 이후 스텝을 PENDING으로 리셋 (TRIGGER는 항상 COMPLETED 유지)
    let resetActive = false;
    job.steps.forEach((s) => {
      if (s.kind === 'TRIGGER' || s.kind === 'JOB_INIT') return;
      if (s.sarStage === params.sarStage) resetActive = true;
      if (resetActive) s.status = 'PENDING';
    });
    job.status = 'CREATED';
    job.updatedAt = new Date().toISOString();
    return { success: true, message: `Job ${jobId} 부분 재처리(${params.sarStage}부터)가 요청되었습니다` };
  }

  async Job을_취소한다(jobId: string): Promise<ServiceResponse> {
    const job = this.jobs.find((j) => j.jobId === jobId);
    if (!job) return { success: false, message: 'Job을 찾을 수 없습니다' };
    job.status = 'CANCELED';
    job.updatedAt = new Date().toISOString();
    job.steps.forEach((s) => {
      if (s.status === 'PENDING' || s.status === 'RUNNING') s.status = 'CANCELED';
    });
    return { success: true, message: `Job ${jobId}이(가) 취소되었습니다` };
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
    if (!alert) return { success: false, message: 'Alert을 찾을 수 없습니다' };
    // S-03: 이미 ack된 Alert에 version 포함 요청 → 409 시뮬레이션
    if (alert.acknowledged && options?.ifMatchVersion !== undefined) {
      return { success: false, message: '이미 다른 운영자가 확인했습니다', code: 409 };
    }
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = 'operator-01';
    alert.version += 1;
    return { success: true, message: `Alert ${alertId}이(가) 확인되었습니다` };
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
    if (!pl) return { success: false, message: '파이프라인을 찾을 수 없습니다' };
    return { success: true, message: 'OK', data: { ...pl, steps: [...pl.steps] } };
  }

  async 파이프라인을_생성한다(data: CreatePipelineData): Promise<ServiceResponseWithData<PipelineDefinition>> {
    const now = new Date().toISOString();
    const id = `PL-${++nextPipelineSeq}`;
    const { steps, edges } = toDAGSteps(data.steps);
    const pl: PipelineDefinition = {
      id,
      name: data.name,
      satelliteId: data.satelliteId,
      mode: data.mode,
      steps,
      edges: data.edges ?? edges,
      createdAt: now,
      updatedAt: now,
    };
    this.pipelines.push(pl);
    return { success: true, message: '파이프라인이 생성되었습니다', data: { ...pl, steps: [...pl.steps] } };
  }

  async 파이프라인을_수정한다(id: string, data: UpdatePipelineData): Promise<ServiceResponseWithData<PipelineDefinition>> {
    const pl = this.pipelines.find((p) => p.id === id);
    if (!pl) return { success: false, message: '파이프라인을 찾을 수 없습니다' };
    if (data.name !== undefined) pl.name = data.name;
    if (data.satelliteId !== undefined) pl.satelliteId = data.satelliteId;
    if (data.mode !== undefined) pl.mode = data.mode;
    if (data.steps !== undefined) {
      pl.steps = data.steps.map((s, i) => ({
        order: i + 1,
        kind: s.kind,
        sarStage: s.sarStage,
        ...(s.inputLevel !== undefined && { inputLevel: s.inputLevel }),
        ...(s.enabledTasks !== undefined && { enabledTasks: s.enabledTasks }),
        ...(s.jobInitConfig !== undefined && { jobInitConfig: s.jobInitConfig }),
        ...(s.fileInputConfig !== undefined && { fileInputConfig: s.fileInputConfig }),
      }));
    }
    if (data.edges !== undefined) {
      pl.edges = data.edges;
    }
    pl.updatedAt = new Date().toISOString();
    return { success: true, message: '파이프라인이 수정되었습니다', data: { ...pl, steps: [...pl.steps] } };
  }

  async 파이프라인을_삭제한다(id: string): Promise<ServiceResponse> {
    const idx = this.pipelines.findIndex((p) => p.id === id);
    if (idx === -1) return { success: false, message: '파이프라인을 찾을 수 없습니다' };
    this.pipelines.splice(idx, 1);
    return { success: true, message: '파이프라인이 삭제되었습니다' };
  }

  async 파이프라인을_복제한다(id: string): Promise<ServiceResponseWithData<PipelineDefinition>> {
    const src = this.pipelines.find((p) => p.id === id);
    if (!src) return { success: false, message: '파이프라인을 찾을 수 없습니다' };
    const now = new Date().toISOString();
    const newId = `PL-${++nextPipelineSeq}`;
    const dup: PipelineDefinition = {
      ...src,
      id: newId,
      name: `${src.name} (복사)`,
      steps: src.steps.map((s) => ({ ...s })),
      edges: src.edges.map((e) => ({ ...e })),
      createdAt: now,
      updatedAt: now,
      archived: false,
    };
    this.pipelines.push(dup);
    return { success: true, message: '파이프라인이 복제되었습니다', data: { ...dup, steps: [...dup.steps] } };
  }

  async 파이프라인을_아카이브한다(id: string, archived: boolean): Promise<ServiceResponse> {
    const pl = this.pipelines.find((p) => p.id === id);
    if (!pl) return { success: false, message: '파이프라인을 찾을 수 없습니다' };
    pl.archived = archived;
    pl.updatedAt = new Date().toISOString();
    return { success: true, message: archived ? '파이프라인이 아카이브되었습니다' : '파이프라인이 복원되었습니다' };
  }

  async 파이프라인을_실행한다(pipelineId: string): Promise<ServiceResponseWithData<JobSummary>> {
    const pl = this.pipelines.find((p) => p.id === pipelineId);
    if (!pl) return { success: false, message: '파이프라인을 찾을 수 없습니다', data: null as unknown as JobSummary };
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
      satelliteId: pl.satelliteId,
      mode: pl.mode,
      rawDataPath: `/nas/raw/${jobId}/`,
      processingProfile: undefined,
    };
    this.jobs.push(detail);

    // 순차 실행 시뮬레이션 시작
    simulateJobExecution(detail);

    return { success: true, message: `파이프라인 "${pl.name}" 실행이 요청되었습니다`, data: summary };
  }

  async 처리_프로파일_목록을_조회한다(params?: {
    satelliteId?: string;
    mode?: string;
  }): Promise<ServiceResponseWithData<ProcessingProfile[]>> {
    let filtered = [...this.profiles];
    if (params?.satelliteId) filtered = filtered.filter((p) => p.satelliteId === params.satelliteId);
    if (params?.mode) filtered = filtered.filter((p) => p.mode === params.mode);
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
    return { success: true, message: '처리 프로파일이 생성되었습니다', data: profile };
  }

  async 처리_프로파일을_수정한다(id: string, data: Partial<Omit<ProcessingProfile, 'id' | 'createdAt' | 'updatedAt' | 'referencedPipelineCount'>>): Promise<ServiceResponseWithData<ProcessingProfile>> {
    const profile = this.profiles.find((p) => p.id === id);
    if (!profile) return { success: false, message: '프로파일을 찾을 수 없습니다' };
    Object.assign(profile, data, { updatedAt: new Date().toISOString() });
    return { success: true, message: '처리 프로파일이 수정되었습니다', data: { ...profile } };
  }

  async 처리_프로파일을_삭제한다(id: string): Promise<ServiceResponse> {
    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx === -1) return { success: false, message: '프로파일을 찾을 수 없습니다' };
    const profile = this.profiles[idx];
    if (profile.referencedPipelineCount && profile.referencedPipelineCount > 0) {
      return { success: false, message: `이 프로파일을 참조하는 파이프라인이 ${profile.referencedPipelineCount}개 있습니다. 먼저 해제하세요.` };
    }
    this.profiles.splice(idx, 1);
    return { success: true, message: '처리 프로파일이 삭제되었습니다' };
  }

  async 제품_목록을_조회한다(params?: {
    level?: string;
    satelliteId?: string;
    mode?: string;
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<ServiceResponseWithData<PaginatedResponse<Product>>> {
    let filtered = [...this.products];
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
    if (!product) return { success: false, message: '제품을 찾을 수 없습니다' };
    return { success: true, message: 'OK', data: { ...product } };
  }

  async 제품_다운로드_URL을_발급한다(productId: string): Promise<ServiceResponseWithData<{ url: string; expiresIn: number }>> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) return { success: false, message: '제품을 찾을 수 없습니다' };
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
    if (!product) return { success: false, message: '제품을 찾을 수 없습니다' };
    const newJobId = `JOB-RP-${Date.now().toString(36)}`;
    return {
      success: true,
      message: `재처리가 요청되었습니다 (${params.targetLevel}부터)`,
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
}

export const mockPipelineService = new MockPipelineUIService();
