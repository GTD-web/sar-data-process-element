import type { PipelineExecution } from '@sdpe/shared';

export const PIPELINE_EXECUTION_REPOSITORY = Symbol('PIPELINE_EXECUTION_REPOSITORY');

export interface IPipelineExecutionRepository {
  save(execution: PipelineExecution): Promise<void>;
  findById(id: string): Promise<PipelineExecution | null>;
  findByJobId(jobId: string): Promise<PipelineExecution | null>;
}
