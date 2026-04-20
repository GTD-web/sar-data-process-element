import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { IReceptionEventListener } from './domain/port/reception-event-listener.port';
import { RECEPTION_EVENT_LISTENER } from './domain/port/reception-event-listener.port';

/**
 * CSU-08.01 수신 이벤트 모듈.
 * SI-01 수신 이벤트 리스너의 구체 구현체를 forRoot()로 주입받는다.
 */
export interface SdpeReceptionEventModuleOptions {
  receptionEventListener: Type<IReceptionEventListener>;
}

@Module({})
export class SdpeReceptionEventModule {
  static forRoot(options: SdpeReceptionEventModuleOptions): DynamicModule {
    return {
      module: SdpeReceptionEventModule,
      providers: [{ provide: RECEPTION_EVENT_LISTENER, useClass: options.receptionEventListener }],
      exports: [RECEPTION_EVENT_LISTENER],
    };
  }
}
