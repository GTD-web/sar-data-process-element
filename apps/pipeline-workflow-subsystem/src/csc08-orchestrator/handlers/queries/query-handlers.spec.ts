import { Test } from '@nestjs/testing';
import { GetJobStatusQuery, GetJobStatusHandler } from './get-job-status.handler';
import { GetPipelineExecutionQuery, GetPipelineExecutionHandler } from './get-pipeline-execution.handler';
import { JOB_REPOSITORY, type IJobRepository } from '@sdpe/task-queue';
import { PIPELINE_EXECUTION_REPOSITORY, type IPipelineExecutionRepository } from '@sdpe/pipeline-scheduler';
import { Job, PipelineExecution, PipelineStep, ProductLevel, TargetCsc, createJobId, StepStatus } from '@sdpe/shared';

describe('Query Handlers', () => {
  describe('GetJobStatusHandler', () => {
    let handler: GetJobStatusHandler;
    let mockJobRepository: jest.Mocked<IJobRepository>;

    beforeEach(async () => {
      mockJobRepository = { save: jest.fn(), findById: jest.fn(), findByEventId: jest.fn(), findByStatus: jest.fn() };

      const module = await Test.createTestingModule({
        providers: [GetJobStatusHandler, { provide: JOB_REPOSITORY, useValue: mockJobRepository }],
      }).compile();

      handler = module.get(GetJobStatusHandler);
    });

    it('Job이 있으면 상태 정보 반환', async () => {
      const job = Job.create({
        id: createJobId('job-001'),
        eventId: 'evt-001',
        rawDataPath: '/data/raw/test.dat',
        processingProfileId: 'prof-1',
        satelliteId: 'SAT-1',
        mode: 'STRIPMAP',
      });
      job.assign(TargetCsc.CSC_03, ProductLevel.LEVEL_0);
      mockJobRepository.findById.mockResolvedValue(job);

      const result = await handler.execute(new GetJobStatusQuery('job-001'));

      expect(result).toEqual({
        jobId: 'job-001',
        status: 'ASSIGNED',
        retryCount: 0,
        currentTargetCsc: TargetCsc.CSC_03,
        currentProductLevel: ProductLevel.LEVEL_0,
      });
    });

    it('Job이 없으면 null 반환', async () => {
      mockJobRepository.findById.mockResolvedValue(null);

      const result = await handler.execute(new GetJobStatusQuery('non-existent'));

      expect(result).toBeNull();
    });
  });

  describe('GetPipelineExecutionHandler', () => {
    let handler: GetPipelineExecutionHandler;
    let mockPipelineExecutionRepository: jest.Mocked<IPipelineExecutionRepository>;

    beforeEach(async () => {
      mockPipelineExecutionRepository = { save: jest.fn(), findById: jest.fn(), findByJobId: jest.fn() };

      const module = await Test.createTestingModule({
        providers: [
          GetPipelineExecutionHandler,
          { provide: PIPELINE_EXECUTION_REPOSITORY, useValue: mockPipelineExecutionRepository },
        ],
      }).compile();

      handler = module.get(GetPipelineExecutionHandler);
    });

    it('실행 이력이 있으면 단계별 상태 포함하여 반환', async () => {
      const steps = [
        new PipelineStep(1, TargetCsc.CSC_02, ProductLevel.LEVEL_0),
        new PipelineStep(2, TargetCsc.CSC_03, ProductLevel.LEVEL_0),
      ];
      steps[0]!.start();
      steps[0]!.complete();
      const execution = PipelineExecution.create('exec-1', 'job-001', steps);
      mockPipelineExecutionRepository.findById.mockResolvedValue(execution);

      const result = await handler.execute(new GetPipelineExecutionQuery('exec-1'));

      expect(result).toEqual({
        executionId: 'exec-1',
        jobId: 'job-001',
        steps: [
          { order: 1, targetCsc: TargetCsc.CSC_02, productLevel: ProductLevel.LEVEL_0, status: StepStatus.COMPLETED },
          { order: 2, targetCsc: TargetCsc.CSC_03, productLevel: ProductLevel.LEVEL_0, status: StepStatus.PENDING },
        ],
        isCompleted: false,
      });
    });

    it('실행 이력이 없으면 null 반환', async () => {
      mockPipelineExecutionRepository.findById.mockResolvedValue(null);

      const result = await handler.execute(new GetPipelineExecutionQuery('non-existent'));

      expect(result).toBeNull();
    });
  });
});
