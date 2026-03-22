import { Test, TestingModule } from '@nestjs/testing';
import { CommonInfrastructureSubsystemController } from './common-infrastructure-subsystem.controller';
import { CommonInfrastructureSubsystemService } from './common-infrastructure-subsystem.service';

describe('CommonInfrastructureSubsystemController', () => {
  let commonInfrastructureSubsystemController: CommonInfrastructureSubsystemController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [CommonInfrastructureSubsystemController],
      providers: [CommonInfrastructureSubsystemService],
    }).compile();

    commonInfrastructureSubsystemController = app.get<CommonInfrastructureSubsystemController>(CommonInfrastructureSubsystemController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(commonInfrastructureSubsystemController.getHello()).toBe('Hello World!');
    });
  });
});
