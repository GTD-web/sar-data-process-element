import { Injectable } from '@nestjs/common';

@Injectable()
export class DataCollectingSubsystemService {
  getHello(): string {
    return 'Hello World!';
  }
}
