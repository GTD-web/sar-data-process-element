import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { IRetryEvaluator } from './domain/port/retry-evaluator.port';
import { RETRY_EVALUATOR } from './domain/port/retry-evaluator.port';

export interface SdpeRetryPolicyModuleOptions {
  retryEvaluator: Type<IRetryEvaluator>;
}

@Module({})
export class SdpeRetryPolicyModule {
  static forRoot(options: SdpeRetryPolicyModuleOptions): DynamicModule {
    return {
      module: SdpeRetryPolicyModule,
      providers: [{ provide: RETRY_EVALUATOR, useClass: options.retryEvaluator }],
      exports: [RETRY_EVALUATOR],
    };
  }
}
