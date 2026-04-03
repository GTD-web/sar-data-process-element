import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SdpeDatabaseRootModule } from '@sdpe/database';
import { Csc08OrchestratorModule } from './csc08-orchestrator/csc08-orchestrator.module';

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
          Csc08OrchestratorModule,
        ]
      : []),
  ],
})
export class AppModule {}
