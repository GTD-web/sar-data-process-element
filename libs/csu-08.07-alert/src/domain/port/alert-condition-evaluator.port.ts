import type { AlertPayload } from '../type/alert-payload.type';

export const ALERT_CONDITION_EVALUATOR = Symbol('ALERT_CONDITION_EVALUATOR');

/**
 * Alert 발행 조건 평가 포트.
 * 조건 충족 시 AlertPayload를 반환하고, 미충족 시 null을 반환한다.
 */
export interface IAlertConditionEvaluator {
  /** 재시도 소진(3회 초과) 시 Alert 생성 */
  evaluateRetryExhausted(jobId: string, retryCount: number): AlertPayload | null;
  /** 파이프라인 지연(2시간 초과) 시 Alert 생성 */
  evaluatePipelineDelay(jobId: string, elapsedSec: number): AlertPayload | null;
}
