import type { RetryDecision } from '../type/retry-decision.type';

export const RETRY_EVALUATOR = Symbol('RETRY_EVALUATOR');

/**
 * 재시도 판단 포트.
 * 현재 재시도 횟수를 기반으로 재시도 여부와 Alert 발행 여부를 결정한다.
 * 정책: ICD 3.5, 시스템 설계서 2.2 (최대 3회 자동 재시도)
 */
export interface IRetryEvaluator {
  evaluate(retryCount: number): RetryDecision;
}
