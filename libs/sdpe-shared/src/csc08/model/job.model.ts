import type { ProductLevel } from '../type/product-level.type';
import type { TargetCsc } from '../type/target-csc.type';
import type { JobId } from '../type/job-id.type';
import { JobStatus } from '../type/job-status.type';

export interface CreateJobParams {
  id: JobId;
  eventId: string;
  rawDataId?: string;
  rawDataPath: string;
  processingProfileId: string;
  satelliteId: string;
  mode: string;
}

/**
 * Job Aggregate Root
 *
 * 작업 생명주기를 관리합니다. 상태 전이 규칙을 자체 검증합니다.
 * - CREATED → ASSIGNED → COMPLETED
 * - CREATED → ASSIGNED → FAILED
 * - FAILED → ASSIGNED (재시도 시)
 */
export class Job {
  readonly id: JobId;
  readonly eventId: string;
  readonly rawDataId: string;
  readonly rawDataPath: string;
  readonly processingProfileId: string;
  readonly satelliteId: string;
  readonly mode: string;
  readonly createdAt: Date;

  private _status: JobStatus;
  private _retryCount: number;
  private _currentTargetCsc: TargetCsc | null;
  private _currentProductLevel: ProductLevel | null;
  private _updatedAt: Date;

  private constructor(params: CreateJobParams) {
    this.id = params.id;
    this.eventId = params.eventId;
    this.rawDataId = params.rawDataId ?? params.eventId;
    this.rawDataPath = params.rawDataPath;
    this.processingProfileId = params.processingProfileId;
    this.satelliteId = params.satelliteId;
    this.mode = params.mode;
    this.createdAt = new Date();

    this._status = JobStatus.CREATED;
    this._retryCount = 0;
    this._currentTargetCsc = null;
    this._currentProductLevel = null;
    this._updatedAt = this.createdAt;
  }

  static create(params: CreateJobParams): Job {
    return new Job(params);
  }

  get status(): JobStatus {
    return this._status;
  }

  get retryCount(): number {
    return this._retryCount;
  }

  get currentTargetCsc(): TargetCsc | null {
    return this._currentTargetCsc;
  }

  get currentProductLevel(): ProductLevel | null {
    return this._currentProductLevel;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  assign(targetCsc: TargetCsc, productLevel: ProductLevel): void {
    if (this._status !== JobStatus.CREATED && this._status !== JobStatus.FAILED) {
      throw new Error(`Cannot assign job in status '${this._status}'. Expected 'CREATED' or 'FAILED'.`);
    }
    this._status = JobStatus.ASSIGNED;
    this._currentTargetCsc = targetCsc;
    this._currentProductLevel = productLevel;
    this._updatedAt = new Date();
  }

  complete(): void {
    if (this._status !== JobStatus.ASSIGNED) {
      throw new Error(`Cannot complete job in status '${this._status}'. Expected 'ASSIGNED'.`);
    }
    this._status = JobStatus.COMPLETED;
    this._updatedAt = new Date();
  }

  fail(): void {
    if (this._status !== JobStatus.ASSIGNED) {
      throw new Error(`Cannot fail job in status '${this._status}'. Expected 'ASSIGNED'.`);
    }
    this._status = JobStatus.FAILED;
    this._retryCount += 1;
    this._updatedAt = new Date();
  }

  resetForReprocessing(): void {
    this._status = JobStatus.CREATED;
    this._retryCount = 0;
    this._currentTargetCsc = null;
    this._currentProductLevel = null;
    this._updatedAt = new Date();
  }
}
