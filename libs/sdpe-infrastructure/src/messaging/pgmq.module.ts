import { type DynamicModule, Module } from '@nestjs/common';
import { PgmqClientService } from './pgmq-client.service';
import { PgmqConsumerService } from './pgmq-consumer.service';
import { PgmqProducerService } from './pgmq-producer.service';
import { type PgmqModuleOptions, PGMQ_MODULE_OPTIONS } from './pgmq.types';

/**
 * PGMQ 동적 모듈 (AD-02).
 * {@link PgmqModuleOptions}를 받아 소비자/생산자 서비스와 핸들러를 등록하는 NestJS DynamicModule이다.
 */
@Module({})
export class SdpePgmqModule {
  static forRoot(options: PgmqModuleOptions): DynamicModule {
    const handlerProviders = (options.consumers ?? []).map((c) => c.handler);

    return {
      module: SdpePgmqModule,
      imports: options.imports ?? [],
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
