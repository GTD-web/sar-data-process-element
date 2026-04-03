import type { ProductLevel, TargetCsc } from '../interface/common';
import { StepStatus } from '../type/step-status.type';

/**
 * 파이프라인 단계. 하나의 CSC가 수행하는 처리 단위를 나타낸다.
 * 예: order=3, targetCsc='CSC-04', productLevel='LEVEL_1' → CSC-04가 Level-1 처리 수행
 *
 * 상태 전이: PENDING → IN_PROGRESS → COMPLETED | FAILED
 *            PENDING → SKIPPED (재처리 시 이전 단계 건너뛰기)
 */
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
