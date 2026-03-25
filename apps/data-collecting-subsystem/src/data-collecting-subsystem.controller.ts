import { Controller, Get } from '@nestjs/common';
import { DataCollectingSubsystemService } from './data-collecting-subsystem.service';

@Controller()
export class DataCollectingSubsystemController {
  constructor(private readonly dataCollectingSubsystemService: DataCollectingSubsystemService) {}

  @Get()
  getHello(): string {
    return this.dataCollectingSubsystemService.getHello();
  }
}
