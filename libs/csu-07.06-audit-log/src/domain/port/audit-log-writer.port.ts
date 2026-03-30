import type { AuditEvent } from '../type/audit-event.type';

export const AUDIT_LOG_WRITER = Symbol('AUDIT_LOG_WRITER');

export interface IAuditLogWriter {
  write(event: AuditEvent): Promise<void>;
}
