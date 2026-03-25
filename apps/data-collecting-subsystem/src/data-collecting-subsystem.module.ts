import { Module } from '@nestjs/common';
import { DataCollectingSubsystemController } from './data-collecting-subsystem.controller';
import { DataCollectingSubsystemService } from './data-collecting-subsystem.service';

@Module({
  imports: [],
  controllers: [DataCollectingSubsystemController],
  providers: [DataCollectingSubsystemService],
})
export class DataCollectingSubsystemModule {}
