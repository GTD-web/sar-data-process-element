import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { createJobId } from '@sdpe/shared';
import { JOB_REPOSITORY, type IJobRepository } from '@sdpe/job';
import type { JobStatusResult } from '../../interfaces/csc07-orchestrator-context.interface';

export class GetJobStatusQuery {
  constructor(public readonly jobId: string) {}
}

@QueryHandler(GetJobStatusQuery)
export class GetJobStatusHandler implements IQueryHandler<GetJobStatusQuery> {
  constructor(@Inject(JOB_REPOSITORY) private readonly jobRepository: IJobRepository) {}

  async execute(query: GetJobStatusQuery): Promise<JobStatusResult | null> {
    const job = await this.jobRepository.findById(createJobId(query.jobId));
    if (!job) return null;

    return {
      jobId: job.id,
      status: job.status,
      retryCount: job.retryCount,
      currentTargetCsc: job.currentTargetCsc,
      currentProductLevel: job.currentProductLevel,
    };
  }
}
