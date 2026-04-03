import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { RawDataReceivedEvent } from '@sdpe/shared';
import { StartPipelineUseCase } from '../../use-case/start-pipeline.use-case';

export class StartPipelineCommand {
  constructor(public readonly event: RawDataReceivedEvent) {}
}

@CommandHandler(StartPipelineCommand)
export class StartPipelineHandler implements ICommandHandler<StartPipelineCommand> {
  constructor(private readonly useCase: StartPipelineUseCase) {}

  async execute(command: StartPipelineCommand): Promise<void> {
    return this.useCase.execute(command.event);
  }
}
