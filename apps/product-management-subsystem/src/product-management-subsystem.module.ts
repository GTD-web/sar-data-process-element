import { Module } from '@nestjs/common';
import { ProductManagementSubsystemController } from './product-management-subsystem.controller';
import { ProductManagementSubsystemService } from './product-management-subsystem.service';

@Module({
  imports: [],
  controllers: [ProductManagementSubsystemController],
  providers: [ProductManagementSubsystemService],
})
export class ProductManagementSubsystemModule {}
