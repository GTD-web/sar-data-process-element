export interface RetryDecision {
  readonly shouldRetry: boolean;
  readonly shouldAlert: boolean;
  readonly reason: string;
}
