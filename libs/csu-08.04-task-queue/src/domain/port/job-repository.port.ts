import type { Job, JobId, JobStatus } from '@sdpe/shared';

export const JOB_REPOSITORY = Symbol('JOB_REPOSITORY');

/** Job(작업) 엔티티 영속화 포트. Job은 하나의 파이프라인 실행 단위를 나타낸다 */
export interface IJobRepository {
  save(job: Job): Promise<void>;
  findById(id: JobId): Promise<Job | null>;
  findByEventId(eventId: string): Promise<Job | null>;
  findByStatus(status: JobStatus): Promise<Job[]>;
}
