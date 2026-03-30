import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import type { TargetCsc, ProductLevel } from '@sdpe/shared';
import { AUDIT_LOG_WRITER, type IAuditLogWriter, AuditEventType } from '@sdpe/audit-log';

export class StepCompletedAuditEvent {
  constructor(
    public readonly jobId: string,
    public readonly targetCsc: TargetCsc,
    public readonly productLevel: ProductLevel,
  ) {}
}

@EventsHandler(StepCompletedAuditEvent)
export class StepCompletedAuditHandler implements IEventHandler<StepCompletedAuditEvent> {
  private readonly logger = new Logger(StepCompletedAuditHandler.name);

  constructor(@Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: IAuditLogWriter) {}

  async handle(event: StepCompletedAuditEvent): Promise<void> {
    await this.auditLogWriter.write({
      eventType: AuditEventType.JOB_COMPLETED,
      timestamp: new Date(),
      actor: 'CSC-07',
      jobId: event.jobId,
      payload: { targetCsc: event.targetCsc, productLevel: event.productLevel },
    });
    this.logger.log(`Audit log written: step completed for job ${event.jobId}`);
  }
}
