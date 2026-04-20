import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { ProcessingEvent } from '@sdpe/shared';
import type { PgmqMessageHandler } from '@sdpe/infrastructure';
import { HandleStepCompletedCommand } from '../handlers/commands/handle-step-completed.handler';
import { HandleStepFailedCommand } from '../handlers/commands/handle-step-failed.handler';

/**
 * SI-03 처리 이벤트 PGMQ 어댑터.
 * sdpe.processing.events 큐에서 ProcessingEvent를 수신하여
 * event_type에 따라 완료(HandleStepCompleted) 또는 실패(HandleStepFailed) 커맨드로 라우팅한다.
 */
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
