import type { TargetCsc } from '@sdpe/shared';

/** SI-03 처리 완료 이벤트에서 추출한 CSC별 처리 성능 메트릭 */
export interface ProcessingMetric {
  readonly jobId: string;
  readonly targetCsc: TargetCsc;
  readonly durationMs: number;
  readonly timestamp: Date;
}
