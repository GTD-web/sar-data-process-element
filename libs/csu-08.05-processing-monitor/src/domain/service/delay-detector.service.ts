import { Injectable } from '@nestjs/common';
import type { TargetCsc } from '@sdpe/shared';
import type { IDelayDetector } from '../port/delay-detector.port';
import { DelayStatus } from '../type/delay-status.type';
import { MONITORING_THRESHOLD } from '../constant/monitoring-threshold.constant';

/** MONITORING_THRESHOLD 상수 기반으로 지연 여부를 판단한다 */
@Injectable()
export class DelayDetectorService implements IDelayDetector {
  /** 개별 CSC 단계의 지연 상태 판단 */
  detectStepDelay(targetCsc: TargetCsc, elapsedSec: number): DelayStatus {
    const targetSec = MONITORING_THRESHOLD.STEP_TARGET_SEC[targetCsc];
    if (elapsedSec >= targetSec) return DelayStatus.CRITICAL;
    if (elapsedSec >= targetSec * MONITORING_THRESHOLD.WARNING_RATIO) return DelayStatus.WARNING;
    return DelayStatus.NORMAL;
  }

  /** 전체 파이프라인 상한(4시간) 대비 지연 상태 판단 */
  detectPipelineDelay(totalElapsedSec: number): DelayStatus {
    if (totalElapsedSec >= MONITORING_THRESHOLD.TOTAL_PIPELINE_SEC) return DelayStatus.CRITICAL;
    if (totalElapsedSec >= MONITORING_THRESHOLD.TOTAL_PIPELINE_SEC * MONITORING_THRESHOLD.WARNING_RATIO) {
      return DelayStatus.WARNING;
    }
    return DelayStatus.NORMAL;
  }
}
