import type { ProductLevel, TargetCsc } from '../interface/common';
import { StepStatus } from '../type/step-status.type';

export class PipelineStep {
  readonly order: number;
  readonly targetCsc: TargetCsc;
  readonly productLevel: ProductLevel;

  private _status: StepStatus;
  private _startedAt: Date | null;
  private _completedAt: Date | null;

  constructor(order: number, targetCsc: TargetCsc, productLevel: ProductLevel) {
    this.order = order;
    this.targetCsc = targetCsc;
    this.productLevel = productLevel;
    this._status = StepStatus.PENDING;
    this._startedAt = null;
    this._completedAt = null;
  }

  get status(): StepStatus {
    return this._status;
  }

  get startedAt(): Date | null {
    return this._startedAt;
  }

  get completedAt(): Date | null {
    return this._completedAt;
  }

  start(): void {
    if (this._status !== StepStatus.PENDING) {
      throw new Error(`Cannot start step in status '${this._status}'. Expected 'PENDING'.`);
    }
    this._status = StepStatus.IN_PROGRESS;
    this._startedAt = new Date();
  }

  complete(): void {
    if (this._status !== StepStatus.IN_PROGRESS) {
      throw new Error(`Cannot complete step in status '${this._status}'. Expected 'IN_PROGRESS'.`);
    }
    this._status = StepStatus.COMPLETED;
    this._completedAt = new Date();
  }

  fail(): void {
    if (this._status !== StepStatus.IN_PROGRESS) {
      throw new Error(`Cannot fail step in status '${this._status}'. Expected 'IN_PROGRESS'.`);
    }
    this._status = StepStatus.FAILED;
    this._completedAt = new Date();
  }

  skip(): void {
    if (this._status !== StepStatus.PENDING) {
      throw new Error(`Cannot skip step in status '${this._status}'. Expected 'PENDING'.`);
    }
    this._status = StepStatus.SKIPPED;
  }
}
