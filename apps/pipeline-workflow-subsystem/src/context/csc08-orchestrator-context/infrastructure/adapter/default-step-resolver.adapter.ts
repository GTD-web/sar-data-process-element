import { Injectable } from '@nestjs/common';
import type { PipelineExecution, PipelineStep } from '@sdpe/shared';
import type { IStepResolver } from '@sdpe/task-queue';

@Injectable()
export class DefaultStepResolverAdapter implements IStepResolver {
  resolveNextStep(execution: PipelineExecution): PipelineStep | null {
    return execution.nextPendingStep;
  }

  isLastStep(execution: PipelineExecution): boolean {
    return execution.nextPendingStep === null;
  }
}
