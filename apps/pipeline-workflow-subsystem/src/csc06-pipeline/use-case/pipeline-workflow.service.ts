import { Injectable } from '@nestjs/common';
import { PipelineConfigRepository } from '../infrastructure/pipeline-config.repository';

@Injectable()
export class PipelineWorkflowService {
  constructor(private readonly pipelineConfigRepository: PipelineConfigRepository) {}

  getHello(): string {
    const prefix = this.pipelineConfigRepository.getEchoPrefix();
    return `${prefix}Hello World!`;
  }
}
