import { Injectable, Logger } from '@nestjs/common';
import { Csc07OrchestratorContextService } from '../../csc07-orchestrator-context.service';
import type { ProcessingEvent } from '@sdpe/shared';

/**
 * sdpe.processing.events 큐를 소비합니다.
 * pgmq 연동은 인프라 확정 후 구현합니다. 현재는 스켈레톤입니다.
 */
@Injectable()
export class ProcessingEventConsumer {
  private readonly logger = new Logger(ProcessingEventConsumer.name);

  constructor(private readonly contextService: Csc07OrchestratorContextService) {}

  async handleMessage(event: ProcessingEvent): Promise<void> {
    this.logger.log(`Received processing event: job=${event.job_id}, type=${event.event_type}`);

    if (event.event_type === 'PROCESSING_COMPLETED') {
      await this.contextService.단계_완료를_처리한다(event);
    } else {
      await this.contextService.단계_실패를_처리한다(event);
    }
  }
}
