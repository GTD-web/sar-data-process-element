import { Injectable } from '@nestjs/common';

@Injectable()
export class PipelineConfigRepository {
  getEchoPrefix(): string {
    return '';
  }
}
