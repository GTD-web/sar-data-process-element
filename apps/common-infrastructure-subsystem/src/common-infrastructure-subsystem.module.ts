import { Module } from '@nestjs/common';
import { CommonInfrastructureSubsystemController } from './common-infrastructure-subsystem.controller';
import { CommonInfrastructureSubsystemService } from './common-infrastructure-subsystem.service';

@Module({
  imports: [],
  controllers: [CommonInfrastructureSubsystemController],
  providers: [CommonInfrastructureSubsystemService],
})
export class CommonInfrastructureSubsystemModule {}
