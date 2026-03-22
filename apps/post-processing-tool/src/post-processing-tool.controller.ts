import { Controller, Get } from '@nestjs/common';
import { PostProcessingToolService } from './post-processing-tool.service';

@Controller()
export class PostProcessingToolController {
  constructor(private readonly postProcessingToolService: PostProcessingToolService) {}

  @Get()
  getHello(): string {
    return this.postProcessingToolService.getHello();
  }
}
