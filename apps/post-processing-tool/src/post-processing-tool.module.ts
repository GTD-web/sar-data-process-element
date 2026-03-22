import { Module } from '@nestjs/common';
import { PostProcessingToolController } from './post-processing-tool.controller';
import { PostProcessingToolService } from './post-processing-tool.service';

@Module({
  imports: [],
  controllers: [PostProcessingToolController],
  providers: [PostProcessingToolService],
})
export class PostProcessingToolModule {}
