import type { ProcessingMetric } from '../type/processing-metric.type';

export const METRIC_RECORDER = Symbol('METRIC_RECORDER');

export interface IMetricRecorder {
  record(metric: ProcessingMetric): Promise<void>;
  findByJobId(jobId: string): Promise<ProcessingMetric[]>;
}
