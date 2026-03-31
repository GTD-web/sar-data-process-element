import type { AlertPayload } from '../type/alert-payload.type';

export const ALERT_CONDITION_EVALUATOR = Symbol('ALERT_CONDITION_EVALUATOR');

export interface IAlertConditionEvaluator {
  evaluateRetryExhausted(jobId: string, retryCount: number): AlertPayload | null;
  evaluatePipelineDelay(jobId: string, elapsedSec: number): AlertPayload | null;
}
