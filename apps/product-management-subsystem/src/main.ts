import { NestFactory } from '@nestjs/core';
import { ProductManagementSubsystemModule } from './product-management-subsystem.module';

async function bootstrap() {
  const app = await NestFactory.create(ProductManagementSubsystemModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
