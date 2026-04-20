import type { AuditEventType } from './audit-event-type.type';
import type { CscIdentifier } from '@sdpe/shared';

/** 감사 로그 이벤트. actor는 이벤트를 발생시킨 CSC, payload는 이벤트별 상세 정보 */
export interface AuditEvent {
  readonly eventType: AuditEventType;
  readonly timestamp: Date;
  readonly actor: CscIdentifier;
  readonly jobId?: string;
  readonly payload: Record<string, unknown>;
}
