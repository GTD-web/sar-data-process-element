import { Test } from '@nestjs/testing';
import { HandleStepFailedUseCase } from './handle-step-failed.use-case';
import { JOB_REPOSITORY, type IJobRepository } from '@sdpe/task-queue';
import { PIPELINE_EXECUTION_REPOSITORY, type IPipelineExecutionRepository } from '@sdpe/pipeline-scheduler';
import { RETRY_EVALUATOR, type IRetryEvaluator } from '@sdpe/processing-monitor';
import { ALERT_DISPATCHER, type IAlertDispatcher, ALERT_CONDITION_EVALUATOR, type IAlertConditionEvaluator } from '@sdpe/alert';
import { AUDIT_LOG_WRITER, type IAuditLogWriter, AuditEventType } from '@sdpe/audit-log';
import {
  type ProcessingEvent,
  Job,
  PipelineExecution,
  PipelineStep,
  ProductLevel,
  TargetCsc,
  SourceCsc,
  createJobId,
} from '@sdpe/shared';
import { AlertType, type AlertPayload } from '@sdpe/alert';

function createProcessingFailedEvent(overrides?: Partial<ProcessingEvent>): ProcessingEvent {
  return {
    schema_version: '1.0',
    job_id: 'job-001',
    event_type: 'PROCESSING_FAILED',
    source_csc: SourceCsc.CSC_03,
    product_level: ProductLevel.LEVEL_0,
    timestamp: '2026-01-01T00:10:00Z',
    input_path: '/data/raw/scene.dat',
    output_path: null,
    retry_count: 1,
    error_code: 'ERR_TIMEOUT',
    error_message: 'Processing timed out',
    ...overrides,
  };
}

function createAssignedJob(): Job {
  const job = Job.create({
    id: createJobId('job-001'),
    eventId: 'evt-001',
    rawDataPath: '/data/raw/test.dat',
    processingProfileId: 'prof-1',
    satelliteId: 'SAT-1',
    mode: 'STRIPMAP',
  });
  job.assign(TargetCsc.CSC_03, ProductLevel.LEVEL_0);
  return job;
}

function createExecutionWithInProgressStep(): PipelineExecution {
  const steps = [
    new PipelineStep(1, TargetCsc.CSC_02, ProductLevel.LEVEL_0),
    new PipelineStep(2, TargetCsc.CSC_03, ProductLevel.LEVEL_0),
  ];
  steps[0]!.start();
  steps[0]!.complete();
  steps[1]!.start();
  return PipelineExecution.create('exec-1', 'job-001', steps);
}

