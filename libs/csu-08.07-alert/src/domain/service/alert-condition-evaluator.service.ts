import { Injectable } from '@nestjs/common';
import type { IAlertConditionEvaluator } from '../port/alert-condition-evaluator.port';
import type { AlertPayload } from '../type/alert-payload.type';
import { AlertType } from '../type/alert-type.type';
import { ALERT_THRESHOLD } from '../constant/alert-threshold.constant';

@Injectable()
export class AlertConditionEvaluatorService implements IAlertConditionEvaluator {
  evaluateRetryExhausted(jobId: string, retryCount: number): AlertPayload | null {
    if (retryCount < 3) return null;
    return {
      alertType: AlertType.RETRY_EXHAUSTED,
      jobId,
      message: `Job ${jobId} failed after ${retryCount} retries.`,
      details: { retryCount },
      timestamp: new Date(),
    };
  }

  evaluatePipelineDelay(jobId: string, elapsedSec: number): AlertPayload | null {
    if (elapsedSec < ALERT_THRESHOLD.PIPELINE_DELAY_SEC) return null;
    return {
      alertType: AlertType.PIPELINE_DELAYED,
      jobId,
      message: `Job ${jobId} delayed: ${elapsedSec}s elapsed (threshold: ${ALERT_THRESHOLD.PIPELINE_DELAY_SEC}s).`,
      details: { elapsedSec, thresholdSec: ALERT_THRESHOLD.PIPELINE_DELAY_SEC },
      timestamp: new Date(),
    };
  }
}
