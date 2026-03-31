import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { IPerformanceAnalyzer } from './domain/port/performance-analyzer.port';
import { PERFORMANCE_ANALYZER } from './domain/port/performance-analyzer.port';

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
