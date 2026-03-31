/** 모니터링 임계값 (ICD 3.3절, 시스템 설계서 13.2) */
export const ALERT_THRESHOLD = {
  /** 처리 파이프라인 지연 — 2시간(7,200초) 이상 */
  PIPELINE_DELAY_SEC: 7_200,
  /** CPU 사용률 상한 */
  CPU_PERCENT: 90,
  /** 디스크 사용률 상한 */
  DISK_PERCENT: 85,
  /** API 오류율 상한 */
  API_ERROR_RATE_PERCENT: 5,
} as const;
