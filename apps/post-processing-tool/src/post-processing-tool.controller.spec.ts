import { Test, TestingModule } from '@nestjs/testing';
import { PostProcessingToolController } from './post-processing-tool.controller';
import { PostProcessingToolService } from './post-processing-tool.service';

describe('PostProcessingToolController', () => {
  let postProcessingToolController: PostProcessingToolController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [PostProcessingToolController],
      providers: [PostProcessingToolService],
    }).compile();

    postProcessingToolController = app.get<PostProcessingToolController>(PostProcessingToolController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(postProcessingToolController.getHello()).toBe('Hello World!');
    });
  });
});
