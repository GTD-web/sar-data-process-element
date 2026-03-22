import { Test, TestingModule } from '@nestjs/testing';
import { PipelineWorkflowSubsystemController } from './pipeline-workflow-subsystem.controller';
import { PipelineWorkflowSubsystemService } from './pipeline-workflow-subsystem.service';

describe('PipelineWorkflowSubsystemController', () => {
  let pipelineWorkflowSubsystemController: PipelineWorkflowSubsystemController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [PipelineWorkflowSubsystemController],
      providers: [PipelineWorkflowSubsystemService],
    }).compile();

    pipelineWorkflowSubsystemController = app.get<PipelineWorkflowSubsystemController>(PipelineWorkflowSubsystemController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(pipelineWorkflowSubsystemController.getHello()).toBe('Hello World!');
    });
  });
});
