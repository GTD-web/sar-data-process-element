import type { Job, JobId, JobStatus } from '@sdpe/shared';

export const JOB_REPOSITORY = Symbol('JOB_REPOSITORY');

export interface IJobRepository {
  save(job: Job): Promise<void>;
  findById(id: JobId): Promise<Job | null>;
  findByEventId(eventId: string): Promise<Job | null>;
  findByStatus(status: JobStatus): Promise<Job[]>;
}
