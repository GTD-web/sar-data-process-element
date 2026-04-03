import type { PipelineExecution, PipelineStep } from '@sdpe/shared';

export const STEP_RESOLVER = Symbol('STEP_RESOLVER');

/**
 * 현재 파이프라인 실행 상태에서 다음에 실행할 단계를 결정하는 포트.
 * 단계 완료 후 다음 CSC로의 전환 로직을 캡슐화한다.
 */
export interface IStepResolver {
  /** 다음 대기(PENDING) 단계를 반환. 모든 단계가 완료되었으면 null */
  resolveNextStep(execution: PipelineExecution): PipelineStep | null;
  isLastStep(execution: PipelineExecution): boolean;
}
