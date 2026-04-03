import { Inject, Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { type RawDataReceivedEvent, Job, PipelineExecution, createJobId, CscIdentifier } from '@sdpe/shared';
import { JOB_REPOSITORY, type IJobRepository } from '@sdpe/task-queue';
import {
  DAG_BUILDER,
  type IDagBuilder,
  PIPELINE_EXECUTION_REPOSITORY,
  type IPipelineExecutionRepository,
} from '@sdpe/pipeline-scheduler';
import { PROFILE_SELECTOR, type IProfileSelector } from '@sdpe/processing-profile';
import { AUDIT_LOG_WRITER, type IAuditLogWriter, AuditEventType } from '@sdpe/audit-log';

/**
 * SI-01 수신 이벤트(RawDataReceivedEvent)를 받아 새 파이프라인을 시작하는 유스케이스.
 *
 * 처리 흐름:
 *  1. 위성 ID + 촬영 모드로 처리 프로파일 선택
 *  2. Job 생성 및 전체 DAG(LEVEL_0 → LEVEL_3) 구성
 *  3. 첫 번째 단계(CSC-03)에 작업 할당
 *  4. 감사 로그 기록
 */
@Injectable()
export class StartPipelineUseCase {
  private readonly logger = new Logger(StartPipelineUseCase.name);

  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobRepository: IJobRepository,
    @Inject(PIPELINE_EXECUTION_REPOSITORY)
    private readonly pipelineExecutionRepository: IPipelineExecutionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: IAuditLogWriter,
    @Inject(DAG_BUILDER) private readonly dagBuilder: IDagBuilder,
    @Inject(PROFILE_SELECTOR) private readonly profileSelector: IProfileSelector,
  ) {}

  async execute(event: RawDataReceivedEvent): Promise<void> {
    this.logger.log(`Starting pipeline for event: ${event.event_id}`);

    // 위성 ID와 촬영 모드 조합으로 적절한 처리 프로파일을 결정
    const profile = await this.profileSelector.selectProfile(event.satellite_id, event.mode);

    const jobId = createJobId(uuidv4());
    const job = Job.create({
      id: jobId,
      eventId: event.event_id,
      rawDataPath: event.raw_data_path,
      processingProfileId: profile.id,
      satelliteId: event.satellite_id,
      mode: event.mode,
    });

    // 전체 파이프라인 DAG 생성: CSC-02 → CSC-03 → CSC-04 → CSC-05 → CSC-06
    const steps = this.dagBuilder.buildFullDag();
    const execution = PipelineExecution.create(uuidv4(), jobId, steps);

    // 첫 번째 대기 단계를 찾아 작업 시작
    const firstStep = execution.nextPendingStep;
    if (firstStep) {
      firstStep.start();
      job.assign(firstStep.targetCsc, firstStep.productLevel);
    }

    await this.jobRepository.save(job);
    await this.pipelineExecutionRepository.save(execution);

    await this.auditLogWriter.write({
      eventType: AuditEventType.PIPELINE_STARTED,
      timestamp: new Date(),
      actor: CscIdentifier.CSC_07,
      jobId,
      payload: { eventId: event.event_id, profileId: profile.id },
    });

    this.logger.log(`Pipeline started: job=${jobId}, firstStep=${firstStep?.targetCsc}`);
  }
}
