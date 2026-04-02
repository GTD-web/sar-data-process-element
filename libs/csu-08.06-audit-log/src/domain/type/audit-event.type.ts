import type { AuditEventType } from './audit-event-type.type';
import type { CscIdentifier } from '@sdpe/shared';

export interface AuditEvent {
  readonly eventType: AuditEventType;
  readonly timestamp: Date;
  readonly actor: CscIdentifier;
  readonly jobId?: string;
  readonly payload: Record<string, unknown>;
}
