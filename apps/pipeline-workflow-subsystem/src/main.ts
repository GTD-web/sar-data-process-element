import { NestFactory } from '@nestjs/core';
import { PipelineWorkflowSubsystemModule } from './pipeline-workflow-subsystem.module';

async function bootstrap() {
  const app = await NestFactory.create(PipelineWorkflowSubsystemModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
