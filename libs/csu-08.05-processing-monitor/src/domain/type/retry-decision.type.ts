/** RetryEvaluator의 판단 결과 */
export interface RetryDecision {
  /** 재시도 가능 여부 (retryCount < MAX_RETRY_COUNT) */
  readonly shouldRetry: boolean;
  /** 재시도 소진 시 Alert 발행 여부 */
  readonly shouldAlert: boolean;
  readonly reason: string;
}
