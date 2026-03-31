import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { IAuditLogWriter } from './domain/port/audit-log-writer.port';
import { AUDIT_LOG_WRITER } from './domain/port/audit-log-writer.port';
import type { IAuditLogReader } from './domain/port/audit-log-reader.port';
import { AUDIT_LOG_READER } from './domain/port/audit-log-reader.port';

export interface SdpeAuditLogModuleOptions {
  writer: Type<IAuditLogWriter>;
  reader: Type<IAuditLogReader>;
}

@Module({})
export class SdpeAuditLogModule {
  static forRoot(options: SdpeAuditLogModuleOptions): DynamicModule {
    return {
      module: SdpeAuditLogModule,
      providers: [
        { provide: AUDIT_LOG_WRITER, useClass: options.writer },
        { provide: AUDIT_LOG_READER, useClass: options.reader },
      ],
      exports: [AUDIT_LOG_WRITER, AUDIT_LOG_READER],
    };
  }
}
