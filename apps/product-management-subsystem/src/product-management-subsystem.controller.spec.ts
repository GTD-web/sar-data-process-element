import { Test, TestingModule } from '@nestjs/testing';
import { ProductManagementSubsystemController } from './product-management-subsystem.controller';
import { ProductManagementSubsystemService } from './product-management-subsystem.service';

describe('ProductManagementSubsystemController', () => {
  let productManagementSubsystemController: ProductManagementSubsystemController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ProductManagementSubsystemController],
      providers: [ProductManagementSubsystemService],
    }).compile();

    productManagementSubsystemController = app.get<ProductManagementSubsystemController>(
      ProductManagementSubsystemController,
    );
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(productManagementSubsystemController.getHello()).toBe('Hello World!');
    });
  });
});
