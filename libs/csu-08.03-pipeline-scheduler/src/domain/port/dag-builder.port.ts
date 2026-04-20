import type { ProductLevel, PipelineStep } from '@sdpe/shared';

export const DAG_BUILDER = Symbol('DAG_BUILDER');

/**
 * 파이프라인 DAG(Directed Acyclic Graph) 생성 포트.
 * - buildFullDag: 전체 파이프라인 (LEVEL_0 → LEVEL_3)
 * - buildPartialDag: 재처리 시 특정 레벨부터의 부분 DAG
 */
export interface IDagBuilder {
  buildFullDag(): PipelineStep[];
  buildPartialDag(targetLevel: ProductLevel): PipelineStep[];
}
