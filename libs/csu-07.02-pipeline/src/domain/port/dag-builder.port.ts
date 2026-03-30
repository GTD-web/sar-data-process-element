import type { ProductLevel, PipelineStep } from '@sdpe/shared';

export const DAG_BUILDER = Symbol('DAG_BUILDER');

export interface IDagBuilder {
  buildFullDag(): PipelineStep[];
  buildPartialDag(targetLevel: ProductLevel): PipelineStep[];
}
