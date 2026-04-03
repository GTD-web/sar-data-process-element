import { Injectable } from '@nestjs/common';
import { type ProductLevel, PipelineStep } from '@sdpe/shared';
import type { IDagBuilder } from '../port/dag-builder.port';
import { DEFAULT_PIPELINE_STEPS } from '../constant/pipeline-steps.constant';

/**
 * DEFAULT_PIPELINE_STEPS 상수를 기반으로 DAG를 생성한다.
 * 재처리(partialDag)의 경우 targetLevel 이전 단계를 skip 처리하여
 * 해당 레벨부터 처리가 시작되도록 한다.
 */
@Injectable()
export class DagBuilderService implements IDagBuilder {
  /** 전체 파이프라인: CSC-02(LEVEL_0) → CSC-06(LEVEL_3) */
  buildFullDag(): PipelineStep[] {
    return DEFAULT_PIPELINE_STEPS.map((def) => new PipelineStep(def.order, def.targetCsc, def.productLevel));
  }

  /** 부분 DAG: targetLevel 이전 단계는 skip, 해당 레벨부터 실행 */
  buildPartialDag(targetLevel: ProductLevel): PipelineStep[] {
    const targetIndex = DEFAULT_PIPELINE_STEPS.findIndex((def) => def.productLevel === targetLevel);
    if (targetIndex === -1) {
      throw new Error(`Unknown target level: ${targetLevel}`);
    }

    return DEFAULT_PIPELINE_STEPS.map((def) => {
      const step = new PipelineStep(def.order, def.targetCsc, def.productLevel);
      if (def.order <= targetIndex) {
        step.skip();
      }
      return step;
    });
  }
}
