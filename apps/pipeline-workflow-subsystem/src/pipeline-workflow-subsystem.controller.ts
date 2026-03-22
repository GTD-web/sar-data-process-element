import { Controller, Get } from '@nestjs/common';
import { PipelineWorkflowSubsystemService } from './pipeline-workflow-subsystem.service';

@Controller()
export class PipelineWorkflowSubsystemController {
  constructor(private readonly pipelineWorkflowSubsystemService: PipelineWorkflowSubsystemService) {}

  @Get()
  getHello(): string {
    return this.pipelineWorkflowSubsystemService.getHello();
  }
}
