import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { IReceptionEventListener } from './domain/port/reception-event-listener.port';
import { RECEPTION_EVENT_LISTENER } from './domain/port/reception-event-listener.port';

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
