import type { ProductLevel, TargetCsc } from '../interface/common';
import { StepStatus } from '../type/step-status.type';
import { PipelineStep } from './pipeline-step.model';

/**
 * PipelineExecution Aggregate Root.
 * 하나의 Job에 대한 파이프라인 실행 이력으로, 단계(PipelineStep) 목록을 관리한다.
 * DAG 순서대로 각 단계가 PENDING → IN_PROGRESS → COMPLETED/FAILED/SKIPPED 상태를 거친다.
 */
export class PipelineExecution {
  readonly id: string;
  readonly jobId: string;
  readonly createdAt: Date;

  private _steps: PipelineStep[];

  private constructor(id: string, jobId: string, steps: PipelineStep[]) {
    this.id = id;
    this.jobId = jobId;
    this.createdAt = new Date();
    this._steps = steps;
  }

  static create(id: string, jobId: string, steps: PipelineStep[]): PipelineExecution {
    if (steps.length === 0) {
      throw new Error('PipelineExecution must have at least one step.');
    }
    return new PipelineExecution(id, jobId, steps);
  }

  get steps(): readonly PipelineStep[] {
    return this._steps;
  }

  get currentStep(): PipelineStep | null {
    return this._steps.find((s) => s.status === StepStatus.IN_PROGRESS) ?? null;
  }

  get nextPendingStep(): PipelineStep | null {
    return this._steps.find((s) => s.status === StepStatus.PENDING) ?? null;
  }

  get isCompleted(): boolean {
    return this._steps.every((s) => s.status === StepStatus.COMPLETED || s.status === StepStatus.SKIPPED);
  }

  get isFailed(): boolean {
    return this._steps.some((s) => s.status === StepStatus.FAILED);
  }

  getStepByCsc(targetCsc: TargetCsc): PipelineStep | undefined {
    return this._steps.find((s) => s.targetCsc === targetCsc);
  }

  getStepByProductLevel(productLevel: ProductLevel): PipelineStep | undefined {
    return this._steps.find((s) => s.productLevel === productLevel);
  }
}
