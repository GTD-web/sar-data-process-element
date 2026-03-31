import type { TargetCsc } from '@sdpe/shared';

export interface ProcessingMetric {
  readonly jobId: string;
  readonly targetCsc: TargetCsc;
  readonly durationMs: number;
  readonly timestamp: Date;
}
