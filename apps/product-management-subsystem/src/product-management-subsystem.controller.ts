import { Controller, Get } from '@nestjs/common';
import { ProductManagementSubsystemService } from './product-management-subsystem.service';

@Controller()
export class ProductManagementSubsystemController {
  constructor(private readonly productManagementSubsystemService: ProductManagementSubsystemService) {}

  @Get()
  getHello(): string {
    return this.productManagementSubsystemService.getHello();
  }
}
