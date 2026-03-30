import { Injectable } from '@nestjs/common';
import { type IPerformanceAnalyzer, type PerformanceSummary, type ProcessingMetric } from '@sdpe/monitoring';

@Injectable()
export class DefaultPerformanceAnalyzerAdapter implements IPerformanceAnalyzer {
  analyze(metrics: ProcessingMetric[]): PerformanceSummary {
    if (metrics.length === 0) {
      return { totalDurationMs: 0, stepDurations: {}, bottleneckCsc: null };
    }

    const stepDurations: Record<string, number> = {};
    let totalDurationMs = 0;
    let maxDuration = 0;
    let bottleneckCsc: string | null = null;

    for (const metric of metrics) {
      stepDurations[metric.targetCsc] = metric.durationMs;
      totalDurationMs += metric.durationMs;
      if (metric.durationMs > maxDuration) {
        maxDuration = metric.durationMs;
        bottleneckCsc = metric.targetCsc;
      }
    }

    return { totalDurationMs, stepDurations, bottleneckCsc };
  }
}
