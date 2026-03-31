import type { AuditEvent } from '../type/audit-event.type';

export const AUDIT_LOG_READER = Symbol('AUDIT_LOG_READER');

export interface IAuditLogReader {
  findByJobId(jobId: string): Promise<AuditEvent[]>;
}
