import type { RetryDecision } from '../type/retry-decision.type';

export const RETRY_EVALUATOR = Symbol('RETRY_EVALUATOR');

export interface IRetryEvaluator {
  evaluate(retryCount: number): RetryDecision;
}
