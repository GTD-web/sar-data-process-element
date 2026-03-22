import { Test, TestingModule } from '@nestjs/testing';
import { DirectInjectionSubsystemController } from './direct-injection-subsystem.controller';
import { DirectInjectionSubsystemService } from './direct-injection-subsystem.service';

describe('DirectInjectionSubsystemController', () => {
  let directInjectionSubsystemController: DirectInjectionSubsystemController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [DirectInjectionSubsystemController],
      providers: [DirectInjectionSubsystemService],
    }).compile();

    directInjectionSubsystemController = app.get<DirectInjectionSubsystemController>(DirectInjectionSubsystemController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(directInjectionSubsystemController.getHello()).toBe('Hello World!');
    });
  });
});
