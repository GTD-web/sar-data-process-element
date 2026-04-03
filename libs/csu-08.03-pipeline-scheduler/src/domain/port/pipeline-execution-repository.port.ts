import type { PipelineExecution } from '@sdpe/shared';

export const PIPELINE_EXECUTION_REPOSITORY = Symbol('PIPELINE_EXECUTION_REPOSITORY');

/** 파이프라인 실행 이력(단계별 진행 상태 포함) 영속화 포트 */
export interface IPipelineExecutionRepository {
  save(execution: PipelineExecution): Promise<void>;
  findById(id: string): Promise<PipelineExecution | null>;
  findByJobId(jobId: string): Promise<PipelineExecution | null>;
}
