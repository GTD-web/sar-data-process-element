import { Injectable } from '@nestjs/common';

@Injectable()
export class PipelineWorkflowSubsystemService {
  getHello(): string {
    return 'Hello World!';
  }
}
