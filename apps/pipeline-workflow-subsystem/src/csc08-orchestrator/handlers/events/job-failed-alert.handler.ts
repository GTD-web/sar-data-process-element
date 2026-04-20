import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ALERT_DISPATCHER, type IAlertDispatcher, ALERT_CONDITION_EVALUATOR, type IAlertConditionEvaluator } from '@sdpe/alert';

export class JobFailedAlertEvent {
  constructor(
    public readonly jobId: string,
    public readonly retryCount: number,
  ) {}
}

@EventsHandler(JobFailedAlertEvent)
export class JobFailedAlertHandler implements IEventHandler<JobFailedAlertEvent> {
  private readonly logger = new Logger(JobFailedAlertHandler.name);

  constructor(
    @Inject(ALERT_DISPATCHER) private readonly alertDispatcher: IAlertDispatcher,
    @Inject(ALERT_CONDITION_EVALUATOR) private readonly alertConditionEvaluator: IAlertConditionEvaluator,
  ) {}

  async handle(event: JobFailedAlertEvent): Promise<void> {
    const payload = this.alertConditionEvaluator.evaluateRetryExhausted(event.jobId, event.retryCount);
    if (payload) {
      await this.alertDispatcher.dispatch(payload);
      this.logger.warn(`Alert dispatched for job: ${event.jobId}`);
    }
  }
}
