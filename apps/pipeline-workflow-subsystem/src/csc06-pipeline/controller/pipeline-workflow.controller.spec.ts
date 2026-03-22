import { Test, TestingModule } from '@nestjs/testing';
import { PipelineConfigRepository } from '../infrastructure/pipeline-config.repository';
import { PipelineWorkflowService } from '../use-case/pipeline-workflow.service';
import { PipelineWorkflowController } from './pipeline-workflow.controller';

describe('PipelineWorkflowController', () => {
  let pipelineWorkflowController: PipelineWorkflowController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [PipelineWorkflowController],
      providers: [PipelineWorkflowService, PipelineConfigRepository],
    }).compile();

    pipelineWorkflowController = app.get<PipelineWorkflowController>(PipelineWorkflowController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(pipelineWorkflowController.getHello()).toBe('Hello World!');
    });
  });
});
