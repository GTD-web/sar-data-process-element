import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { IPipelineExecutionRepository } from './domain/port/pipeline-execution-repository.port';
import { PIPELINE_EXECUTION_REPOSITORY } from './domain/port/pipeline-execution-repository.port';
import type { IStepResolver } from './domain/port/step-resolver.port';
import { STEP_RESOLVER } from './domain/port/step-resolver.port';
import type { IDagBuilder } from './domain/port/dag-builder.port';
import { DAG_BUILDER } from './domain/port/dag-builder.port';

export interface SdpePipelineModuleOptions {
  pipelineExecutionRepository: Type<IPipelineExecutionRepository>;
  stepResolver: Type<IStepResolver>;
  dagBuilder: Type<IDagBuilder>;
}

@Module({})
export class SdpePipelineModule {
  static forRoot(options: SdpePipelineModuleOptions): DynamicModule {
    return {
      module: SdpePipelineModule,
      providers: [
        { provide: PIPELINE_EXECUTION_REPOSITORY, useClass: options.pipelineExecutionRepository },
        { provide: STEP_RESOLVER, useClass: options.stepResolver },
        { provide: DAG_BUILDER, useClass: options.dagBuilder },
      ],
      exports: [PIPELINE_EXECUTION_REPOSITORY, STEP_RESOLVER, DAG_BUILDER],
    };
  }
}
