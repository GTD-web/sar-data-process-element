import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { IMetricRecorder } from './domain/port/metric-recorder.port';
import { METRIC_RECORDER } from './domain/port/metric-recorder.port';
import type { IDelayDetector } from './domain/port/delay-detector.port';
import { DELAY_DETECTOR } from './domain/port/delay-detector.port';
import type { IPerformanceAnalyzer } from './domain/port/performance-analyzer.port';
import { PERFORMANCE_ANALYZER } from './domain/port/performance-analyzer.port';

export interface SdpeMonitoringModuleOptions {
  metricRecorder: Type<IMetricRecorder>;
  delayDetector: Type<IDelayDetector>;
  performanceAnalyzer: Type<IPerformanceAnalyzer>;
}

@Module({})
export class SdpeMonitoringModule {
  static forRoot(options: SdpeMonitoringModuleOptions): DynamicModule {
    return {
      module: SdpeMonitoringModule,
      providers: [
        { provide: METRIC_RECORDER, useClass: options.metricRecorder },
        { provide: DELAY_DETECTOR, useClass: options.delayDetector },
        { provide: PERFORMANCE_ANALYZER, useClass: options.performanceAnalyzer },
      ],
      exports: [METRIC_RECORDER, DELAY_DETECTOR, PERFORMANCE_ANALYZER],
    };
  }
}
