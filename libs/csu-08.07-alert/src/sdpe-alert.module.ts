import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { IAlertDispatcher } from './domain/port/alert-dispatcher.port';
import { ALERT_DISPATCHER } from './domain/port/alert-dispatcher.port';
import type { IAlertConditionEvaluator } from './domain/port/alert-condition-evaluator.port';
import { ALERT_CONDITION_EVALUATOR } from './domain/port/alert-condition-evaluator.port';

export interface SdpeAlertModuleOptions {
  alertDispatcher: Type<IAlertDispatcher>;
  alertConditionEvaluator: Type<IAlertConditionEvaluator>;
}

@Module({})
export class SdpeAlertModule {
  static forRoot(options: SdpeAlertModuleOptions): DynamicModule {
    return {
      module: SdpeAlertModule,
      providers: [
        { provide: ALERT_DISPATCHER, useClass: options.alertDispatcher },
        { provide: ALERT_CONDITION_EVALUATOR, useClass: options.alertConditionEvaluator },
      ],
      exports: [ALERT_DISPATCHER, ALERT_CONDITION_EVALUATOR],
    };
  }
}
