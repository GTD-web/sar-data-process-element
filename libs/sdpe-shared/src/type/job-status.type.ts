/**
 * Job 상태. 상태 전이: CREATED → ASSIGNED → COMPLETED | FAILED
 * FAILED 상태에서 재시도 시 다시 ASSIGNED로 전환된다.
 */
export const JobStatus = {
  CREATED: 'CREATED',
  ASSIGNED: 'ASSIGNED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];
