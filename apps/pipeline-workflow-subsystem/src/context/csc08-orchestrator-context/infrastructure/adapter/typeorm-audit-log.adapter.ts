import { Injectable, Logger } from '@nestjs/common';
import type { IAuditLogWriter, IAuditLogReader, AuditEvent } from '@sdpe/audit-log';

@Injectable()
export class TypeOrmAuditLogAdapter implements IAuditLogWriter, IAuditLogReader {
  private readonly logger = new Logger(TypeOrmAuditLogAdapter.name);

  async write(event: AuditEvent): Promise<void> {
    this.logger.debug(`[STUB] Audit: ${event.eventType} job=${event.jobId ?? 'N/A'} actor=${event.actor}`);
  }

  async findByJobId(jobId: string): Promise<AuditEvent[]> {
    this.logger.debug(`[STUB] Finding audit logs for job: ${jobId}`);
    return [];
  }
}
