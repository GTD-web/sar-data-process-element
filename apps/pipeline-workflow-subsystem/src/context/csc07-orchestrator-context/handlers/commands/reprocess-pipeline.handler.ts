import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PipelineExecution, createJobId } from '@sdpe/shared';
import { JOB_REPOSITORY, type IJobRepository } from '@sdpe/job';
import { DAG_BUILDER, type IDagBuilder, PIPELINE_EXECUTION_REPOSITORY, type IPipelineExecutionRepository } from '@sdpe/pipeline';
import { AUDIT_LOG_WRITER, type IAuditLogWriter, AuditEventType } from '@sdpe/audit-log';
import type { ReprocessParams } from '../../interfaces/csc07-orchestrator-context.interface';

export class ReprocessPipelineCommand {
  constructor(public readonly params: ReprocessParams) {}
}

@CommandHandler(ReprocessPipelineCommand)
export class ReprocessPipelineHandler implements ICommandHandler<ReprocessPipelineCommand> {
  private readonly logger = new Logger(ReprocessPipelineHandler.name);

  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobRepository: IJobRepository,
    @Inject(PIPELINE_EXECUTION_REPOSITORY)
    private readonly pipelineExecutionRepository: IPipelineExecutionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: IAuditLogWriter,
    @Inject(DAG_BUILDER) private readonly dagBuilder: IDagBuilder,
  ) {}

  async execute(command: ReprocessPipelineCommand): Promise<void> {
    const { params } = command;
    this.logger.log(`Reprocessing pipeline: job=${params.jobId}, targetLevel=${params.targetLevel}`);

    const jobId = createJobId(params.jobId);
    const job = await this.jobRepository.findById(jobId);
    if (!job) throw new Error(`Job not found: ${params.jobId}`);

    job.resetForReprocessing();

    const steps = this.dagBuilder.buildPartialDag(params.targetLevel);
    const execution = PipelineExecution.create(uuidv4(), params.jobId, steps);

    const firstStep = execution.nextPendingStep;
    if (firstStep) {
      firstStep.start();
      job.assign(firstStep.targetCsc, firstStep.productLevel);
    }

    await this.jobRepository.save(job);
    await this.pipelineExecutionRepository.save(execution);

    await this.auditLogWriter.write({
      eventType: AuditEventType.PIPELINE_REPROCESSED,
      timestamp: new Date(),
      actor: params.requestedBy,
      jobId: params.jobId,
      payload: { targetLevel: params.targetLevel },
    });

    this.logger.log(`Reprocessing started: job=${params.jobId}, firstStep=${firstStep?.targetCsc}`);
  }
}
