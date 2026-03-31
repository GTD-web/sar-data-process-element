import type { TargetCsc } from '@sdpe/shared';
import type { DelayStatus } from '../type/delay-status.type';

export const DELAY_DETECTOR = Symbol('DELAY_DETECTOR');

export interface IDelayDetector {
  detectStepDelay(targetCsc: TargetCsc, elapsedSec: number): DelayStatus;
  detectPipelineDelay(totalElapsedSec: number): DelayStatus;
}
