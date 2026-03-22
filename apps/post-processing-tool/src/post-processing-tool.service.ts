import { Injectable } from '@nestjs/common';

@Injectable()
export class PostProcessingToolService {
  getHello(): string {
    return 'Hello World!';
  }
}
