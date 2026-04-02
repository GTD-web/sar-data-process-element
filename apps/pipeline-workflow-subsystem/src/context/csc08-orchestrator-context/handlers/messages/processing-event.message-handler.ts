import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { ProcessingEvent } from '@sdpe/shared';
import type { PgmqMessageHandler } from '@sdpe/infrastructure';
import { HandleStepCompletedCommand } from '../commands/handle-step-completed.handler';
import { HandleStepFailedCommand } from '../commands/handle-step-failed.handler';

@Injectable()
export class ProcessingEventMessageHandler implements PgmqMessageHandler<ProcessingEvent> {
  private readonly logger = new Logger(ProcessingEventMessageHandler.name);

  constructor(private readonly commandBus: CommandBus) {}

  async handle(message: ProcessingEvent): Promise<void> {
    this.logger.log(`Received processing event: job=${message.job_id}, type=${message.event_type}`);

    if (message.event_type === 'PROCESSING_COMPLETED') {
      await this.commandBus.execute(new HandleStepCompletedCommand(message));
    } else {
      await this.commandBus.execute(new HandleStepFailedCommand(message));
    }
  }
}
