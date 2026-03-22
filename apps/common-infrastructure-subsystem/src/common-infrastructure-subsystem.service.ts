import { Injectable } from '@nestjs/common';

@Injectable()
export class CommonInfrastructureSubsystemService {
  getHello(): string {
    return 'Hello World!';
  }
}
