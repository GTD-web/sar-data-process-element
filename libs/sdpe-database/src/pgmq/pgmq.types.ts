import type { Type } from '@nestjs/common';

export interface PgmqMessage<T = unknown> {
  readonly msgId: number;
  readonly readCount: number;
  readonly enqueuedAt: Date;
  readonly visibilityTimeout: Date;
  readonly message: T;
}

export interface PgmqMessageHandler<T = unknown> {
  handle(message: T): Promise<void>;
}

export interface PgmqConsumerConfig {
  readonly queue: string;
  readonly handler: Type<PgmqMessageHandler>;
  readonly visibilityTimeoutSec?: number;
  readonly pollIntervalMs?: number;
  readonly batchSize?: number;
}

export interface PgmqProducerConfig {
  readonly queue: string;
  readonly visibilityTimeoutSec?: number;
}

export interface PgmqModuleOptions {
  readonly consumers?: readonly PgmqConsumerConfig[];
  readonly producers?: readonly PgmqProducerConfig[];
}

export const PGMQ_MODULE_OPTIONS = Symbol('PGMQ_MODULE_OPTIONS');
