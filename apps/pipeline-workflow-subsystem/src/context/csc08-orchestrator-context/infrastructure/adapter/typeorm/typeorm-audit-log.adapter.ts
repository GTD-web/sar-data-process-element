import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { IAuditLogWriter, IAuditLogReader, AuditEvent } from '@sdpe/audit-log';
import { AuditEventEntity } from '@sdpe/database';

@Injectable()
export class TypeOrmAuditLogAdapter implements IAuditLogWriter, IAuditLogReader {
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
