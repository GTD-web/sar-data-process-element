import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { PgmqMessage } from './pgmq.types';

@Injectable()
export class PgmqClientService {
  private readonly logger = new Logger(PgmqClientService.name);

  constructor(private readonly dataSource: DataSource) {}

  async createQueue(queue: string): Promise<void> {
    await this.dataSource.query(`SELECT pgmq.create($1)`, [queue]);
    this.logger.log(`Queue created: ${queue}`);
  }

  async send<T>(queue: string, message: T): Promise<number> {
    const [result] = await this.dataSource.query<[{ send: string }]>(`SELECT pgmq.send($1, $2::jsonb)`, [
      queue,
      JSON.stringify(message),
    ]);
    return Number(result.send);
  }

  async sendWithDelay<T>(queue: string, message: T, delaySec: number): Promise<number> {
    const [result] = await this.dataSource.query<[{ send: string }]>(`SELECT pgmq.send($1, $2::jsonb, $3)`, [
      queue,
      JSON.stringify(message),
      delaySec,
    ]);
    return Number(result.send);
  }

  async read<T>(queue: string, visibilityTimeoutSec: number, batchSize: number): Promise<PgmqMessage<T>[]> {
    const rows = await this.dataSource.query<
      { msg_id: number; read_ct: number; enqueued_at: Date; vt: Date; message: T }[]
    >(`SELECT * FROM pgmq.read($1, $2, $3)`, [queue, visibilityTimeoutSec, batchSize]);

    return rows.map((row) => ({
      msgId: Number(row.msg_id),
      readCount: row.read_ct,
      enqueuedAt: row.enqueued_at,
      visibilityTimeout: row.vt,
      message: row.message,
    }));
  }

  async archive(queue: string, msgId: number): Promise<boolean> {
    const [result] = await this.dataSource.query<[{ archive: boolean }]>(`SELECT pgmq.archive($1, $2::bigint)`, [
      queue,
      msgId,
    ]);
    return result.archive;
  }

  async delete(queue: string, msgId: number): Promise<boolean> {
    const [result] = await this.dataSource.query<[{ delete: boolean }]>(`SELECT pgmq.delete($1, $2::bigint)`, [
      queue,
      msgId,
    ]);
    return result.delete;
  }
}
