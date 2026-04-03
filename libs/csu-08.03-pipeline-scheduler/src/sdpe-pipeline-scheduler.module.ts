import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { IPipelineExecutionRepository } from './domain/port/pipeline-execution-repository.port';
import { PIPELINE_EXECUTION_REPOSITORY } from './domain/port/pipeline-execution-repository.port';
import type { IDagBuilder } from './domain/port/dag-builder.port';
import { DAG_BUILDER } from './domain/port/dag-builder.port';

/**
 * CSU-08.03 파이프라인 스케줄러 모듈.
 * DAG 생성 및 파이프라인 실행 이력 관리를 담당한다.
 */
export interface SdpePipelineSchedulerModuleOptions {
  pipelineExecutionRepository: Type<IPipelineExecutionRepository>;
  dagBuilder: Type<IDagBuilder>;
}

@Module({})
export class SdpePipelineSchedulerModule {
  static forRoot(options: SdpePipelineSchedulerModuleOptions): DynamicModule {
    return {
      module: SdpePipelineSchedulerModule,
      providers: [
        { provide: PIPELINE_EXECUTION_REPOSITORY, useClass: options.pipelineExecutionRepository },
        { provide: DAG_BUILDER, useClass: options.dagBuilder },
      ],
      exports: [PIPELINE_EXECUTION_REPOSITORY, DAG_BUILDER],
    };
  }
}
