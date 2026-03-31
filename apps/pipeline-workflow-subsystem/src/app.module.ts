import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SdpeDatabaseRootModule } from '@sdpe/database';
import { Csc06PipelineModule } from './csc06-pipeline/csc06-pipeline.module';
import { Csc08OrchestratorContextModule } from './context/csc08-orchestrator-context/csc08-orchestrator-context.module';

const databaseUrl = process.env.DATABASE_URL;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ...(databaseUrl !== undefined && databaseUrl.length > 0
      ? [
          SdpeDatabaseRootModule.forRootAsync({
            useFactory: () => ({
              type: 'postgres' as const,
              url: databaseUrl,
              autoLoadEntities: true,
              synchronize: false,
              logging: process.env.TYPEORM_LOGGING === 'true',
            }),
          }),
        ]
      : []),
    Csc06PipelineModule,
    Csc08OrchestratorContextModule,
  ],
})
export class AppModule {}
