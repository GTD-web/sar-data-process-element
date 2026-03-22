import { Injectable } from '@nestjs/common';

@Injectable()
export class DataServiceSubsystemService {
  getHello(): string {
    return 'Hello World!';
  }
}
