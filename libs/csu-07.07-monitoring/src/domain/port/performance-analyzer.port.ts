import type { ProcessingMetric } from '../type/processing-metric.type';

export interface PerformanceSummary {
  readonly totalDurationMs: number;
  readonly stepDurations: Record<string, number>;
  readonly bottleneckCsc: string | null;
}

export const PERFORMANCE_ANALYZER = Symbol('PERFORMANCE_ANALYZER');

export interface IPerformanceAnalyzer {
  analyze(metrics: ProcessingMetric[]): PerformanceSummary;
}
