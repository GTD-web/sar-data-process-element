import { Controller, Get } from '@nestjs/common';
import { SarProcessingSubsystemService } from './sar-processing-subsystem.service';

@Controller()
export class SarProcessingSubsystemController {
  constructor(private readonly sarProcessingSubsystemService: SarProcessingSubsystemService) {}

  @Get()
  getHello(): string {
    return this.sarProcessingSubsystemService.getHello();
  }
}
