import { Test } from '@nestjs/testing';
import { ReprocessPipelineUseCase } from './reprocess-pipeline.use-case';
import { JOB_REPOSITORY, type IJobRepository } from '@sdpe/task-queue';
import { DAG_BUILDER, type IDagBuilder, PIPELINE_EXECUTION_REPOSITORY, type IPipelineExecutionRepository } from '@sdpe/pipeline-scheduler';
import { AUDIT_LOG_WRITER, type IAuditLogWriter, AuditEventType } from '@sdpe/audit-log';
import { Job, PipelineStep, ProductLevel, TargetCsc, CscIdentifier, createJobId, JobStatus, StepStatus } from '@sdpe/shared';
import type { ReprocessParams } from '../interfaces/csc08-orchestrator.interface';

function createFailedJob(): Job {
  const job = Job.create({
    id: createJobId('job-001'),
    eventId: 'evt-001',
    rawDataPath: '/data/raw/test.dat',
    processingProfileId: 'prof-1',
    satelliteId: 'SAT-1',
    mode: 'STRIPMAP',
  });
  job.assign(TargetCsc.CSC_04, ProductLevel.LEVEL_1);
  job.fail();
  return job;
}

describe('ReprocessPipelineUseCase', () => {
  let useCase: ReprocessPipelineUseCase;
  let mockJobRepository: jest.Mocked<IJobRepository>;
  let mockPipelineExecutionRepository: jest.Mocked<IPipelineExecutionRepository>;
  let mockAuditLogWriter: jest.Mocked<IAuditLogWriter>;
  let mockDagBuilder: jest.Mocked<IDagBuilder>;

  beforeEach(async () => {
    mockJobRepository = { save: jest.fn(), findById: jest.fn(), findByEventId: jest.fn(), findByStatus: jest.fn() };
    mockPipelineExecutionRepository = { save: jest.fn(), findById: jest.fn(), findByJobId: jest.fn() };
    mockAuditLogWriter = { write: jest.fn() };
    mockDagBuilder = { buildFullDag: jest.fn(), buildPartialDag: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ReprocessPipelineUseCase,
        { provide: JOB_REPOSITORY, useValue: mockJobRepository },
        { provide: PIPELINE_EXECUTION_REPOSITORY, useValue: mockPipelineExecutionRepository },
        { provide: AUDIT_LOG_WRITER, useValue: mockAuditLogWriter },
        { provide: DAG_BUILDER, useValue: mockDagBuilder },
      ],
    }).compile();

    useCase = module.get(ReprocessPipelineUseCase);
  });

  it('Job 리셋 → 부분 DAG 생성 → 첫 단계 할당 → 저장 → 감사 로그', async () => {
    const job = createFailedJob();
    mockJobRepository.findById.mockResolvedValue(job);

    // LEVEL_1 재처리: SKIPPED, SKIPPED, SKIPPED, PENDING(CSC-05), PENDING(CSC-06)
    const partialSteps = [
      new PipelineStep(1, TargetCsc.CSC_02, ProductLevel.LEVEL_0),
      new PipelineStep(2, TargetCsc.CSC_03, ProductLevel.LEVEL_0),
      new PipelineStep(3, TargetCsc.CSC_04, ProductLevel.LEVEL_1),
      new PipelineStep(4, TargetCsc.CSC_05, ProductLevel.LEVEL_2),
      new PipelineStep(5, TargetCsc.CSC_06, ProductLevel.LEVEL_3),
    ];
    partialSteps[0]!.skip();
    partialSteps[1]!.skip();
    partialSteps[2]!.skip();
    mockDagBuilder.buildPartialDag.mockReturnValue(partialSteps);

    const params: ReprocessParams = {
      jobId: 'job-001',
      targetLevel: ProductLevel.LEVEL_1,
      requestedBy: CscIdentifier.CSC_09,
    };

    await useCase.execute(params);

    expect(mockDagBuilder.buildPartialDag).toHaveBeenCalledWith(ProductLevel.LEVEL_1);

    // Job이 리셋 후 첫 PENDING 단계(CSC-05)에 할당
    const savedJob = mockJobRepository.save.mock.calls[0]![0];
    expect(savedJob.status).toBe(JobStatus.ASSIGNED);
    expect(savedJob.currentTargetCsc).toBe(TargetCsc.CSC_05);
    expect(savedJob.currentProductLevel).toBe(ProductLevel.LEVEL_2);
    expect(savedJob.retryCount).toBe(0);

    // PipelineExecution 저장
    expect(mockPipelineExecutionRepository.save).toHaveBeenCalledTimes(1);
    const savedExecution = mockPipelineExecutionRepository.save.mock.calls[0]![0];
    expect(savedExecution.steps[0]!.status).toBe(StepStatus.SKIPPED);
    expect(savedExecution.steps[3]!.status).toBe(StepStatus.IN_PROGRESS);

    // PIPELINE_REPROCESSED 감사 로그
    expect(mockAuditLogWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.PIPELINE_REPROCESSED,
        actor: CscIdentifier.CSC_09,
      }),
    );
  });

  it('Job이 없으면 에러', async () => {
    mockJobRepository.findById.mockResolvedValue(null);

    const params: ReprocessParams = {
      jobId: 'job-999',
      targetLevel: ProductLevel.LEVEL_1,
      requestedBy: CscIdentifier.CSC_09,
    };

    await expect(useCase.execute(params)).rejects.toThrow('Job not found');
  });
});
