import type { AuditEvent } from '../type/audit-event.type';

export const AUDIT_LOG_WRITER = Symbol('AUDIT_LOG_WRITER');

/** 파이프라인 주요 이벤트(시작, 완료, 실패, 재시도 등)를 감사 로그로 기록하는 포트 */
export interface IAuditLogWriter {
  write(event: AuditEvent): Promise<void>;
}
