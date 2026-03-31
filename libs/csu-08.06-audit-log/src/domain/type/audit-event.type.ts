import type { AuditEventType } from './audit-event-type.type';

export interface AuditEvent {
  readonly eventType: AuditEventType;
  readonly timestamp: Date;
  readonly actor: string;
  readonly jobId?: string;
  readonly payload: Record<string, unknown>;
}
