import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { IAuditLogWriter, IAuditLogReader, AuditEvent } from '@sdpe/audit-log';
import { AuditEventEntity } from '../entities';

/**
 * IAuditLogWriter 및 IAuditLogReader 포트의 TypeORM 구현체 (@sdpe/audit-log).
 * 감사 이벤트의 기록과 Job ID 기반 조회를 제공한다 (CSU-08.06).
 */
@Injectable()
export class TypeOrmAuditLogRepository implements IAuditLogWriter, IAuditLogReader {
  constructor(
    @InjectRepository(AuditEventEntity)
    private readonly repo: Repository<AuditEventEntity>,
  ) {}

  async write(event: AuditEvent): Promise<void> {
    const entity = AuditEventEntity.fromDomain(event);
    await this.repo.save(entity);
  }

  async findByJobId(jobId: string): Promise<AuditEvent[]> {
    const entities = await this.repo.find({
      where: { jobId },
      order: { timestamp: 'ASC' },
    });
    return entities.map((e) => e.toDomain());
  }
}
