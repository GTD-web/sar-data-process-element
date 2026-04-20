import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { ProcessingEvent } from '@sdpe/shared';
import { HandleStepCompletedUseCase } from '../../use-case/handle-step-completed.use-case';

export class HandleStepCompletedCommand {
  constructor(public readonly event: ProcessingEvent) {}
}

@CommandHandler(HandleStepCompletedCommand)
export class HandleStepCompletedHandler implements ICommandHandler<HandleStepCompletedCommand> {
  constructor(private readonly useCase: HandleStepCompletedUseCase) {}

  async execute(command: HandleStepCompletedCommand): Promise<void> {
    return this.useCase.execute(command.event);
  }
}
