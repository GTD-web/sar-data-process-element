import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, Injectable } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PgmqClientService, SdpePgmqModule } from '@sdpe/infrastructure';
import {
  type RawDataReceivedEvent,
  type ProcessingEvent,
  ProductLevel,
  TargetCsc,
  SourceCsc,
  Job,
  PipelineExecution,
  ProcessingProfile,
  JobStatus,
  StepStatus,
} from '@sdpe/shared';
import { JOB_REPOSITORY, type IJobRepository, STEP_RESOLVER } from '@sdpe/task-queue';
import {
  DAG_BUILDER,
  PIPELINE_EXECUTION_REPOSITORY,
  type IPipelineExecutionRepository,
} from '@sdpe/pipeline-scheduler';
import { PROFILE_SELECTOR } from '@sdpe/processing-profile';
import { AUDIT_LOG_WRITER, type IAuditLogWriter, type AuditEvent } from '@sdpe/audit-log';
import { METRIC_RECORDER, RETRY_EVALUATOR } from '@sdpe/processing-monitor';
import { ALERT_DISPATCHER, ALERT_CONDITION_EVALUATOR } from '@sdpe/alert';
import { StepResolverService } from '@sdpe/task-queue';
import { DagBuilderService } from '@sdpe/pipeline-scheduler';
import { RetryEvaluatorService } from '@sdpe/processing-monitor';
import { AlertConditionEvaluatorService } from '@sdpe/alert';

import { ReceptionEventMessageHandler } from '../src/csc08-orchestrator/infrastructure/reception-event.message-handler';
import { ProcessingEventMessageHandler } from '../src/csc08-orchestrator/infrastructure/processing-event.message-handler';
import { StartPipelineHandler } from '../src/csc08-orchestrator/handlers/commands/start-pipeline.handler';
import { HandleStepCompletedHandler } from '../src/csc08-orchestrator/handlers/commands/handle-step-completed.handler';
import { HandleStepFailedHandler } from '../src/csc08-orchestrator/handlers/commands/handle-step-failed.handler';
import { ReprocessPipelineHandler } from '../src/csc08-orchestrator/handlers/commands/reprocess-pipeline.handler';
import { GetJobStatusHandler } from '../src/csc08-orchestrator/handlers/queries/get-job-status.handler';
import { GetPipelineExecutionHandler } from '../src/csc08-orchestrator/handlers/queries/get-pipeline-execution.handler';
import { JobFailedAlertHandler } from '../src/csc08-orchestrator/handlers/events/job-failed-alert.handler';
import { StepCompletedAuditHandler } from '../src/csc08-orchestrator/handlers/events/step-completed-audit.handler';
import { StartPipelineUseCase } from '../src/csc08-orchestrator/use-case/start-pipeline.use-case';
import { HandleStepCompletedUseCase } from '../src/csc08-orchestrator/use-case/handle-step-completed.use-case';
import { HandleStepFailedUseCase } from '../src/csc08-orchestrator/use-case/handle-step-failed.use-case';
import { ReprocessPipelineUseCase } from '../src/csc08-orchestrator/use-case/reprocess-pipeline.use-case';

// ── 인메모리 구현체 ──

const jobs = new Map<string, Job>();
const executions = new Map<string, PipelineExecution>();
const executionsByJobId = new Map<string, PipelineExecution>();
const auditLogs: AuditEvent[] = [];
const alertsDispatched: { jobId?: string; message: string }[] = [];

@Injectable()
class InMemoryJobRepository implements IJobRepository {
  async save(job: Job): Promise<void> {
    jobs.set(job.id, job);
  }
  async findById(id: string): Promise<Job | null> {
    return jobs.get(id) ?? null;
  }
  async findByEventId(eventId: string): Promise<Job | null> {
    for (const job of jobs.values()) {
      if (job.eventId === eventId) return job;
    }
    return null;
  }
  async findByStatus(status: string): Promise<Job[]> {
    return [...jobs.values()].filter((j) => j.status === status);
  }
}

