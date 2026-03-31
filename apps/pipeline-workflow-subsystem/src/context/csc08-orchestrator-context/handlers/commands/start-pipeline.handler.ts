import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { type RawDataReceivedEvent, Job, PipelineExecution, createJobId } from '@sdpe/shared';
import { JOB_REPOSITORY, type IJobRepository } from '@sdpe/task-queue';
import { DAG_BUILDER, type IDagBuilder, PIPELINE_EXECUTION_REPOSITORY, type IPipelineExecutionRepository } from '@sdpe/pipeline-scheduler';
import { PROFILE_SELECTOR, type IProfileSelector } from '@sdpe/processing-profile';
import { AUDIT_LOG_WRITER, type IAuditLogWriter, AuditEventType } from '@sdpe/audit-log';

export class StartPipelineCommand {
  constructor(public readonly event: RawDataReceivedEvent) {}
}

@CommandHandler(StartPipelineCommand)
export class StartPipelineHandler implements ICommandHandler<StartPipelineCommand> {
  private readonly logger = new Logger(StartPipelineHandler.name);

  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobRepository: IJobRepository,
    @Inject(PIPELINE_EXECUTION_REPOSITORY)
    private readonly pipelineExecutionRepository: IPipelineExecutionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: IAuditLogWriter,
    @Inject(DAG_BUILDER) private readonly dagBuilder: IDagBuilder,
    @Inject(PROFILE_SELECTOR) private readonly profileSelector: IProfileSelector,
  ) {}

  async execute(command: StartPipelineCommand): Promise<void> {
    const { event } = command;
    this.logger.log(`Starting pipeline for event: ${event.event_id}`);

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

    const steps = this.dagBuilder.buildFullDag();
    const execution = PipelineExecution.create(uuidv4(), jobId, steps);

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
      actor: 'CSC-07',
      jobId,
      payload: { eventId: event.event_id, profileId: profile.id },
    });

    this.logger.log(`Pipeline started: job=${jobId}, firstStep=${firstStep?.targetCsc}`);
  }
}
