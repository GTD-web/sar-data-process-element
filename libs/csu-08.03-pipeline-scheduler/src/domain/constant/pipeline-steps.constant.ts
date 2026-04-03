import { ProductLevel, TargetCsc } from '@sdpe/shared';

/** 파이프라인 단계 정의. order는 실행 순서, targetCsc는 처리 담당 컴포넌트 */
export interface PipelineStepDefinition {
  readonly order: number;
  readonly targetCsc: TargetCsc;
  readonly productLevel: ProductLevel;
}

/**
 * 기본 파이프라인 단계 순서 (ICD 6.5).
 * 각 CSC가 이전 단계의 산출물을 입력으로 받아 다음 레벨을 생성한다.
 *   CSC-02: 원시 데이터 수신 → LEVEL_0
 *   CSC-03: Range Compression → LEVEL_0 (압축)
 *   CSC-04: SAR 처리 → LEVEL_1
 *   CSC-05: 후처리 → LEVEL_2
 *   CSC-06: 최종 산출물 → LEVEL_3
 */
export const DEFAULT_PIPELINE_STEPS: readonly PipelineStepDefinition[] = [
  { order: 1, targetCsc: TargetCsc.CSC_02, productLevel: ProductLevel.LEVEL_0 },
  { order: 2, targetCsc: TargetCsc.CSC_03, productLevel: ProductLevel.LEVEL_0 },
  { order: 3, targetCsc: TargetCsc.CSC_04, productLevel: ProductLevel.LEVEL_1 },
  { order: 4, targetCsc: TargetCsc.CSC_05, productLevel: ProductLevel.LEVEL_2 },
  { order: 5, targetCsc: TargetCsc.CSC_06, productLevel: ProductLevel.LEVEL_3 },
] as const;
