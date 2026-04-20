import { Test } from '@nestjs/testing';
import { StartPipelineCommand, StartPipelineHandler } from './start-pipeline.handler';
import { HandleStepCompletedCommand, HandleStepCompletedHandler } from './handle-step-completed.handler';
import { HandleStepFailedCommand, HandleStepFailedHandler } from './handle-step-failed.handler';
import { ReprocessPipelineCommand, ReprocessPipelineHandler } from './reprocess-pipeline.handler';
import { StartPipelineUseCase } from '../../use-case/start-pipeline.use-case';
import { HandleStepCompletedUseCase } from '../../use-case/handle-step-completed.use-case';
import { HandleStepFailedUseCase } from '../../use-case/handle-step-failed.use-case';
import { ReprocessPipelineUseCase } from '../../use-case/reprocess-pipeline.use-case';
import { type RawDataReceivedEvent, type ProcessingEvent, ProductLevel, SourceCsc, CscIdentifier } from '@sdpe/shared';
import type { ReprocessParams } from '../../interfaces/csc08-orchestrator.interface';

describe('Command Handlers', () => {
  describe('StartPipelineHandler', () => {
    it('StartPipelineCommand를 받아 StartPipelineUseCase에 위임', async () => {
      const mockUseCase = { execute: jest.fn() };
      const module = await Test.createTestingModule({
        providers: [StartPipelineHandler, { provide: StartPipelineUseCase, useValue: mockUseCase }],
      }).compile();

      const handler = module.get(StartPipelineHandler);
      const event: RawDataReceivedEvent = {
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

      await handler.execute(new StartPipelineCommand(event));

      expect(mockUseCase.execute).toHaveBeenCalledWith(event);
    });
  });

  describe('HandleStepCompletedHandler', () => {
    it('HandleStepCompletedCommand를 받아 UseCase에 위임', async () => {
      const mockUseCase = { execute: jest.fn() };
      const module = await Test.createTestingModule({
        providers: [HandleStepCompletedHandler, { provide: HandleStepCompletedUseCase, useValue: mockUseCase }],
      }).compile();

      const handler = module.get(HandleStepCompletedHandler);
      const event: ProcessingEvent = {
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

      await handler.execute(new HandleStepCompletedCommand(event));

      expect(mockUseCase.execute).toHaveBeenCalledWith(event);
    });
  });

  describe('HandleStepFailedHandler', () => {
    it('HandleStepFailedCommand를 받아 UseCase에 위임', async () => {
      const mockUseCase = { execute: jest.fn() };
      const module = await Test.createTestingModule({
        providers: [HandleStepFailedHandler, { provide: HandleStepFailedUseCase, useValue: mockUseCase }],
      }).compile();

      const handler = module.get(HandleStepFailedHandler);
      const event: ProcessingEvent = {
        schema_version: '1.0',
        job_id: 'job-001',
        event_type: 'PROCESSING_FAILED',
        source_csc: SourceCsc.CSC_03,
        product_level: ProductLevel.LEVEL_0,
        timestamp: '2026-01-01T00:10:00Z',
        input_path: '/in',
        output_path: null,
        retry_count: 1,
      };

      await handler.execute(new HandleStepFailedCommand(event));

      expect(mockUseCase.execute).toHaveBeenCalledWith(event);
    });
  });

  describe('ReprocessPipelineHandler', () => {
    it('ReprocessPipelineCommand를 받아 UseCase에 위임', async () => {
      const mockUseCase = { execute: jest.fn() };
      const module = await Test.createTestingModule({
        providers: [ReprocessPipelineHandler, { provide: ReprocessPipelineUseCase, useValue: mockUseCase }],
      }).compile();

      const handler = module.get(ReprocessPipelineHandler);
      const params: ReprocessParams = {
        jobId: 'job-001',
        targetLevel: ProductLevel.LEVEL_1,
        requestedBy: CscIdentifier.CSC_09,
      };

      await handler.execute(new ReprocessPipelineCommand(params));

      expect(mockUseCase.execute).toHaveBeenCalledWith(params);
    });
  });
});
