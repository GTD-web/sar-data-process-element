import { type DynamicModule, Module } from '@nestjs/common';
import { PgmqClientService } from './pgmq-client.service';
import { PgmqConsumerService } from './pgmq-consumer.service';
import { PgmqProducerService } from './pgmq-producer.service';
import { type PgmqModuleOptions, PGMQ_MODULE_OPTIONS } from './pgmq.types';

@Module({})
export class SdpePgmqModule {
  static forRoot(options: PgmqModuleOptions): DynamicModule {
    const handlerProviders = (options.consumers ?? []).map((c) => c.handler);

    return {
      module: SdpePgmqModule,
      providers: [
        { provide: PGMQ_MODULE_OPTIONS, useValue: options },
        PgmqClientService,
        PgmqConsumerService,
        PgmqProducerService,
        ...handlerProviders,
      ],
      exports: [PgmqClientService, PgmqProducerService],
    };
  }
}
