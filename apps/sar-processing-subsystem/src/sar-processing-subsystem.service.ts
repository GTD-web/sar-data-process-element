import { Injectable } from '@nestjs/common';

@Injectable()
export class SarProcessingSubsystemService {
  getHello(): string {
    return 'Hello World!';
  }
}
