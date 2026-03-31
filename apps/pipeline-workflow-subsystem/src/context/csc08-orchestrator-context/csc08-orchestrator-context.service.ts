import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { RawDataReceivedEvent, ProcessingEvent } from '@sdpe/shared';
import { StartPipelineCommand } from './handlers/commands/start-pipeline.handler';
import { HandleStepCompletedCommand } from './handlers/commands/handle-step-completed.handler';
import { HandleStepFailedCommand } from './handlers/commands/handle-step-failed.handler';
import { ReprocessPipelineCommand } from './handlers/commands/reprocess-pipeline.handler';
import { GetJobStatusQuery } from './handlers/queries/get-job-status.handler';
import { GetPipelineExecutionQuery } from './handlers/queries/get-pipeline-execution.handler';
import type {
  ReprocessParams,
  JobStatusResult,
  PipelineExecutionResult,
} from './interfaces/csc08-orchestrator-context.interface';

@Injectable()
export class Csc08OrchestratorContextService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // ── Commands ──

  async 파이프라인을_시작한다(event: RawDataReceivedEvent): Promise<void> {
    return this.commandBus.execute(new StartPipelineCommand(event));
  }

  async 단계_완료를_처리한다(event: ProcessingEvent): Promise<void> {
    return this.commandBus.execute(new HandleStepCompletedCommand(event));
  }

  async 단계_실패를_처리한다(event: ProcessingEvent): Promise<void> {
    return this.commandBus.execute(new HandleStepFailedCommand(event));
  }

  async 파이프라인을_재처리한다(params: ReprocessParams): Promise<void> {
    return this.commandBus.execute(new ReprocessPipelineCommand(params));
  }

  // ── Queries ──

  async 작업_상태를_조회한다(jobId: string): Promise<JobStatusResult | null> {
    return this.queryBus.execute(new GetJobStatusQuery(jobId));
  }

  async 파이프라인_실행을_조회한다(executionId: string): Promise<PipelineExecutionResult | null> {
    return this.queryBus.execute(new GetPipelineExecutionQuery(executionId));
  }
}
