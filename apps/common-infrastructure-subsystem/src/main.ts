import { NestFactory } from '@nestjs/core';
import { CommonInfrastructureSubsystemModule } from './common-infrastructure-subsystem.module';

async function bootstrap() {
  const app = await NestFactory.create(CommonInfrastructureSubsystemModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
