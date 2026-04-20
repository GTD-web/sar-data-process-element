import type { ProcessingMetric } from '@sdpe/processing-monitor';

/** 파이프라인 성능 분석 결과. 어떤 CSC가 병목인지 식별하는 데 사용 */
export interface PerformanceSummary {
  readonly totalDurationMs: number;
  /** CSC별 처리 소요 시간 (ms) */
  readonly stepDurations: Record<string, number>;
  /** 가장 오래 걸린 CSC. 성능 최적화 우선순위 판단에 활용 */
  readonly bottleneckCsc: string | null;
}

export const PERFORMANCE_ANALYZER = Symbol('PERFORMANCE_ANALYZER');

/** 파이프라인 처리 메트릭을 집계하여 병목 구간을 식별하는 포트 */
export interface IPerformanceAnalyzer {
  analyze(metrics: ProcessingMetric[]): PerformanceSummary;
}
