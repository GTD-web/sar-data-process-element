import { NestFactory } from '@nestjs/core';
import { DataCollectingSubsystemModule } from './data-collecting-subsystem.module';

async function bootstrap() {
  const app = await NestFactory.create(DataCollectingSubsystemModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
