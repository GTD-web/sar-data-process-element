import { Test, TestingModule } from '@nestjs/testing';
import { DataServiceSubsystemController } from './data-service-subsystem.controller';
import { DataServiceSubsystemService } from './data-service-subsystem.service';

describe('DataServiceSubsystemController', () => {
  let dataServiceSubsystemController: DataServiceSubsystemController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [DataServiceSubsystemController],
      providers: [DataServiceSubsystemService],
    }).compile();

    dataServiceSubsystemController = app.get<DataServiceSubsystemController>(DataServiceSubsystemController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(dataServiceSubsystemController.getHello()).toBe('Hello World!');
    });
  });
});