@Injectable()
class InMemoryPipelineExecutionRepository implements IPipelineExecutionRepository {
  async save(execution: PipelineExecution): Promise<void> {
    executions.set(execution.id, execution);
    executionsByJobId.set(execution.jobId, execution);
  }
  async findById(id: string): Promise<PipelineExecution | null> {
    return executions.get(id) ?? null;
  }
  async findByJobId(jobId: string): Promise<PipelineExecution | null> {
    return executionsByJobId.get(jobId) ?? null;
  }
}

@Injectable()
class InMemoryAuditLogWriter implements IAuditLogWriter {
  async write(event: AuditEvent): Promise<void> {
    auditLogs.push(event);
  }
}

@Injectable()
class InMemoryMetricRecorder {
  async record(): Promise<void> {
    /* no-op for e2e */
  }
  async findByJobId(): Promise<never[]> {
    return [];
  }
}

@Injectable()
class InMemoryAlertDispatcher {
  async dispatch(payload: { jobId?: string; message: string }): Promise<void> {
    alertsDispatched.push(payload);
  }
}

@Injectable()
class StubProfileSelector {
  async selectProfile(_satelliteId: string, _mode: string): Promise<ProcessingProfile> {
    return new ProcessingProfile('prof-e2e', 'SAT-1', 'STRIPMAP', ['HH'], 'E2E test profile');
  }
}

// ── 테스트 큐 이름 (다른 테스트와 충돌 방지) ──
const E2E_RECEPTION_QUEUE = 'sdpe_e2e_reception';
const E2E_PROCESSING_QUEUE = 'sdpe_e2e_processing';

/**
 * CSC-08 파이프라인 E2E 테스트.
 *
 * PGMQ 큐를 통해 메시지를 직접 발행하고,
 * 오케스트레이터가 올바르게 메시지를 소비하여 파이프라인을 진행하는지 검증한다.
 *
 * 인메모리 레포지토리를 사용하여 DB 의존성 없이 전체 흐름을 테스트한다.
 * PGMQ만 실제 PostgreSQL을 사용한다.
 */
