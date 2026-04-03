import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { RawDataReceivedEvent } from '@sdpe/shared';
import type { PgmqMessageHandler } from '@sdpe/infrastructure';
import { StartPipelineCommand } from '../handlers/commands/start-pipeline.handler';

/**
 * SI-01 수신 이벤트 PGMQ 어댑터.
 * sdpe.reception.events 큐에서 RawDataReceivedEvent를 수신하여
 * StartPipelineCommand로 변환, 파이프라인을 시작한다.
 */
@Injectable()
export class ReceptionEventMessageHandler implements PgmqMessageHandler<RawDataReceivedEvent> {
  private readonly logger = new Logger(ReceptionEventMessageHandler.name);

  constructor(private readonly commandBus: CommandBus) {}

  async handle(message: RawDataReceivedEvent): Promise<void> {
    this.logger.log(`Received raw data event: ${message.event_id}`);
    await this.commandBus.execute(new StartPipelineCommand(message));
  }
}
