import { Test, TestingModule } from '@nestjs/testing';
import { SarProcessingSubsystemController } from './sar-processing-subsystem.controller';
import { SarProcessingSubsystemService } from './sar-processing-subsystem.service';

describe('SarProcessingSubsystemController', () => {
  let sarProcessingSubsystemController: SarProcessingSubsystemController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [SarProcessingSubsystemController],
      providers: [SarProcessingSubsystemService],
    }).compile();

    sarProcessingSubsystemController = app.get<SarProcessingSubsystemController>(SarProcessingSubsystemController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(sarProcessingSubsystemController.getHello()).toBe('Hello World!');
    });
  });
});
