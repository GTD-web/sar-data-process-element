import type { PipelineExecution, PipelineStep } from '@sdpe/shared';

export const STEP_RESOLVER = Symbol('STEP_RESOLVER');

export interface IStepResolver {
  resolveNextStep(execution: PipelineExecution): PipelineStep | null;
  isLastStep(execution: PipelineExecution): boolean;
}
