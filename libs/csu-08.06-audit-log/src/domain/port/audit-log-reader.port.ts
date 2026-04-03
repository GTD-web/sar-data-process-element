import type { AuditEvent } from '../type/audit-event.type';

export const AUDIT_LOG_READER = Symbol('AUDIT_LOG_READER');

/** Job ID로 감사 로그 이력을 조회하는 포트 */
export interface IAuditLogReader {
  findByJobId(jobId: string): Promise<AuditEvent[]>;
}
