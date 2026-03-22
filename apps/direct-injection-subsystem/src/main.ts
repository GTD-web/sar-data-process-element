import { NestFactory } from '@nestjs/core';
import { DirectInjectionSubsystemModule } from './direct-injection-subsystem.module';

async function bootstrap() {
  const app = await NestFactory.create(DirectInjectionSubsystemModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
