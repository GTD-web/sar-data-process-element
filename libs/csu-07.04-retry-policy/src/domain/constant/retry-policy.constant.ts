/** 재시도 정책 — 확정 (ICD 3.2, 시스템 설계서 2.2) */
export const RETRY_POLICY = {
  /** 최대 자동 재시도 횟수. 시스템 설계서 2.2 '자동 재시도 3회' */
  MAX_RETRY_COUNT: 3,
  /** retry_count == MAX_RETRY_COUNT 도달 시 Alert 발행 */
  ALERT_ON_MAX_RETRY: true,
} as const;
