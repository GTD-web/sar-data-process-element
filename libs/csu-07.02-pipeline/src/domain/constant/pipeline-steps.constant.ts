import type { ProductLevel, TargetCsc } from '@sdpe/shared';

export interface PipelineStepDefinition {
  readonly order: number;
  readonly targetCsc: TargetCsc;
  readonly productLevel: ProductLevel;
}

/** 기본 파이프라인 단계 순서 (CSC-02 → CSC-06) */
export const DEFAULT_PIPELINE_STEPS: readonly PipelineStepDefinition[] = [
  { order: 1, targetCsc: 'CSC-02', productLevel: 'LEVEL_0' },
  { order: 2, targetCsc: 'CSC-03', productLevel: 'LEVEL_0' },
  { order: 3, targetCsc: 'CSC-04', productLevel: 'LEVEL_1' },
  { order: 4, targetCsc: 'CSC-05', productLevel: 'LEVEL_2' },
  { order: 5, targetCsc: 'CSC-06', productLevel: 'LEVEL_3' },
] as const;
