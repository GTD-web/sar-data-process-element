import { Module } from '@nestjs/common';
import { SarProcessingSubsystemController } from './sar-processing-subsystem.controller';
import { SarProcessingSubsystemService } from './sar-processing-subsystem.service';

@Module({
  imports: [],
  controllers: [SarProcessingSubsystemController],
  providers: [SarProcessingSubsystemService],
})
export class SarProcessingSubsystemModule {}
