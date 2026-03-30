import { Injectable } from '@nestjs/common';
import { type IRetryEvaluator, type RetryDecision, RETRY_POLICY } from '@sdpe/retry-policy';

@Injectable()
export class DefaultRetryEvaluatorAdapter implements IRetryEvaluator {
  evaluate(retryCount: number): RetryDecision {
    if (retryCount < RETRY_POLICY.MAX_RETRY_COUNT) {
      return {
        shouldRetry: true,
        shouldAlert: false,
        reason: `Retry ${retryCount + 1}/${RETRY_POLICY.MAX_RETRY_COUNT}`,
      };
    }

    return {
      shouldRetry: false,
      shouldAlert: RETRY_POLICY.ALERT_ON_MAX_RETRY,
      reason: `Max retry count (${RETRY_POLICY.MAX_RETRY_COUNT}) reached.`,
    };
  }
}
