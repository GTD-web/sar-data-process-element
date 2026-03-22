import { Controller, Get } from '@nestjs/common';
import { DirectInjectionSubsystemService } from './direct-injection-subsystem.service';

@Controller()
export class DirectInjectionSubsystemController {
  constructor(private readonly directInjectionSubsystemService: DirectInjectionSubsystemService) {}

  @Get()
  getHello(): string {
    return this.directInjectionSubsystemService.getHello();
  }
}
