import { NestFactory } from '@nestjs/core';
import { SarProcessingSubsystemModule } from './sar-processing-subsystem.module';

async function bootstrap() {
  const app = await NestFactory.create(SarProcessingSubsystemModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
