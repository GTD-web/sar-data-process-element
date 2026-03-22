import { Module } from '@nestjs/common';
import { PipelineWorkflowSubsystemController } from './pipeline-workflow-subsystem.controller';
import { PipelineWorkflowSubsystemService } from './pipeline-workflow-subsystem.service';

@Module({
  imports: [],
  controllers: [PipelineWorkflowSubsystemController],
  providers: [PipelineWorkflowSubsystemService],
})
export class PipelineWorkflowSubsystemModule {}
