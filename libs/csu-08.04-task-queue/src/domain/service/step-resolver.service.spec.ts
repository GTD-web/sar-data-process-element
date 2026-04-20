import { StepResolverService } from './step-resolver.service';
import { PipelineExecution, PipelineStep, ProductLevel, TargetCsc } from '@sdpe/shared';

function createExecution(steps: PipelineStep[]): PipelineExecution {
  return PipelineExecution.create('exec-1', 'job-1', steps);
}

function createFullSteps(): PipelineStep[] {
  return [
    new PipelineStep(1, TargetCsc.CSC_02, ProductLevel.LEVEL_0),
    new PipelineStep(2, TargetCsc.CSC_03, ProductLevel.LEVEL_0),
    new PipelineStep(3, TargetCsc.CSC_04, ProductLevel.LEVEL_1),
  ];
}

describe('StepResolverService', () => {
  let service: StepResolverService;

  beforeEach(() => {
    service = new StepResolverService();
  });

  describe('resolveNextStep', () => {
    it('첫 번째 PENDING 단계를 반환', () => {
      const execution = createExecution(createFullSteps());

      const next = service.resolveNextStep(execution);

      expect(next?.targetCsc).toBe(TargetCsc.CSC_02);
    });

    it('완료된 단계 이후 다음 PENDING 단계를 반환', () => {
      const steps = createFullSteps();
      steps[0]!.start();
      steps[0]!.complete();
      const execution = createExecution(steps);

      const next = service.resolveNextStep(execution);

      expect(next?.targetCsc).toBe(TargetCsc.CSC_03);
    });

    it('모든 단계가 완료되면 null 반환', () => {
      const steps = createFullSteps();
      for (const step of steps) {
        step.start();
        step.complete();
      }
      const execution = createExecution(steps);

      expect(service.resolveNextStep(execution)).toBeNull();
    });
  });

  describe('isLastStep', () => {
    it('PENDING 단계가 남아있으면 false', () => {
      const execution = createExecution(createFullSteps());

      expect(service.isLastStep(execution)).toBe(false);
    });

    it('모든 단계가 완료되면 true', () => {
      const steps = createFullSteps();
      for (const step of steps) {
        step.start();
        step.complete();
      }
      const execution = createExecution(steps);

      expect(service.isLastStep(execution)).toBe(true);
    });
  });
});