describe('CSC-08 Pipeline E2E (PGMQ)', () => {
  let app: INestApplication;
  let pgmqClient: PgmqClientService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env.DATABASE_URL ?? 'postgresql://sdpe:sdpe@localhost:5432/sdpe',
          synchronize: false,
        }),
        CqrsModule,
        SdpePgmqModule.forRoot({
          imports: [CqrsModule],
          consumers: [
            {
              queue: E2E_RECEPTION_QUEUE,
              handler: ReceptionEventMessageHandler,
              visibilityTimeoutSec: 10,
              pollIntervalMs: 200,
            },
            {
              queue: E2E_PROCESSING_QUEUE,
              handler: ProcessingEventMessageHandler,
              visibilityTimeoutSec: 10,
              pollIntervalMs: 200,
            },
          ],
        }),
      ],
      providers: [
        // Use cases
        StartPipelineUseCase,
        HandleStepCompletedUseCase,
        HandleStepFailedUseCase,
        ReprocessPipelineUseCase,
        // Command handlers
        StartPipelineHandler,
        HandleStepCompletedHandler,
        HandleStepFailedHandler,
        ReprocessPipelineHandler,
        // Query handlers
        GetJobStatusHandler,
        GetPipelineExecutionHandler,
        // Event handlers
        JobFailedAlertHandler,
        StepCompletedAuditHandler,
        // 인메모리 포트 바인딩
        { provide: JOB_REPOSITORY, useClass: InMemoryJobRepository },
        { provide: PIPELINE_EXECUTION_REPOSITORY, useClass: InMemoryPipelineExecutionRepository },
        { provide: AUDIT_LOG_WRITER, useClass: InMemoryAuditLogWriter },
        { provide: METRIC_RECORDER, useClass: InMemoryMetricRecorder },
        { provide: STEP_RESOLVER, useClass: StepResolverService },
        { provide: DAG_BUILDER, useClass: DagBuilderService },
        { provide: PROFILE_SELECTOR, useClass: StubProfileSelector },
        { provide: RETRY_EVALUATOR, useClass: RetryEvaluatorService },
        { provide: ALERT_DISPATCHER, useClass: InMemoryAlertDispatcher },
        { provide: ALERT_CONDITION_EVALUATOR, useClass: AlertConditionEvaluatorService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    pgmqClient = moduleRef.get(PgmqClientService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jobs.clear();
    executions.clear();
    executionsByJobId.clear();
    auditLogs.length = 0;
    alertsDispatched.length = 0;
  });

  // ── 헬퍼 ──

  function createRawDataEvent(eventId = 'evt-e2e-001'): RawDataReceivedEvent {
    return {
      schema_version: '1.0',
      event_id: eventId,
      event_type: 'RAW_DATA_RECEIVED',
      acquisition_start: '2026-01-01T00:00:00Z',
      acquisition_end: '2026-01-01T00:01:00Z',
      raw_data_path: '/nas/raw/scene001.dat',
      file_size_bytes: 500_000_000,
      checksum_sha256: 'e2e_checksum',
      satellite_id: 'SAT-1',
      mode: 'STRIPMAP',
      polarization: ['HH', 'VV'],
      center_frequency_hz: 5_405_000_000,
      prf_hz: 1_700,
    };
  }

  function createCompletedEvent(jobId: string, sourceCsc: SourceCsc, productLevel: ProductLevel): ProcessingEvent {
    return {
      schema_version: '1.0',
      job_id: jobId,
      event_type: 'PROCESSING_COMPLETED',
      source_csc: sourceCsc,
      product_level: productLevel,
      timestamp: new Date().toISOString(),
      input_path: '/data/in',
      output_path: '/data/out',
      retry_count: 0,
      processing_duration_ms: 3000,
    };
  }

  function createFailedEvent(
    jobId: string,
    sourceCsc: SourceCsc,
    productLevel: ProductLevel,
    retryCount: number,
  ): ProcessingEvent {
    return {
      schema_version: '1.0',
      job_id: jobId,
      event_type: 'PROCESSING_FAILED',
      source_csc: sourceCsc,
      product_level: productLevel,
      timestamp: new Date().toISOString(),
      input_path: '/data/in',
      output_path: null,
      retry_count: retryCount,
      error_code: 'ERR_PROCESSING',
      error_message: 'Processing failed',
    };
  }

  async function waitForCondition(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error('Timeout waiting for condition');
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // ── 테스트 케이스 ──

  it('SI-01 수신 이벤트 → 파이프라인 시작: Job 생성 및 첫 단계 할당', async () => {
    await pgmqClient.send(E2E_RECEPTION_QUEUE, createRawDataEvent('evt-e2e-start'));

    await waitForCondition(() => jobs.size > 0);

    // Job이 생성되고 첫 번째 CSC(CSC-02)에 할당됨
    const job = [...jobs.values()][0]!;
    expect(job.status).toBe(JobStatus.ASSIGNED);
    expect(job.currentTargetCsc).toBe(TargetCsc.CSC_02);
    expect(job.currentProductLevel).toBe(ProductLevel.LEVEL_0);

    // PipelineExecution이 생성됨
    expect(executionsByJobId.size).toBe(1);
    const execution = [...executionsByJobId.values()][0]!;
    expect(execution.steps).toHaveLength(5);
    expect(execution.steps[0]!.status).toBe(StepStatus.IN_PROGRESS);

    // PIPELINE_STARTED 감사 로그
    expect(auditLogs.some((l) => l.eventType === 'PIPELINE_STARTED')).toBe(true);
  });

  it('SI-03 완료 이벤트 → 다음 단계 할당', async () => {
    // 먼저 파이프라인 시작
    await pgmqClient.send(E2E_RECEPTION_QUEUE, createRawDataEvent('evt-e2e-next'));
    await waitForCondition(() => jobs.size > 0);

    const job = [...jobs.values()][0]!;
    const jobId = job.id;

    // CSC-02 완료 이벤트 전송
    await pgmqClient.send(E2E_PROCESSING_QUEUE, createCompletedEvent(jobId, SourceCsc.CSC_02, ProductLevel.LEVEL_0));

    await waitForCondition(() => {
      const j = jobs.get(jobId);
      return j?.currentTargetCsc === TargetCsc.CSC_03;
    });

    const updatedJob = jobs.get(jobId)!;
    expect(updatedJob.currentTargetCsc).toBe(TargetCsc.CSC_03);
  });

  it('SI-03 실패 이벤트 → 재시도 (retryCount < 3)', async () => {
    // 파이프라인 시작
    await pgmqClient.send(E2E_RECEPTION_QUEUE, createRawDataEvent('evt-e2e-retry'));
    await waitForCondition(() => jobs.size > 0);

    const job = [...jobs.values()][0]!;
    const jobId = job.id;

    // CSC-02 실패 이벤트 전송
    await pgmqClient.send(E2E_PROCESSING_QUEUE, createFailedEvent(jobId, SourceCsc.CSC_02, ProductLevel.LEVEL_0, 0));

    await waitForCondition(() => {
      return auditLogs.some((l) => l.eventType === 'JOB_RETRIED');
    });

    // JOB_RETRIED 감사 로그 기록 확인
    expect(auditLogs.some((l) => l.eventType === 'JOB_RETRIED')).toBe(true);
    // Alert은 발행되지 않음
    expect(alertsDispatched).toHaveLength(0);
  });

  it('3회 재시도 소진 → Alert 발행 + JOB_FAILED', async () => {
    // 파이프라인 시작
    await pgmqClient.send(E2E_RECEPTION_QUEUE, createRawDataEvent('evt-e2e-exhaust'));
    await waitForCondition(() => jobs.size > 0);

    const job = [...jobs.values()][0]!;
    const jobId = job.id;

    // 3회 실패 시뮬레이션: fail → assign 반복하여 retryCount를 3으로 만듦
    for (let i = 0; i < 3; i++) {
      await pgmqClient.send(E2E_PROCESSING_QUEUE, createFailedEvent(jobId, SourceCsc.CSC_02, ProductLevel.LEVEL_0, i));
      await waitForCondition(() => {
        const j = jobs.get(jobId);
        return j !== undefined && j.retryCount >= i + 1;
      });
    }

    await waitForCondition(() => auditLogs.some((l) => l.eventType === 'JOB_FAILED'));

    // JOB_FAILED 감사 로그 + Alert 발행 확인
    expect(auditLogs.some((l) => l.eventType === 'JOB_FAILED')).toBe(true);
    expect(alertsDispatched.length).toBeGreaterThan(0);
  });

  it('전체 파이프라인 흐름: SI-01 → CSC-02~06 순차 완료 → PIPELINE_COMPLETED', async () => {
    // 파이프라인 시작
    await pgmqClient.send(E2E_RECEPTION_QUEUE, createRawDataEvent('evt-e2e-full'));
    await waitForCondition(() => jobs.size > 0);

    const job = [...jobs.values()][0]!;
    const jobId = job.id;

    // 5개 CSC 순차 완료 시뮬레이션
    const pipeline: [SourceCsc, ProductLevel][] = [
      [SourceCsc.CSC_02, ProductLevel.LEVEL_0],
      [SourceCsc.CSC_03, ProductLevel.LEVEL_0],
      [SourceCsc.CSC_04, ProductLevel.LEVEL_1],
      [SourceCsc.CSC_05, ProductLevel.LEVEL_2],
      [SourceCsc.CSC_06, ProductLevel.LEVEL_3],
    ];

    for (const [sourceCsc, productLevel] of pipeline) {
      await pgmqClient.send(E2E_PROCESSING_QUEUE, createCompletedEvent(jobId, sourceCsc, productLevel));

      // 마지막 단계가 아니면 다음 단계 할당 대기, 마지막이면 파이프라인 완료 대기
      if (sourceCsc !== SourceCsc.CSC_06) {
        await waitForCondition(() => {
          const j = jobs.get(jobId);
          return j?.status === JobStatus.ASSIGNED || j?.status === JobStatus.CREATED;
        });
      }
    }

    await waitForCondition(() => auditLogs.some((l) => l.eventType === 'PIPELINE_COMPLETED'), 10000);

    // 파이프라인 완료 감사 로그
    expect(auditLogs.some((l) => l.eventType === 'PIPELINE_COMPLETED')).toBe(true);
  });
});
