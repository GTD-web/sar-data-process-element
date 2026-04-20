import type { ProductLevel, CscIdentifier } from '@sdpe/shared';

/** SI-07 재처리 요청 파라미터 (CSC-09 → CSC-08) */
export interface ReprocessParams {
  readonly jobId: string;
  readonly targetLevel: ProductLevel;
  readonly requestedBy: CscIdentifier;
}

/** Job 상태 조회 응답 DTO */
export interface JobStatusResult {
  readonly jobId: string;
  readonly status: string;
  readonly retryCount: number;
  readonly currentTargetCsc: string | null;
  readonly currentProductLevel: string | null;
}

/** 파이프라인 실행 이력 조회 응답 DTO */
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
