import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { IJobRepository } from './domain/port/job-repository.port';
import { JOB_REPOSITORY } from './domain/port/job-repository.port';
import type { IStepResolver } from './domain/port/step-resolver.port';
import { STEP_RESOLVER } from './domain/port/step-resolver.port';

/**
 * CSU-08.04 작업 큐 모듈.
 * Job 영속화와 다음 파이프라인 단계 결정 로직을 담당한다.
 * PGMQ 큐 설정(QUEUE_CONFIG)도 이 모듈에서 제공한다.
 */
export interface SdpeTaskQueueModuleOptions {
  jobRepository: Type<IJobRepository>;
  stepResolver: Type<IStepResolver>;
}

@Module({})
export class SdpeTaskQueueModule {
  static forRoot(options: SdpeTaskQueueModuleOptions): DynamicModule {
    return {
      module: SdpeTaskQueueModule,
      providers: [
        { provide: JOB_REPOSITORY, useClass: options.jobRepository },
        { provide: STEP_RESOLVER, useClass: options.stepResolver },
      ],
      exports: [JOB_REPOSITORY, STEP_RESOLVER],
    };
  }
}
