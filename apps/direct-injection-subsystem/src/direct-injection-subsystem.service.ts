import { Injectable } from '@nestjs/common';

@Injectable()
export class DirectInjectionSubsystemService {
  getHello(): string {
    return 'Hello World!';
  }
}
