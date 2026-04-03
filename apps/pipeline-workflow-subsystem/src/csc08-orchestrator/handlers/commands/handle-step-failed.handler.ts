import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { ProcessingEvent } from '@sdpe/shared';
import { HandleStepFailedUseCase } from '../../use-case/handle-step-failed.use-case';

export class HandleStepFailedCommand {
  constructor(public readonly event: ProcessingEvent) {}
}

@CommandHandler(HandleStepFailedCommand)
export class HandleStepFailedHandler implements ICommandHandler<HandleStepFailedCommand> {
  constructor(private readonly useCase: HandleStepFailedUseCase) {}

  async execute(command: HandleStepFailedCommand): Promise<void> {
    return this.useCase.execute(command.event);
  }
}
