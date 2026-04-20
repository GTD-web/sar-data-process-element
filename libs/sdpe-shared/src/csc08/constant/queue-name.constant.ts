/**
 * PGMQ 큐 이름 — 확정 (ICD 6.6).
 * CSC-08이 구독/발행하는 모든 큐의 이름을 정의한다.
 * 큐명 규칙: sdpe.{영역}.{목적}
 */
export const QueueName = {
  /** SI-01: CSC-02가 원시 데이터 수신 완료 후 발행 */
  RECEPTION_EVENTS: 'sdpe.reception.events',
  /** SI-03: CSC-02~06이 처리 완료/실패 시 발행 */
  PROCESSING_EVENTS: 'sdpe.processing.events',
  /** SI-04: CSC별 작업 할당 큐 */
  JOBS_CSC02: 'sdpe.jobs.csc02',
  JOBS_CSC03: 'sdpe.jobs.csc03',
  JOBS_CSC04: 'sdpe.jobs.csc04',
  JOBS_CSC05: 'sdpe.jobs.csc05',
  JOBS_CSC06: 'sdpe.jobs.csc06',
  /** SI-05: Level-1 이상 제품 등록 트리거 */
  CATALOG_REGISTRATION: 'sdpe.catalog.registration',
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];
