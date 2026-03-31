import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { IRetryEvaluator } from './domain/port/retry-evaluator.port';
import { RETRY_EVALUATOR } from './domain/port/retry-evaluator.port';
import type { IMetricRecorder } from './domain/port/metric-recorder.port';
import { METRIC_RECORDER } from './domain/port/metric-recorder.port';
import type { IDelayDetector } from './domain/port/delay-detector.port';
import { DELAY_DETECTOR } from './domain/port/delay-detector.port';

export interface SdpeProcessingMonitorModuleOptions {
  retryEvaluator: Type<IRetryEvaluator>;
  metricRecorder: Type<IMetricRecorder>;
  delayDetector: Type<IDelayDetector>;
}

@Module({})
export class SdpeProcessingMonitorModule {
  static forRoot(options: SdpeProcessingMonitorModuleOptions): DynamicModule {
    return {
      module: SdpeProcessingMonitorModule,
      providers: [
        { provide: RETRY_EVALUATOR, useClass: options.retryEvaluator },
        { provide: METRIC_RECORDER, useClass: options.metricRecorder },
        { provide: DELAY_DETECTOR, useClass: options.delayDetector },
      ],
      exports: [RETRY_EVALUATOR, METRIC_RECORDER, DELAY_DETECTOR],
    };
  }
}
