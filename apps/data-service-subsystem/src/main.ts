import { NestFactory } from '@nestjs/core';
import { DataServiceSubsystemModule } from './data-service-subsystem.module';

async function bootstrap() {
  const app = await NestFactory.create(DataServiceSubsystemModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
