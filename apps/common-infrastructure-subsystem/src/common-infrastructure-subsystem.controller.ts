import { Controller, Get } from '@nestjs/common';
import { CommonInfrastructureSubsystemService } from './common-infrastructure-subsystem.service';

@Controller()
export class CommonInfrastructureSubsystemController {
  constructor(private readonly commonInfrastructureSubsystemService: CommonInfrastructureSubsystemService) {}

  @Get()
  getHello(): string {
    return this.commonInfrastructureSubsystemService.getHello();
  }
}
