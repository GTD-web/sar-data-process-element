import { Controller, Get } from '@nestjs/common';
import { IPipelineHealth } from '../interface/pipeline-health.interface';
import { PipelineWorkflowService } from '../use-case/pipeline-workflow.service';

@Controller()
export class PipelineWorkflowController {
  constructor(private readonly pipelineWorkflowService: PipelineWorkflowService) {}

  @Get()
  getHello(): string {
    return this.pipelineWorkflowService.getHello();
  }

  @Get('health')
  getHealth(): IPipelineHealth {
    return { status: 'ok' };
  }
}
