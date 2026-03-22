import { Module } from '@nestjs/common';
import { DataServiceSubsystemController } from './data-service-subsystem.controller';
import { DataServiceSubsystemService } from './data-service-subsystem.service';

@Module({
  imports: [],
  controllers: [DataServiceSubsystemController],
  providers: [DataServiceSubsystemService],
})
export class DataServiceSubsystemModule {}
