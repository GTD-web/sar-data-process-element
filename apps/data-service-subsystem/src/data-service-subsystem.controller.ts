import { Controller, Get } from '@nestjs/common';
import { DataServiceSubsystemService } from './data-service-subsystem.service';

@Controller()
export class DataServiceSubsystemController {
  constructor(private readonly dataServiceSubsystemService: DataServiceSubsystemService) {}

  @Get()
  getHello(): string {
    return this.dataServiceSubsystemService.getHello();
  }
}
