import { Injectable } from '@nestjs/common';

@Injectable()
export class ProductManagementSubsystemService {
  getHello(): string {
    return 'Hello World!';
  }
}
