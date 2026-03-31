import { Injectable, Logger } from '@nestjs/common';
import { Csc08OrchestratorContextService } from '../../csc08-orchestrator-context.service';
import type { RawDataReceivedEvent } from '@sdpe/shared';

/**
 * sdpe.reception.events 큐를 소비합니다.
 * pgmq 연동은 인프라 확정 후 구현합니다. 현재는 스켈레톤입니다.
 */
@Injectable()
export class ReceptionEventConsumer {
  private readonly logger = new Logger(ReceptionEventConsumer.name);

  constructor(private readonly contextService: Csc08OrchestratorContextService) {}

  async handleMessage(event: RawDataReceivedEvent): Promise<void> {
    this.logger.log(`Received raw data event: ${event.event_id}`);
    await this.contextService.파이프라인을_시작한다(event);
  }
}
