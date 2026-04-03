import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { IPerformanceAnalyzer } from './domain/port/performance-analyzer.port';
import { PERFORMANCE_ANALYZER } from './domain/port/performance-analyzer.port';

/**
 * CSU-08.08 성능 분석 모듈.
 * 파이프라인 처리 메트릭을 집계하여 병목 CSC를 식별한다.
 */
export interface SdpePerformanceAnalyzerModuleOptions {
  performanceAnalyzer: Type<IPerformanceAnalyzer>;
}

@Module({})
export class SdpePerformanceAnalyzerModule {
  static forRoot(options: SdpePerformanceAnalyzerModuleOptions): DynamicModule {
    return {
      module: SdpePerformanceAnalyzerModule,
      providers: [{ provide: PERFORMANCE_ANALYZER, useClass: options.performanceAnalyzer }],
      exports: [PERFORMANCE_ANALYZER],
    };
  }
}
