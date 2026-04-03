import { Test } from '@nestjs/testing';
import { HandleStepCompletedUseCase } from './handle-step-completed.use-case';
import { JOB_REPOSITORY, type IJobRepository, STEP_RESOLVER, type IStepResolver } from '@sdpe/task-queue';
import { PIPELINE_EXECUTION_REPOSITORY, type IPipelineExecutionRepository } from '@sdpe/pipeline-scheduler';
import { AUDIT_LOG_WRITER, type IAuditLogWriter, AuditEventType } from '@sdpe/audit-log';
import { METRIC_RECORDER, type IMetricRecorder } from '@sdpe/processing-monitor';
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

function createProcessingCompletedEvent(overrides?: Partial<ProcessingEvent>): ProcessingEvent {
  return {
    schema_version: '1.0',
    job_id: 'job-001',
    event_type: 'PROCESSING_COMPLETED',
    source_csc: SourceCsc.CSC_02,
    product_level: ProductLevel.LEVEL_0,
    timestamp: '2026-01-01T00:10:00Z',
    input_path: '/data/raw/scene.dat',
    output_path: '/data/level0/scene.dat',
    retry_count: 0,
    processing_duration_ms: 5000,
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
  job.assign(TargetCsc.CSC_02, ProductLevel.LEVEL_0);
  return job;
}

function createExecutionWithInProgressFirst(): PipelineExecution {
  const steps = [
    new PipelineStep(1, TargetCsc.CSC_02, ProductLevel.LEVEL_0),
    new PipelineStep(2, TargetCsc.CSC_03, ProductLevel.LEVEL_0),
    new PipelineStep(3, TargetCsc.CSC_04, ProductLevel.LEVEL_1),
  ];
  steps[0]!.start();
  return PipelineExecution.create('exec-1', 'job-001', steps);
}

describe('HandleStepCompletedUseCase', () => {
  let useCase: HandleStepCompletedUseCase;
  let mockJobRepository: jest.Mocked<IJobRepository>;
  let mockPipelineExecutionRepository: jest.Mocked<IPipelineExecutionRepository>;
  let mockAuditLogWriter: jest.Mocked<IAuditLogWriter>;
  let mockMetricRecorder: jest.Mocked<IMetricRecorder>;
  let mockStepResolver: jest.Mocked<IStepResolver>;

  beforeEach(async () => {
    mockJobRepository = { save: jest.fn(), findById: jest.fn(), findByEventId: jest.fn(), findByStatus: jest.fn() };
    mockPipelineExecutionRepository = { save: jest.fn(), findById: jest.fn(), findByJobId: jest.fn() };
    mockAuditLogWriter = { write: jest.fn() };
    mockMetricRecorder = { record: jest.fn(), findByJobId: jest.fn() };
    mockStepResolver = { resolveNextStep: jest.fn(), isLastStep: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        HandleStepCompletedUseCase,
        { provide: JOB_REPOSITORY, useValue: mockJobRepository },
        { provide: PIPELINE_EXECUTION_REPOSITORY, useValue: mockPipelineExecutionRepository },
        { provide: AUDIT_LOG_WRITER, useValue: mockAuditLogWriter },
        { provide: METRIC_RECORDER, useValue: mockMetricRecorder },
        { provide: STEP_RESOLVER, useValue: mockStepResolver },
      ],
    }).compile();

    useCase = module.get(HandleStepCompletedUseCase);
  });

  it('다음 단계가 있으면 현재 단계 완료 후 다음 CSC에 할당', async () => {
    const job = createAssignedJob();
    const execution = createExecutionWithInProgressFirst();
    const nextStep = execution.steps[1] as PipelineStep;

    mockJobRepository.findById.mockResolvedValue(job);
    mockPipelineExecutionRepository.findByJobId.mockResolvedValue(execution);
    mockStepResolver.resolveNextStep.mockReturnValue(nextStep);

    await useCase.execute(createProcessingCompletedEvent());

    expect(mockMetricRecorder.record).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-001', durationMs: 5000 }),
    );
    expect(mockJobRepository.save).toHaveBeenCalled();
    expect(mockPipelineExecutionRepository.save).toHaveBeenCalled();
    // 감사 로그는 파이프라인 완료 시에만 기록 → 다음 단계가 있으므로 호출 안 됨
    expect(mockAuditLogWriter.write).not.toHaveBeenCalled();
  });

  it('다음 단계가 없으면 파이프라인 완료 감사 로그 기록', async () => {
    const job = createAssignedJob();
    const execution = createExecutionWithInProgressFirst();

    mockJobRepository.findById.mockResolvedValue(job);
    mockPipelineExecutionRepository.findByJobId.mockResolvedValue(execution);
    mockStepResolver.resolveNextStep.mockReturnValue(null);

    await useCase.execute(createProcessingCompletedEvent());

    expect(mockAuditLogWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: AuditEventType.PIPELINE_COMPLETED }),
    );
  });

  it('processing_duration_ms가 없으면 메트릭 기록 생략', async () => {
    const job = createAssignedJob();
    const execution = createExecutionWithInProgressFirst();

    mockJobRepository.findById.mockResolvedValue(job);
    mockPipelineExecutionRepository.findByJobId.mockResolvedValue(execution);
    mockStepResolver.resolveNextStep.mockReturnValue(null);

    await useCase.execute(createProcessingCompletedEvent({ processing_duration_ms: undefined }));

    expect(mockMetricRecorder.record).not.toHaveBeenCalled();
  });

  it('Job이 없으면 에러', async () => {
    mockJobRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute(createProcessingCompletedEvent())).rejects.toThrow('Job not found');
  });

  it('PipelineExecution이 없으면 에러', async () => {
    mockJobRepository.findById.mockResolvedValue(createAssignedJob());
    mockPipelineExecutionRepository.findByJobId.mockResolvedValue(null);

    await expect(useCase.execute(createProcessingCompletedEvent())).rejects.toThrow(
      'Pipeline execution not found',
    );
  });
});
