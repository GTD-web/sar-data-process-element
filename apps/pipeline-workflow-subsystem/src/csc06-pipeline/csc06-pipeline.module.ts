import { Module } from '@nestjs/common';
import { SdpeSharedModule } from '@sdpe/shared';
import { PipelineWorkflowController } from './controller/pipeline-workflow.controller';
import { PipelineConfigRepository } from './infrastructure/pipeline-config.repository';
import { PipelineWorkflowService } from './use-case/pipeline-workflow.service';

@Module({
  imports: [SdpeSharedModule],
  controllers: [PipelineWorkflowController],
  providers: [PipelineWorkflowService, PipelineConfigRepository],
})
export class Csc06PipelineModule {}
