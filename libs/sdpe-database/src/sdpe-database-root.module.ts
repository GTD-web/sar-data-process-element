import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';

/**
 * Registers TypeORM at application root. Use only in each deployable app's AppModule.
 * When `DATABASE_URL` is unset, omit this module so tests and minimal runs skip DB.
 */
@Module({})
export class SdpeDatabaseRootModule {
  static forRootAsync(options: TypeOrmModuleAsyncOptions): DynamicModule {
    return {
      module: SdpeDatabaseRootModule,
      imports: [TypeOrmModule.forRootAsync(options)],
      exports: [TypeOrmModule],
    };
  }
}
