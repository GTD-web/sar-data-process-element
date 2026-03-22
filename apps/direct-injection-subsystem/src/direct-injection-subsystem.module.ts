import { Module } from '@nestjs/common';
import { DirectInjectionSubsystemController } from './direct-injection-subsystem.controller';
import { DirectInjectionSubsystemService } from './direct-injection-subsystem.service';

@Module({
  imports: [],
  controllers: [DirectInjectionSubsystemController],
  providers: [DirectInjectionSubsystemService],
})
export class DirectInjectionSubsystemModule {}
