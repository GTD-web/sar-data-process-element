import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy, Inject } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PgmqClientService } from './pgmq-client.service';
import { type PgmqConsumerConfig, type PgmqModuleOptions, PGMQ_MODULE_OPTIONS } from './pgmq.types';

@Injectable()
export class PgmqConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgmqConsumerService.name);
  private readonly timers: ReturnType<typeof setInterval>[] = [];

  constructor(
    private readonly pgmqClient: PgmqClientService,
    private readonly moduleRef: ModuleRef,
    @Inject(PGMQ_MODULE_OPTIONS) private readonly options: PgmqModuleOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    const consumers = this.options.consumers ?? [];
    for (const config of consumers) {
      await this.startConsumer(config);
    }
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers.length = 0;
    this.logger.log('All consumers stopped');
  }

  private async startConsumer(config: PgmqConsumerConfig): Promise<void> {
    const { queue, handler: HandlerClass, visibilityTimeoutSec = 30, pollIntervalMs = 1000, batchSize = 1 } = config;

    try {
      await this.pgmqClient.createQueue(queue);
    } catch {
      this.logger.warn(`Queue "${queue}" may already exist, continuing...`);
    }

    const handler = this.moduleRef.get(HandlerClass, { strict: false });

    const timer = setInterval(() => {
      void this.poll(queue, visibilityTimeoutSec, batchSize, handler);
    }, pollIntervalMs);

    this.timers.push(timer);
    this.logger.log(`Consumer started: queue=${queue}, interval=${pollIntervalMs}ms`);
  }

  private async poll(
    queue: string,
    visibilityTimeoutSec: number,
    batchSize: number,
    handler: { handle: (message: unknown) => Promise<void> },
  ): Promise<void> {
    try {
      const messages = await this.pgmqClient.read(queue, visibilityTimeoutSec, batchSize);

      for (const msg of messages) {
        try {
          await handler.handle(msg.message);
          await this.pgmqClient.archive(queue, msg.msgId);
        } catch (error) {
          this.logger.error(`Failed to handle message ${msg.msgId} from "${queue}": ${String(error)}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to poll queue "${queue}": ${String(error)}`);
    }
  }
}