describe('HandleStepFailedUseCase', () => {
  let useCase: HandleStepFailedUseCase;
  let mockJobRepository: jest.Mocked<IJobRepository>;
  let mockPipelineExecutionRepository: jest.Mocked<IPipelineExecutionRepository>;
  let mockAlertDispatcher: jest.Mocked<IAlertDispatcher>;
  let mockAuditLogWriter: jest.Mocked<IAuditLogWriter>;
  let mockRetryEvaluator: jest.Mocked<IRetryEvaluator>;
  let mockAlertConditionEvaluator: jest.Mocked<IAlertConditionEvaluator>;

  beforeEach(async () => {
    mockJobRepository = { save: jest.fn(), findById: jest.fn(), findByEventId: jest.fn(), findByStatus: jest.fn() };
    mockPipelineExecutionRepository = { save: jest.fn(), findById: jest.fn(), findByJobId: jest.fn() };
    mockAlertDispatcher = { dispatch: jest.fn() };
    mockAuditLogWriter = { write: jest.fn() };
    mockRetryEvaluator = { evaluate: jest.fn() };
    mockAlertConditionEvaluator = { evaluateRetryExhausted: jest.fn(), evaluatePipelineDelay: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        HandleStepFailedUseCase,
        { provide: JOB_REPOSITORY, useValue: mockJobRepository },
        { provide: PIPELINE_EXECUTION_REPOSITORY, useValue: mockPipelineExecutionRepository },
        { provide: ALERT_DISPATCHER, useValue: mockAlertDispatcher },
        { provide: AUDIT_LOG_WRITER, useValue: mockAuditLogWriter },
        { provide: RETRY_EVALUATOR, useValue: mockRetryEvaluator },
        { provide: ALERT_CONDITION_EVALUATOR, useValue: mockAlertConditionEvaluator },
      ],
    }).compile();

    useCase = module.get(HandleStepFailedUseCase);
  });

  it('재시도 가능하면 동일 CSC에 재할당 + JOB_RETRIED 감사 로그', async () => {
    const job = createAssignedJob();
    const execution = createExecutionWithInProgressStep();

    mockJobRepository.findById.mockResolvedValue(job);
    mockPipelineExecutionRepository.findByJobId.mockResolvedValue(execution);
    mockRetryEvaluator.evaluate.mockReturnValue({
      shouldRetry: true,
      shouldAlert: false,
      reason: 'Retry 1/3',
    });

    await useCase.execute(createProcessingFailedEvent());

    // Job fail → retryCount 증가 → 재할당
    expect(mockAuditLogWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: AuditEventType.JOB_RETRIED }),
    );
    expect(mockAlertDispatcher.dispatch).not.toHaveBeenCalled();
    expect(mockJobRepository.save).toHaveBeenCalled();
  });

  it('재시도 소진 + Alert 조건 충족 시 Alert 발행 + JOB_FAILED 감사 로그', async () => {
    const job = createAssignedJob();
    const execution = createExecutionWithInProgressStep();
    const alertPayload: AlertPayload = {
      alertType: AlertType.RETRY_EXHAUSTED,
      jobId: 'job-001',
      message: 'Retry exhausted',
      details: { retryCount: 3 },
      timestamp: new Date(),
    };

    mockJobRepository.findById.mockResolvedValue(job);
    mockPipelineExecutionRepository.findByJobId.mockResolvedValue(execution);
    mockRetryEvaluator.evaluate.mockReturnValue({
      shouldRetry: false,
      shouldAlert: true,
      reason: 'Max retry count (3) reached.',
    });
    mockAlertConditionEvaluator.evaluateRetryExhausted.mockReturnValue(alertPayload);

    await useCase.execute(createProcessingFailedEvent());

    expect(mockAlertDispatcher.dispatch).toHaveBeenCalledWith(alertPayload);
    // ALERT_DISPATCHED + JOB_FAILED 감사 로그 2건
    expect(mockAuditLogWriter.write).toHaveBeenCalledTimes(2);
    expect(mockAuditLogWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: AuditEventType.ALERT_DISPATCHED }),
    );
    expect(mockAuditLogWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: AuditEventType.JOB_FAILED }),
    );
  });

  it('재시도 소진이지만 Alert 조건 미충족 시 Alert 없이 JOB_FAILED만', async () => {
    const job = createAssignedJob();
    const execution = createExecutionWithInProgressStep();

    mockJobRepository.findById.mockResolvedValue(job);
    mockPipelineExecutionRepository.findByJobId.mockResolvedValue(execution);
    mockRetryEvaluator.evaluate.mockReturnValue({
      shouldRetry: false,
      shouldAlert: false,
      reason: 'Max retry exceeded.',
    });

    await useCase.execute(createProcessingFailedEvent());

    expect(mockAlertDispatcher.dispatch).not.toHaveBeenCalled();
    expect(mockAuditLogWriter.write).toHaveBeenCalledTimes(1);
    expect(mockAuditLogWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: AuditEventType.JOB_FAILED }),
    );
  });

  it('Job이 없으면 에러', async () => {
    mockJobRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute(createProcessingFailedEvent())).rejects.toThrow('Job not found');
  });

  it('PipelineExecution이 없으면 에러', async () => {
    mockJobRepository.findById.mockResolvedValue(createAssignedJob());
    mockPipelineExecutionRepository.findByJobId.mockResolvedValue(null);

    await expect(useCase.execute(createProcessingFailedEvent())).rejects.toThrow(
      'Pipeline execution not found',
    );
  });
});
