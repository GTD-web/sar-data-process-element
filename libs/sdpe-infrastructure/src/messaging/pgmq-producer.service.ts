import { Injectable, Logger } from '@nestjs/common';
import { PgmqClientService } from './pgmq-client.service';

/**
 * PGMQ 메시지 발행 서비스.
 * {@link PgmqClientService}를 래핑하여 큐에 메시지를 발행한다 (SI-04, SI-05).
 */
@Injectable()
export class PgmqProducerService {
  private readonly logger = new Logger(PgmqProducerService.name);

  constructor(private readonly pgmqClient: PgmqClientService) {}

  async send<T>(queue: string, message: T): Promise<number> {
    const msgId = await this.pgmqClient.send(queue, message);
    this.logger.log(`Message sent: queue=${queue}, msgId=${msgId}`);
    return msgId;
  }

  async sendWithDelay<T>(queue: string, message: T, delaySec: number): Promise<number> {
    const msgId = await this.pgmqClient.sendWithDelay(queue, message, delaySec);
    this.logger.log(`Message sent with delay: queue=${queue}, msgId=${msgId}, delay=${delaySec}s`);
    return msgId;
  }
}
