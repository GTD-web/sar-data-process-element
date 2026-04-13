import type { IPipelineUIService } from './pipeline.service.interface';
import type {
  Alert,
  AuditEvent,
  DashboardStats,
  JobDetail,
  JobSummary,
  PaginatedResponse,
  PipelineDefinition,
  PipelineStep,
  QueueHealth,
  ServiceResponse,
  ServiceResponseWithData,
  JobStatus,
  StepStatus,
  ProductLevel,
  TargetCsc,
  AlertKind,
  AuditEventType,
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

const PIPELINE_STEPS: { targetCsc: TargetCsc; productLevel: ProductLevel }[] = [
  { targetCsc: 'CSC-02', productLevel: 'LEVEL_0' },
  { targetCsc: 'CSC-03', productLevel: 'LEVEL_0' },
  { targetCsc: 'CSC-04', productLevel: 'LEVEL_1' },
  { targetCsc: 'CSC-05', productLevel: 'LEVEL_2' },
  { targetCsc: 'CSC-06', productLevel: 'LEVEL_3' },
  { targetCsc: 'CSC-07', productLevel: 'LEVEL_3' },
];

function buildSteps(status: JobStatus, retryCount: number): PipelineStep[] {
  const completedCount =
    status === 'COMPLETED' ? 6
    : status === 'ASSIGNED' ? Math.floor(Math.random() * 5)
    : status === 'FAILED' ? Math.floor(Math.random() * 5)
    : status === 'CREATED' ? 0
    : 0;

  return PIPELINE_STEPS.map((def, i): PipelineStep => {
    let stepStatus: StepStatus;
    if (i < completedCount) {
      stepStatus = 'COMPLETED';
    } else if (i === completedCount && status === 'ASSIGNED') {
      stepStatus = 'RUNNING';
    } else if (i === completedCount && status === 'FAILED') {
      stepStatus = 'FAILED';
    } else {
      stepStatus = 'PENDING';
    }

    const baseTime = new Date();
    baseTime.setHours(baseTime.getHours() - (6 - i) * 0.5);

    return {
      order: i + 1,
      targetCsc: def.targetCsc,
      productLevel: def.productLevel,
      status: stepStatus,
      startedAt: stepStatus !== 'PENDING' ? baseTime.toISOString() : undefined,
      finishedAt: stepStatus === 'COMPLETED' ? new Date(baseTime.getTime() + (600 + Math.random() * 3000) * 1000).toISOString() : undefined,
      durationMs: stepStatus === 'COMPLETED' ? Math.floor((600 + Math.random() * 3000) * 1000) : undefined,
      errorCode: stepStatus === 'FAILED' ? `ERR_${def.targetCsc.replace('-', '')}_${1000 + Math.floor(Math.random() * 100)}` : undefined,
      errorMessage: stepStatus === 'FAILED'
        ? retryCount >= 3 ? `Max retry exceeded for ${def.targetCsc}` : `Processing timeout at ${def.targetCsc}`
        : undefined,
      outputPath: stepStatus === 'COMPLETED' ? `/mnt/nas/sdpe/output/${def.productLevel.toLowerCase()}/scene_xxx.h5` : undefined,
    };
  });
}

// =============================================================================
// Generate Mock Dataset
// =============================================================================

function generateJobs(count: number): JobDetail[] {
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
    const steps = buildSteps(status, retryCount);
    const runningStep = steps.find((s) => s.status === 'RUNNING' || s.status === 'FAILED');
    const acqStart = randomDate(7);
    const acqEnd = new Date(new Date(acqStart).getTime() + 120000).toISOString();

    return {
      jobId: `JOB-${String(idx + 1).padStart(4, '0')}`,
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
      satelliteId: randomChoice(SATELLITE_IDS),
      mode: randomChoice(MODES),
      rawDataPath: `/mnt/nas/sdpe/raw/${SCENE_IDS[idx % SCENE_IDS.length]}.raw`,
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

function generatePipelines(): PipelineDefinition[] {
  return SATELLITE_IDS.flatMap((sat) =>
    MODES.map((mode) => ({
      id: `PL-${sat}-${mode}`.replace(/\s/g, ''),
      name: `${sat} ${mode} Pipeline`,
      satelliteId: sat,
      mode,
      steps: PIPELINE_STEPS.map((s, i) => ({ order: i + 1, ...s })),
      createdAt: '2026-01-15T09:00:00Z',
    })),
  );
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

  constructor() {
    this.jobs = generateJobs(50);
    this.alerts = generateAlerts(this.jobs);
    this.auditEvents = generateAuditEvents(this.jobs);
    this.queueHealth = generateQueueHealth();
    this.pipelines = generatePipelines();
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
        items: page.map(({ steps, acquisitionStart, acquisitionEnd, receivedAt, satelliteId, mode, rawDataPath, ...summary }) => summary),
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
    job.steps.forEach((s) => { s.status = 'PENDING'; });
    return { success: true, message: `Job ${jobId} 재처리가 요청되었습니다` };
  }

  async Job을_취소한다(jobId: string): Promise<ServiceResponse> {
    const job = this.jobs.find((j) => j.jobId === jobId);
    if (!job) return { success: false, message: 'Job을 찾을 수 없습니다' };
    job.status = 'CANCELED';
    job.updatedAt = new Date().toISOString();
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

  async Alert을_확인한다(alertId: string): Promise<ServiceResponse> {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (!alert) return { success: false, message: 'Alert을 찾을 수 없습니다' };
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = 'operator-01';
    return { success: true, message: `Alert ${alertId}이(가) 확인되었습니다` };
  }

  async 감사로그를_조회한다(params?: {
    jobId?: string;
    page?: number;
    size?: number;
  }): Promise<ServiceResponseWithData<PaginatedResponse<AuditEvent>>> {
    let filtered = [...this.auditEvents];
    if (params?.jobId) {
      filtered = filtered.filter((e) => e.jobId === params.jobId);
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
    return { success: true, message: 'OK', data: this.pipelines };
  }
}

export const mockPipelineService = new MockPipelineUIService();
