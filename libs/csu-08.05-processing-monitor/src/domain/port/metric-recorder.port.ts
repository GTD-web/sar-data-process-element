import type { ProcessingMetric } from '../type/processing-metric.type';

export const METRIC_RECORDER = Symbol('METRIC_RECORDER');

/** 각 CSC의 처리 소요 시간 등 성능 메트릭을 기록/조회하는 포트 */
export interface IMetricRecorder {
  record(metric: ProcessingMetric): Promise<void>;
  findByJobId(jobId: string): Promise<ProcessingMetric[]>;
}
