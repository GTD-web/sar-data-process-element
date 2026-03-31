import { Injectable } from '@nestjs/common';
import type { TargetCsc } from '@sdpe/shared';
import { type IDelayDetector, DelayStatus, MONITORING_THRESHOLD } from '@sdpe/processing-monitor';

@Injectable()
export class DefaultDelayDetectorAdapter implements IDelayDetector {
  detectStepDelay(targetCsc: TargetCsc, elapsedSec: number): DelayStatus {
    const targetSec = MONITORING_THRESHOLD.STEP_TARGET_SEC[targetCsc];
    if (elapsedSec >= targetSec) return DelayStatus.CRITICAL;
    if (elapsedSec >= targetSec * MONITORING_THRESHOLD.WARNING_RATIO) return DelayStatus.WARNING;
    return DelayStatus.NORMAL;
  }

  detectPipelineDelay(totalElapsedSec: number): DelayStatus {
    if (totalElapsedSec >= MONITORING_THRESHOLD.TOTAL_PIPELINE_SEC) return DelayStatus.CRITICAL;
    if (totalElapsedSec >= MONITORING_THRESHOLD.TOTAL_PIPELINE_SEC * MONITORING_THRESHOLD.WARNING_RATIO) {
      return DelayStatus.WARNING;
    }
    return DelayStatus.NORMAL;
  }
}
