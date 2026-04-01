import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { RawDataReceivedEvent } from '@sdpe/shared';
import type { PgmqMessageHandler } from '@sdpe/database';
import { StartPipelineCommand } from '../commands/start-pipeline.handler';

@Injectable()
export class ReceptionEventMessageHandler implements PgmqMessageHandler<RawDataReceivedEvent> {
  private readonly logger = new Logger(ReceptionEventMessageHandler.name);

  constructor(private readonly commandBus: CommandBus) {}

  async handle(message: RawDataReceivedEvent): Promise<void> {
    this.logger.log(`Received raw data event: ${message.event_id}`);
    await this.commandBus.execute(new StartPipelineCommand(message));
  }
}
