import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { IJobRepository } from './domain/port/job-repository.port';
import { JOB_REPOSITORY } from './domain/port/job-repository.port';

export interface SdpeJobModuleOptions {
  jobRepository: Type<IJobRepository>;
}

@Module({})
export class SdpeJobModule {
  static forRoot(options: SdpeJobModuleOptions): DynamicModule {
    return {
      module: SdpeJobModule,
      providers: [{ provide: JOB_REPOSITORY, useClass: options.jobRepository }],
      exports: [JOB_REPOSITORY],
    };
  }
}
