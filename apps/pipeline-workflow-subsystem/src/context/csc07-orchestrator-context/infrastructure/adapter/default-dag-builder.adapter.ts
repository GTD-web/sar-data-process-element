import { Injectable } from '@nestjs/common';
import { type ProductLevel, PipelineStep } from '@sdpe/shared';
import { type IDagBuilder, DEFAULT_PIPELINE_STEPS } from '@sdpe/pipeline';

@Injectable()
export class DefaultDagBuilderAdapter implements IDagBuilder {
  buildFullDag(): PipelineStep[] {
    return DEFAULT_PIPELINE_STEPS.map(
      (def) => new PipelineStep(def.order, def.targetCsc, def.productLevel),
    );
  }

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
