import { Test } from '@nestjs/testing';
import { CommandBus } from '@nestjs/cqrs';
import { ReceptionEventMessageHandler } from './reception-event.message-handler';
import { ProcessingEventMessageHandler } from './processing-event.message-handler';
import { StartPipelineCommand } from '../handlers/commands/start-pipeline.handler';
import { HandleStepCompletedCommand } from '../handlers/commands/handle-step-completed.handler';
import { HandleStepFailedCommand } from '../handlers/commands/handle-step-failed.handler';
import { type RawDataReceivedEvent, type ProcessingEvent, ProductLevel, SourceCsc } from '@sdpe/shared';

describe('Message Handlers', () => {
  describe('ReceptionEventMessageHandler', () => {
    let handler: ReceptionEventMessageHandler;
    let mockCommandBus: jest.Mocked<CommandBus>;

    beforeEach(async () => {
      mockCommandBus = { execute: jest.fn() } as unknown as jest.Mocked<CommandBus>;

      const module = await Test.createTestingModule({
        providers: [ReceptionEventMessageHandler, { provide: CommandBus, useValue: mockCommandBus }],
      }).compile();

      handler = module.get(ReceptionEventMessageHandler);
    });

    it('RawDataReceivedEvent를 StartPipelineCommand로 변환하여 CommandBus에 전달', async () => {
      const message: RawDataReceivedEvent = {
        schema_version: '1.0',
        event_id: 'evt-001',
        event_type: 'RAW_DATA_RECEIVED',
        acquisition_start: '2026-01-01T00:00:00Z',
        acquisition_end: '2026-01-01T00:01:00Z',
        raw_data_path: '/data/raw/scene.dat',
        file_size_bytes: 100,
        checksum_sha256: 'abc',
        satellite_id: 'SAT-1',
        mode: 'STRIPMAP',
        polarization: ['HH'],
        center_frequency_hz: 5_405_000_000,
        prf_hz: 1_700,
      };

      await handler.handle(message);

      expect(mockCommandBus.execute).toHaveBeenCalledTimes(1);
      const command = mockCommandBus.execute.mock.calls[0]![0] as StartPipelineCommand;
      expect(command).toBeInstanceOf(StartPipelineCommand);
      expect(command.event).toBe(message);
    });
  });

  describe('ProcessingEventMessageHandler', () => {
    let handler: ProcessingEventMessageHandler;
    let mockCommandBus: jest.Mocked<CommandBus>;

    beforeEach(async () => {
      mockCommandBus = { execute: jest.fn() } as unknown as jest.Mocked<CommandBus>;

      const module = await Test.createTestingModule({
        providers: [ProcessingEventMessageHandler, { provide: CommandBus, useValue: mockCommandBus }],
      }).compile();

      handler = module.get(ProcessingEventMessageHandler);
    });

    it('PROCESSING_COMPLETED 이벤트를 HandleStepCompletedCommand로 라우팅', async () => {
      const message: ProcessingEvent = {
        schema_version: '1.0',
        job_id: 'job-001',
        event_type: 'PROCESSING_COMPLETED',
        source_csc: SourceCsc.CSC_03,
        product_level: ProductLevel.LEVEL_0,
        timestamp: '2026-01-01T00:10:00Z',
        input_path: '/in',
        output_path: '/out',
        retry_count: 0,
      };

      await handler.handle(message);

      const command = mockCommandBus.execute.mock.calls[0]![0] as HandleStepCompletedCommand;
      expect(command).toBeInstanceOf(HandleStepCompletedCommand);
      expect(command.event).toBe(message);
    });

    it('PROCESSING_FAILED 이벤트를 HandleStepFailedCommand로 라우팅', async () => {
      const message: ProcessingEvent = {
        schema_version: '1.0',
        job_id: 'job-001',
        event_type: 'PROCESSING_FAILED',
        source_csc: SourceCsc.CSC_03,
        product_level: ProductLevel.LEVEL_0,
        timestamp: '2026-01-01T00:10:00Z',
        input_path: '/in',
        output_path: null,
        retry_count: 1,
        error_code: 'ERR_TIMEOUT',
      };

      await handler.handle(message);

      const command = mockCommandBus.execute.mock.calls[0]![0] as HandleStepFailedCommand;
      expect(command).toBeInstanceOf(HandleStepFailedCommand);
      expect(command.event).toBe(message);
    });
  });
});
