/** Alert 유형. ICD 3.3절 모니터링 요건에서 정의 */
export const AlertType = {
  /** 재시도 3회 소진 */
  RETRY_EXHAUSTED: 'RETRY_EXHAUSTED',
  /** 파이프라인 처리 지연 (2시간 초과) */
  PIPELINE_DELAYED: 'PIPELINE_DELAYED',
  /** CPU/디스크 등 자원 임계값 초과 */
  RESOURCE_THRESHOLD: 'RESOURCE_THRESHOLD',
} as const;

export type AlertType = (typeof AlertType)[keyof typeof AlertType];
