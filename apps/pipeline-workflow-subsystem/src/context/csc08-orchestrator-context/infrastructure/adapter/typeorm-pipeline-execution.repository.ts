import { Injectable, Logger } from '@nestjs/common';
import type { PipelineExecution } from '@sdpe/shared';
import type { IPipelineExecutionRepository } from '@sdpe/pipeline-scheduler';

@Injectable()
export class TypeOrmPipelineExecutionRepository implements IPipelineExecutionRepository {
  private readonly logger = new Logger(TypeOrmPipelineExecutionRepository.name);

  async save(execution: PipelineExecution): Promise<void> {
    this.logger.debug(`[STUB] Saving pipeline execution: ${execution.id}`);
  }

  async findById(id: string): Promise<PipelineExecution | null> {
    this.logger.debug(`[STUB] Finding execution by id: ${id}`);
    return null;
  }

  async findByJobId(jobId: string): Promise<PipelineExecution | null> {
    this.logger.debug(`[STUB] Finding execution by jobId: ${jobId}`);
    return null;
  }
}
