import type { TargetCsc } from '@sdpe/shared';
import type { DelayStatus } from '../type/delay-status.type';

export const DELAY_DETECTOR = Symbol('DELAY_DETECTOR');

/**
 * 처리 지연 감지 포트.
 * CSC별 목표 시간 또는 전체 파이프라인 상한(4시간)과 비교하여
 * NORMAL / WARNING(80%) / CRITICAL(100%) 상태를 반환한다.
 */
export interface IDelayDetector {
  detectStepDelay(targetCsc: TargetCsc, elapsedSec: number): DelayStatus;
  detectPipelineDelay(totalElapsedSec: number): DelayStatus;
}
