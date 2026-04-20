import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Job, JobId, JobStatus } from '@sdpe/shared';
import type { IJobRepository } from '@sdpe/task-queue';
import { JobEntity } from '../entities';

/**
 * IJobRepository 포트의 TypeORM 구현체 (@sdpe/task-queue).
 * Job 도메인 모델의 CRUD를 JobEntity를 통해 PostgreSQL에 위임한다.
 */
@Injectable()
export class TypeOrmJobRepository implements IJobRepository {
  constructor(
    @InjectRepository(JobEntity)
    private readonly repo: Repository<JobEntity>,
  ) {}

  async save(job: Job): Promise<void> {
    const entity = JobEntity.fromDomain(job);
    await this.repo.save(entity);
  }

  async findById(id: JobId): Promise<Job | null> {
    const entity = await this.repo.findOneBy({ id: id as string });
    return entity?.toDomain() ?? null;
  }

  async findByEventId(eventId: string): Promise<Job | null> {
    const entity = await this.repo.findOneBy({ eventId });
    return entity?.toDomain() ?? null;
  }

  async findByStatus(status: JobStatus): Promise<Job[]> {
    const entities = await this.repo.findBy({ status });
    return entities.map((e) => e.toDomain());
  }
}
