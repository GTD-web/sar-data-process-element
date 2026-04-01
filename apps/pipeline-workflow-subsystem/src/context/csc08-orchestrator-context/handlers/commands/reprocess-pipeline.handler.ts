import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ReprocessPipelineUseCase } from '../../use-case/reprocess-pipeline.use-case';
import type { ReprocessParams } from '../../interfaces/csc08-orchestrator-context.interface';

export class ReprocessPipelineCommand {
  constructor(public readonly params: ReprocessParams) {}
}

@CommandHandler(ReprocessPipelineCommand)
export class ReprocessPipelineHandler implements ICommandHandler<ReprocessPipelineCommand> {
  constructor(private readonly useCase: ReprocessPipelineUseCase) {}

  async execute(command: ReprocessPipelineCommand): Promise<void> {
    return this.useCase.execute(command.params);
  }
}
