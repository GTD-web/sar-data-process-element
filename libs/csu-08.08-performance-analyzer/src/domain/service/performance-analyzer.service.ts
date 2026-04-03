import { Injectable } from '@nestjs/common';
import type { IPerformanceAnalyzer, PerformanceSummary } from '../port/performance-analyzer.port';
import type { ProcessingMetric } from '@sdpe/processing-monitor';

/** CSC별 처리 시간을 합산하고, 가장 오래 걸린 CSC를 bottleneck으로 식별한다 */
@Injectable()
export class PerformanceAnalyzerService implements IPerformanceAnalyzer {
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
