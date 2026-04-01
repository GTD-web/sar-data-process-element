import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ProcessingEvent, createJobId } from '@sdpe/shared';
import { JOB_REPOSITORY, type IJobRepository, STEP_RESOLVER, type IStepResolver } from '@sdpe/task-queue';
import { PIPELINE_EXECUTION_REPOSITORY, type IPipelineExecutionRepository } from '@sdpe/pipeline-scheduler';
import { AUDIT_LOG_WRITER, type IAuditLogWriter, AuditEventType } from '@sdpe/audit-log';
import { METRIC_RECORDER, type IMetricRecorder } from '@sdpe/processing-monitor';

@Injectable()
export class HandleStepCompletedUseCase {
  private readonly logger = new Logger(HandleStepCompletedUseCase.name);

  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobRepository: IJobRepository,
    @Inject(PIPELINE_EXECUTION_REPOSITORY)
    private readonly pipelineExecutionRepository: IPipelineExecutionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: IAuditLogWriter,
    @Inject(METRIC_RECORDER) private readonly metricRecorder: IMetricRecorder,
    @Inject(STEP_RESOLVER) private readonly stepResolver: IStepResolver,
  ) {}

  async execute(event: ProcessingEvent): Promise<void> {
    this.logger.log(`Step completed: job=${event.job_id}, csc=${event.source_csc}, level=${event.product_level}`);

    const jobId = createJobId(event.job_id);
    const job = await this.jobRepository.findById(jobId);
    if (!job) throw new Error(`Job not found: ${event.job_id}`);

    const execution = await this.pipelineExecutionRepository.findByJobId(event.job_id);
    if (!execution) throw new Error(`Pipeline execution not found for job: ${event.job_id}`);

    const currentStep = execution.currentStep;
    if (currentStep) {
      currentStep.complete();
    }
    job.complete();

    if (event.processing_duration_ms) {
      await this.metricRecorder.record({
        jobId: event.job_id,
        targetCsc: event.source_csc,
        durationMs: event.processing_duration_ms,
        timestamp: new Date(),
      });
    }

    const nextStep = this.stepResolver.resolveNextStep(execution);
    if (nextStep) {
      nextStep.start();
      job.resetForReprocessing();
      job.assign(nextStep.targetCsc, nextStep.productLevel);
      this.logger.log(`Next step assigned: csc=${nextStep.targetCsc}, level=${nextStep.productLevel}`);
    } else {
      this.logger.log(`Pipeline completed for job: ${event.job_id}`);
      await this.auditLogWriter.write({
        eventType: AuditEventType.PIPELINE_COMPLETED,
        timestamp: new Date(),
        actor: 'CSC-07',
        jobId: event.job_id,
        payload: { finalLevel: event.product_level },
      });
    }

    await this.jobRepository.save(job);
    await this.pipelineExecutionRepository.save(execution);
  }
}
