import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';

/**
 * 애플리케이션 루트에서 TypeORM을 등록하는 모듈.
 * 각 배포 가능한 앱의 AppModule에서 한 번만 import한다.
 * DATABASE_URL이 미설정 시 이 모듈을 생략하여 DB 없이 실행할 수 있다.
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
