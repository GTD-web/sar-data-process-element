import { NestFactory } from '@nestjs/core';
import { PostProcessingToolModule } from './post-processing-tool.module';

async function bootstrap() {
  const app = await NestFactory.create(PostProcessingToolModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
