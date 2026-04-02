import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PgmqClientService, SdpePgmqModule, type PgmqMessageHandler } from '@sdpe/infrastructure';
import { Injectable } from '@nestjs/common';

interface TestMessage {
  hello: string;
  value: number;
}

const MANUAL_QUEUE = 'sdpe_test_manual';
const AUTO_QUEUE = 'sdpe_test_auto';
const received: TestMessage[] = [];

@Injectable()
class TestMessageHandler implements PgmqMessageHandler<TestMessage> {
  async handle(message: TestMessage): Promise<void> {
    received.push(message);
  }
}

describe('pgmq (e2e)', () => {
  let pgmqClient: PgmqClientService;
  let app: { close: () => Promise<void> };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env.DATABASE_URL ?? 'postgresql://sdpe:sdpe@localhost:5432/sdpe',
          synchronize: false,
        }),
        SdpePgmqModule.forRoot({
          consumers: [
            {
              queue: AUTO_QUEUE,
              handler: TestMessageHandler,
              visibilityTimeoutSec: 10,
              pollIntervalMs: 200,
            },
          ],
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await (app as unknown as { init: () => Promise<void> }).init();

    pgmqClient = moduleRef.get(PgmqClientService);

    try {
      await pgmqClient.createQueue(MANUAL_QUEUE);
    } catch {
      // already exists
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('send → read → archive 기본 동작', async () => {
    const msgId = await pgmqClient.send<TestMessage>(MANUAL_QUEUE, { hello: 'world', value: 42 });
    expect(msgId).toBeGreaterThan(0);

    const messages = await pgmqClient.read<TestMessage>(MANUAL_QUEUE, 10, 1);
    expect(messages).toHaveLength(1);

    const [first] = messages;
    if (first === undefined) {
      throw new Error('expected one message');
    }
    expect(first.message).toEqual({ hello: 'world', value: 42 });

    const archived = await pgmqClient.archive(MANUAL_QUEUE, first.msgId);
    expect(archived).toBe(true);

    const empty = await pgmqClient.read<TestMessage>(MANUAL_QUEUE, 10, 1);
    expect(empty).toHaveLength(0);
  });

  it('consumer 폴링으로 자동 처리', async () => {
    received.length = 0;

    await pgmqClient.send<TestMessage>(AUTO_QUEUE, { hello: 'auto', value: 1 });
    await pgmqClient.send<TestMessage>(AUTO_QUEUE, { hello: 'auto', value: 2 });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(received).toHaveLength(2);
    expect(received).toEqual(
      expect.arrayContaining([
        { hello: 'auto', value: 1 },
        { hello: 'auto', value: 2 },
      ]),
    );
  });
});
