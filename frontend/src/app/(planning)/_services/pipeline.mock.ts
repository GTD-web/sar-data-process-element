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
  QueueHealth,
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
  'KS5-20260401-001', 'KS5-20260401-002', 'KS5-20260402-003',
  'KS5-20260403-004', 'KS5-20260403-005', 'KS5-20260404-006',
  'KS5-20260405-007', 'KS5-20260406-008', 'KS5-20260407-009',
  'KS5-20260408-010', 'KS5-20260409-011', 'KS5-20260410-012',
];

const SATELLITE_IDS = ['KS-5', 'KS-6', 'KS-7'];
const MODES = ['Stripmap', 'ScanSAR', 'Spotlight'];

const MOCK_PROCESSING_PROFILES: ProcessingProfile[] = SATELLITE_IDS.flatMap((sat) => [
  { id: `PROF-${sat}-SM-HHHV`, name: `${sat} Stripmap Dual`, satelliteId: sat, mode: 'Stripmap', polarization: 'HH+HV', description: 'Stripmap 이중편파 표준 처리', parameters: { azimuthLooks: 4, rangeLooks: 1 }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: `PROF-${sat}-SM-HH`, name: `${sat} Stripmap Single`, satelliteId: sat, mode: 'Stripmap', polarization: 'HH', description: 'Stripmap 단일편파 표준 처리', parameters: { azimuthLooks: 4, rangeLooks: 1 }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: `PROF-${sat}-SC-VV`, name: `${sat} ScanSAR VV`, satelliteId: sat, mode: 'ScanSAR', polarization: 'VV', description: 'ScanSAR 단일편파 광역 처리', parameters: { burstOverlap: 0.1 }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: `PROF-${sat}-SC-VVVH`, name: `${sat} ScanSAR Dual`, satelliteId: sat, mode: 'ScanSAR', polarization: 'VV+VH', description: 'ScanSAR 이중편파 광역 처리', parameters: { burstOverlap: 0.1 }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: `PROF-${sat}-SL-HH`, name: `${sat} Spotlight HH`, satelliteId: sat, mode: 'Spotlight', polarization: 'HH', description: 'Spotlight 고해상도 처리', parameters: { azimuthLooks: 1, rangeLooks: 1 }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: `PROF-${sat}-SL-HHHV`, name: `${sat} Spotlight Dual`, satelliteId: sat, mode: 'Spotlight', polarization: 'HH+HV', description: 'Spotlight 이중편파 고해상도 처리', parameters: { azimuthLooks: 1, rangeLooks: 1 }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
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

function generateJobs(count: number, pipelineIds: string[]): JobDetail[] {
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

    const retryCount = status === 'FAILED' ? Math.floor(Math.random() * 4) : 0;
    const steps = buildSteps(PIPELINE_STEPS, status, retryCount);
    const runningStep = steps.find((s) => s.status === 'RUNNING' || s.status === 'FAILED');
    const acqStart = randomDate(7);
    const acqEnd = new Date(new Date(acqStart).getTime() + 120000).toISOString();

    const satelliteId = randomChoice(SATELLITE_IDS);
    const mode = randomChoice(MODES);

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

    const triggerSources: TriggerSource[] = ['PIPELINE_AUTO', 'MANUAL_REQUEST', 'PARTIAL_REPROCESS'];

    return {
      jobId: `JOB-${String(idx + 1).padStart(4, '0')}`,
      pipelineId: pipelineIds[idx % pipelineIds.length],
      sceneId: SCENE_IDS[idx % SCENE_IDS.length],
      status,
      currentLevel: runningStep?.productLevel ?? (status === 'COMPLETED' ? 'LEVEL_3' : null),
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
      triggerSource: idx < 40 ? 'PIPELINE_AUTO' : randomChoice(triggerSources),
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
  const eventTypes: AuditEventType[] = [
    'JOB_CREATED', 'JOB_ASSIGNED', 'JOB_COMPLETED', 'JOB_FAILED',
    'PIPELINE_STARTED', 'PIPELINE_REPROCESSED', 'ALERT_DISPATCHED',
  ];

  for (const job of jobs.slice(0, 30)) {
    const count = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < count; k++) {
      const eventType = eventTypes[Math.min(k, eventTypes.length - 1)];
      events.push({
        id: `EVT-${randomId()}`,
        eventType,
        jobId: job.jobId,
        timestamp: randomDate(3),
        detail: `${eventType} for ${job.jobId} (${job.sceneId})`,
        operatorId: eventType === 'PIPELINE_REPROCESSED' ? 'operator-01' : undefined,
      });
    }
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

  return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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

function generateQueueHealth(): QueueHealth[] {
  return QUEUE_NAMES.map((queue) => {
    const depth = Math.floor(Math.random() * 20);
    return {
      queue,
      depth,
      oldestMessageAge: depth > 0 ? Math.floor(Math.random() * 7200) : 0,
      consumers: 1 + Math.floor(Math.random() * 3),
      healthy: depth < 15 && Math.random() > 0.1,
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
    // L1 입력 → L2부터 처리 (Stripmap, 위성별 각 1개)
    buildPipelineFromSteps(
      'PL-KS5-Partial-L1-Stripmap',
      'KS-5 L1 입력 재처리 (Stripmap)',
      'KS-5', 'Stripmap', PARTIAL_L1_STRIPMAP_STEPS, '2026-02-01T09:00:00Z',
    ),
    buildPipelineFromSteps(
      'PL-KS6-Partial-L1-Stripmap',
      'KS-6 L1 입력 재처리 (Stripmap)',
      'KS-6', 'Stripmap', PARTIAL_L1_STRIPMAP_STEPS, '2026-02-10T09:00:00Z',
    ),
    buildPipelineFromSteps(
      'PL-KS7-Partial-L1-Stripmap',
      'KS-7 L1 입력 재처리 (Stripmap)',
      'KS-7', 'Stripmap', PARTIAL_L1_STRIPMAP_STEPS, '2026-02-10T09:00:00Z',
    ),
    // L1 입력 → ScanSAR (L1B까지이므로 등록만)
    buildPipelineFromSteps(
      'PL-KS5-Partial-L1-ScanSAR',
      'KS-5 L1 입력 재처리 (ScanSAR)',
      'KS-5', 'ScanSAR', PARTIAL_L1_SCANSAR_STEPS, '2026-02-15T09:00:00Z',
    ),
    // L1 입력 → Spotlight (L1C까지이므로 등록만)
    buildPipelineFromSteps(
      'PL-KS5-Partial-L1-Spotlight',
      'KS-5 L1 입력 재처리 (Spotlight)',
      'KS-5', 'Spotlight', PARTIAL_L1_SPOTLIGHT_STEPS, '2026-02-15T09:00:00Z',
    ),
    // L2 입력 → L3만 처리 (KS-5, KS-6 Stripmap)
    buildPipelineFromSteps(
      'PL-KS5-Partial-L2-Stripmap',
      'KS-5 L2 입력 재처리 (Stripmap)',
      'KS-5', 'Stripmap', PARTIAL_L2_STEPS, '2026-03-01T09:00:00Z',
    ),
    buildPipelineFromSteps(
      'PL-KS6-Partial-L2-Stripmap',
      'KS-6 L2 입력 재처리 (Stripmap)',
      'KS-6', 'Stripmap', PARTIAL_L2_STEPS, '2026-03-01T09:00:00Z',
    ),
  ];

  return [...full, ...partial];
}

let nextPipelineSeq = 100;

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

  constructor() {
    this.pipelines = generatePipelines();
    const pipelineIds = this.pipelines.map((p) => p.id);
    this.jobs = generateJobs(50, pipelineIds);
    this.alerts = generateAlerts(this.jobs);
    this.auditEvents = generateAuditEvents(this.jobs);
    this.queueHealth = generateQueueHealth();
    this.executionLogs = generateExecutionLogs(this.jobs);
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
    page?: number;
    size?: number;
    sortBy?: keyof AuditEvent;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ServiceResponseWithData<PaginatedResponse<AuditEvent>>> {
    let filtered = [...this.auditEvents];
    if (params?.jobId) {
      filtered = filtered.filter((e) => e.jobId === params.jobId);
    }
    if (params?.sortBy) {
      const key = params.sortBy;
      const dir = params.sortOrder === 'desc' ? -1 : 1;
      filtered.sort((a, b) => {
        const va = a[key] ?? '';
        const vb = b[key] ?? '';
        return va < vb ? -dir : va > vb ? dir : 0;
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
    // 참조 반환 시 외부 변이가 React state에 영향을 주므로 항상 복사본 반환
    return { success: true, message: 'OK', data: this.pipelines.map((p) => ({ ...p, steps: [...p.steps] })) };
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
    return { success: true, message: `파이프라인 "${pl.name}" 실행이 요청되었습니다`, data: summary };
  }

  async 처리_프로파일_목록을_조회한다(params?: {
    satelliteId?: string;
    mode?: string;
  }): Promise<ServiceResponseWithData<ProcessingProfile[]>> {
    let filtered = [...MOCK_PROCESSING_PROFILES];
    if (params?.satelliteId) filtered = filtered.filter((p) => p.satelliteId === params.satelliteId);
    if (params?.mode) filtered = filtered.filter((p) => p.mode === params.mode);
    return { success: true, message: 'OK', data: filtered };
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
