import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  PIPELINE_EXECUTION_REPOSITORY,
  type IPipelineExecutionRepository,
} from '@sdpe/pipeline-scheduler';
import type { PipelineExecutionResult } from '../../interfaces/csc08-orchestrator-context.interface';

export class GetPipelineExecutionQuery {
  constructor(public readonly executionId: string) {}
}

@QueryHandler(GetPipelineExecutionQuery)
export class GetPipelineExecutionHandler implements IQueryHandler<GetPipelineExecutionQuery> {
  constructor(
    @Inject(PIPELINE_EXECUTION_REPOSITORY)
    private readonly pipelineExecutionRepository: IPipelineExecutionRepository,
  ) {}

  async execute(query: GetPipelineExecutionQuery): Promise<PipelineExecutionResult | null> {
    const execution = await this.pipelineExecutionRepository.findById(query.executionId);
    if (!execution) return null;

    return {
      executionId: execution.id,
      jobId: execution.jobId,
      steps: execution.steps.map((step) => ({
        order: step.order,
        targetCsc: step.targetCsc,
        productLevel: step.productLevel,
        status: step.status,
      })),
      isCompleted: execution.isCompleted,
    };
  }
}
