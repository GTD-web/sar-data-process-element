import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { IJobRepository } from './domain/port/job-repository.port';
import { JOB_REPOSITORY } from './domain/port/job-repository.port';
import type { IStepResolver } from './domain/port/step-resolver.port';
import { STEP_RESOLVER } from './domain/port/step-resolver.port';

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
