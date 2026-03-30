import type { ProductLevel } from '@sdpe/shared';

export interface ReprocessParams {
  readonly jobId: string;
  readonly targetLevel: ProductLevel;
  readonly requestedBy: string;
}

export interface JobStatusResult {
  readonly jobId: string;
  readonly status: string;
  readonly retryCount: number;
  readonly currentTargetCsc: string | null;
  readonly currentProductLevel: string | null;
}

export interface PipelineExecutionResult {
  readonly executionId: string;
  readonly jobId: string;
  readonly steps: readonly StepResult[];
  readonly isCompleted: boolean;
}

export interface StepResult {
  readonly order: number;
  readonly targetCsc: string;
  readonly productLevel: string;
  readonly status: string;
}
