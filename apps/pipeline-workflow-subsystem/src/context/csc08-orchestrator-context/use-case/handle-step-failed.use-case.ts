import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ProcessingEvent, createJobId, CscIdentifier } from '@sdpe/shared';
import { JOB_REPOSITORY, type IJobRepository } from '@sdpe/task-queue';
import { PIPELINE_EXECUTION_REPOSITORY, type IPipelineExecutionRepository } from '@sdpe/pipeline-scheduler';
import { RETRY_EVALUATOR, type IRetryEvaluator } from '@sdpe/processing-monitor';
import {
  ALERT_CONDITION_EVALUATOR,
  type IAlertConditionEvaluator,
  ALERT_DISPATCHER,
  type IAlertDispatcher,
} from '@sdpe/alert';
import { AUDIT_LOG_WRITER, type IAuditLogWriter, AuditEventType } from '@sdpe/audit-log';

@Injectable()
export class HandleStepFailedUseCase {
  private readonly logger = new Logger(HandleStepFailedUseCase.name);

  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobRepository: IJobRepository,
    @Inject(PIPELINE_EXECUTION_REPOSITORY)
    private readonly pipelineExecutionRepository: IPipelineExecutionRepository,
    @Inject(ALERT_DISPATCHER) private readonly alertDispatcher: IAlertDispatcher,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: IAuditLogWriter,
    @Inject(RETRY_EVALUATOR) private readonly retryEvaluator: IRetryEvaluator,
    @Inject(ALERT_CONDITION_EVALUATOR) private readonly alertConditionEvaluator: IAlertConditionEvaluator,
  ) {}

  async execute(event: ProcessingEvent): Promise<void> {
    this.logger.warn(`Step failed: job=${event.job_id}, csc=${event.source_csc}, retry=${event.retry_count}`);

    const jobId = createJobId(event.job_id);
    const job = await this.jobRepository.findById(jobId);
    if (!job) throw new Error(`Job not found: ${event.job_id}`);

    const execution = await this.pipelineExecutionRepository.findByJobId(event.job_id);
    if (!execution) throw new Error(`Pipeline execution not found for job: ${event.job_id}`);

    const currentStep = execution.currentStep;
    if (currentStep) {
      currentStep.fail();
    }
    job.fail();

    const decision = this.retryEvaluator.evaluate(job.retryCount);

    if (decision.shouldRetry) {
      this.logger.log(`Retrying job: ${event.job_id} (${decision.reason})`);
      job.assign(event.source_csc, event.product_level);

      await this.auditLogWriter.write({
        eventType: AuditEventType.JOB_RETRIED,
        timestamp: new Date(),
        actor: CscIdentifier.CSC_07,
        jobId: event.job_id,
        payload: { retryCount: job.retryCount, reason: decision.reason },
      });
    } else {
      this.logger.error(`Job permanently failed: ${event.job_id} (${decision.reason})`);

      if (decision.shouldAlert) {
        const alertPayload = this.alertConditionEvaluator.evaluateRetryExhausted(event.job_id, job.retryCount);
        if (alertPayload) {
          await this.alertDispatcher.dispatch(alertPayload);
          await this.auditLogWriter.write({
            eventType: AuditEventType.ALERT_DISPATCHED,
            timestamp: new Date(),
            actor: CscIdentifier.CSC_07,
            jobId: event.job_id,
            payload: { alertType: alertPayload.alertType },
          });
        }
      }

      await this.auditLogWriter.write({
        eventType: AuditEventType.JOB_FAILED,
        timestamp: new Date(),
        actor: CscIdentifier.CSC_07,
        jobId: event.job_id,
        payload: { retryCount: job.retryCount, errorCode: event.error_code },
      });
    }

    await this.jobRepository.save(job);
    await this.pipelineExecutionRepository.save(execution);
  }
}
