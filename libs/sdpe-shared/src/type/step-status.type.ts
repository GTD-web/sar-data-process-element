/**
 * 파이프라인 단계 상태.
 * SKIPPED는 부분 재처리(SI-07) 시 건너뛰는 이전 단계에 적용된다.
 */
export const StepStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;

export type StepStatus = (typeof StepStatus)[keyof typeof StepStatus];
