import { Test, TestingModule } from '@nestjs/testing';
import { DataCollectingSubsystemController } from './data-collecting-subsystem.controller';
import { DataCollectingSubsystemService } from './data-collecting-subsystem.service';

describe('DataCollectingSubsystemController', () => {
  let dataCollectingSubsystemController: DataCollectingSubsystemController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [DataCollectingSubsystemController],
      providers: [DataCollectingSubsystemService],
    }).compile();

    dataCollectingSubsystemController = app.get<DataCollectingSubsystemController>(
      DataCollectingSubsystemController,
    );
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(dataCollectingSubsystemController.getHello()).toBe('Hello World!');
    });
  });
});
