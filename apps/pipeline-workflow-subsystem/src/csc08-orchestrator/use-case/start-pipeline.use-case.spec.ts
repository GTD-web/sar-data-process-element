import { Test } from '@nestjs/testing';
import { StartPipelineUseCase } from './start-pipeline.use-case';
import { JOB_REPOSITORY, type IJobRepository } from '@sdpe/task-queue';
import { DAG_BUILDER, type IDagBuilder, PIPELINE_EXECUTION_REPOSITORY, type IPipelineExecutionRepository } from '@sdpe/pipeline-scheduler';
import { PROFILE_SELECTOR, type IProfileSelector } from '@sdpe/processing-profile';
import { AUDIT_LOG_WRITER, type IAuditLogWriter } from '@sdpe/audit-log';
import { type RawDataReceivedEvent, PipelineStep, ProductLevel, TargetCsc, ProcessingProfile, JobStatus, StepStatus } from '@sdpe/shared';

function createRawDataEvent(overrides?: Partial<RawDataReceivedEvent>): RawDataReceivedEvent {
  return {
    schema_version: '1.0',
    event_id: 'evt-001',
    event_type: 'RAW_DATA_RECEIVED',
    acquisition_start: '2026-01-01T00:00:00Z',
    acquisition_end: '2026-01-01T00:01:00Z',
    raw_data_path: '/nas/raw/scene001.dat',
    file_size_bytes: 500_000_000,
    checksum_sha256: 'abc123',
    satellite_id: 'SAT-1',
    mode: 'STRIPMAP',
    polarization: ['HH', 'VV'],
    center_frequency_hz: 5_405_000_000,
    prf_hz: 1_700,
    ...overrides,
  };
}

describe('StartPipelineUseCase', () => {
  let useCase: StartPipelineUseCase;
  let mockJobRepository: jest.Mocked<IJobRepository>;
  let mockPipelineExecutionRepository: jest.Mocked<IPipelineExecutionRepository>;
  let mockAuditLogWriter: jest.Mocked<IAuditLogWriter>;
  let mockDagBuilder: jest.Mocked<IDagBuilder>;
  let mockProfileSelector: jest.Mocked<IProfileSelector>;

  beforeEach(async () => {
    mockJobRepository = { save: jest.fn(), findById: jest.fn(), findByEventId: jest.fn(), findByStatus: jest.fn() };
    mockPipelineExecutionRepository = { save: jest.fn(), findById: jest.fn(), findByJobId: jest.fn() };
    mockAuditLogWriter = { write: jest.fn() };
    mockDagBuilder = { buildFullDag: jest.fn(), buildPartialDag: jest.fn() };
    mockProfileSelector = { selectProfile: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        StartPipelineUseCase,
        { provide: JOB_REPOSITORY, useValue: mockJobRepository },
        { provide: PIPELINE_EXECUTION_REPOSITORY, useValue: mockPipelineExecutionRepository },
        { provide: AUDIT_LOG_WRITER, useValue: mockAuditLogWriter },
        { provide: DAG_BUILDER, useValue: mockDagBuilder },
        { provide: PROFILE_SELECTOR, useValue: mockProfileSelector },
      ],
    }).compile();

    useCase = module.get(StartPipelineUseCase);
  });

  it('프로파일 선택 → Job 생성 → DAG 구성 → 첫 단계 할당 → 저장 → 감사 로그', async () => {
    const profile = new ProcessingProfile('prof-1', 'SAT-1', 'STRIPMAP', ['HH'], 'test');
    mockProfileSelector.selectProfile.mockResolvedValue(profile);

    const steps = [
      new PipelineStep(1, TargetCsc.CSC_02, ProductLevel.LEVEL_0),
      new PipelineStep(2, TargetCsc.CSC_03, ProductLevel.LEVEL_0),
    ];
    mockDagBuilder.buildFullDag.mockReturnValue(steps);

    await useCase.execute(createRawDataEvent());

    expect(mockProfileSelector.selectProfile).toHaveBeenCalledWith('SAT-1', 'STRIPMAP');
    expect(mockDagBuilder.buildFullDag).toHaveBeenCalled();

    // Job이 저장되었는지 검증
    expect(mockJobRepository.save).toHaveBeenCalledTimes(1);
    const savedJob = mockJobRepository.save.mock.calls[0]![0];
    expect(savedJob.status).toBe(JobStatus.ASSIGNED);
    expect(savedJob.currentTargetCsc).toBe(TargetCsc.CSC_02);
    expect(savedJob.currentProductLevel).toBe(ProductLevel.LEVEL_0);

    // PipelineExecution이 저장되었는지 검증
    expect(mockPipelineExecutionRepository.save).toHaveBeenCalledTimes(1);
    const savedExecution = mockPipelineExecutionRepository.save.mock.calls[0]![0];
    expect(savedExecution.steps[0]!.status).toBe(StepStatus.IN_PROGRESS);
    expect(savedExecution.steps[1]!.status).toBe(StepStatus.PENDING);

    // 감사 로그 기록 검증
    expect(mockAuditLogWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'PIPELINE_STARTED' }),
    );
  });

  it('프로파일 선택 실패 시 에러 전파', async () => {
    mockProfileSelector.selectProfile.mockRejectedValue(new Error('No profile'));

    await expect(useCase.execute(createRawDataEvent())).rejects.toThrow('No profile');
    expect(mockJobRepository.save).not.toHaveBeenCalled();
  });
});
