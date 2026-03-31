import { Injectable, Logger } from '@nestjs/common';
import type { Job, JobId, JobStatus } from '@sdpe/shared';
import type { IJobRepository } from '@sdpe/task-queue';

/**
 * IJobRepository의 TypeORM 구현체 (스켈레톤).
 * 실제 TypeORM Entity 및 쿼리는 DB 스키마 확정 후 구현합니다.
 */
@Injectable()
export class TypeOrmJobRepository implements IJobRepository {
  private readonly logger = new Logger(TypeOrmJobRepository.name);

  async save(job: Job): Promise<void> {
    this.logger.debug(`[STUB] Saving job: ${job.id}`);
  }

  async findById(id: JobId): Promise<Job | null> {
    this.logger.debug(`[STUB] Finding job by id: ${id}`);
    return null;
  }

  async findByEventId(eventId: string): Promise<Job | null> {
    this.logger.debug(`[STUB] Finding job by eventId: ${eventId}`);
    return null;
  }

  async findByStatus(_status: JobStatus): Promise<Job[]> {
    this.logger.debug(`[STUB] Finding jobs by status: ${_status}`);
    return [];
  }
}
