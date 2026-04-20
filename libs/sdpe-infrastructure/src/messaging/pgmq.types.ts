import type { DynamicModule, ForwardReference, Type } from '@nestjs/common';

/**
 * PGMQ에서 읽은 메시지 래퍼.
 * 큐에서 소비된 메시지의 메타데이터(ID, 읽기 횟수, visibility timeout 등)를 포함한다.
 */
export interface PgmqMessage<T = unknown> {
  readonly msgId: number;
  readonly readCount: number;
  readonly enqueuedAt: Date;
  readonly visibilityTimeout: Date;
  readonly message: T;
}

/**
 * PGMQ 메시지 핸들러 포트.
 * infrastructure 계층의 메시지 핸들러가 이 인터페이스를 구현하여
 * 수신된 메시지를 도메인 로직으로 위임한다 (SI-01, SI-03).
 */
export interface PgmqMessageHandler<T = unknown> {
  handle(message: T): Promise<void>;
}

/**
 * PGMQ 소비자 설정.
 * 큐 이름, 메시지 핸들러 클래스, visibility timeout, 폴링 간격, 배치 크기를 정의한다.
 */
export interface PgmqConsumerConfig {
  readonly queue: string;
  readonly handler: Type<PgmqMessageHandler>;
  readonly visibilityTimeoutSec?: number;
  readonly pollIntervalMs?: number;
  readonly batchSize?: number;
}

/** PGMQ 생산자 설정. 메시지를 발행할 큐 이름과 기본 visibility timeout을 정의한다. */
export interface PgmqProducerConfig {
  readonly queue: string;
  readonly visibilityTimeoutSec?: number;
}

/**
 * PGMQ 모듈 옵션.
 * {@link SdpePgmqModule.forRoot}에 전달되어 소비자 및 생산자 목록을 구성한다 (AD-02).
 */
export interface PgmqModuleOptions {
  readonly imports?: Array<Type | DynamicModule | Promise<DynamicModule> | ForwardReference>;
  readonly consumers?: readonly PgmqConsumerConfig[];
  readonly producers?: readonly PgmqProducerConfig[];
}

export const PGMQ_MODULE_OPTIONS = Symbol('PGMQ_MODULE_OPTIONS');
