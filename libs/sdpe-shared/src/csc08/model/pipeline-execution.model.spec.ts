import { PipelineExecution } from './pipeline-execution.model';
import { PipelineStep } from './pipeline-step.model';
import { ProductLevel } from '../type/product-level.type';
import { TargetCsc } from '../type/target-csc.type';

function createTestSteps(): PipelineStep[] {
  return [
    new PipelineStep(1, TargetCsc.CSC_02, ProductLevel.LEVEL_0),
    new PipelineStep(2, TargetCsc.CSC_03, ProductLevel.LEVEL_0),
    new PipelineStep(3, TargetCsc.CSC_04, ProductLevel.LEVEL_1),
    new PipelineStep(4, TargetCsc.CSC_05, ProductLevel.LEVEL_2),
    new PipelineStep(5, TargetCsc.CSC_06, ProductLevel.LEVEL_3),
  ];
}

describe('PipelineExecution', () => {
  describe('create', () => {
    it('id, jobId, steps를 갖는 실행 이력 생성', () => {
      const steps = createTestSteps();
      const execution = PipelineExecution.create('exec-1', 'job-1', steps);

      expect(execution.id).toBe('exec-1');
      expect(execution.jobId).toBe('job-1');
      expect(execution.steps).toHaveLength(5);
      expect(execution.createdAt).toBeInstanceOf(Date);
    });

    it('빈 steps 배열이면 에러', () => {
      expect(() => PipelineExecution.create('exec-1', 'job-1', [])).toThrow(
        'PipelineExecution must have at least one step.',
      );
    });
  });

  describe('currentStep', () => {
    it('IN_PROGRESS 상태인 단계를 반환', () => {
      const steps = createTestSteps();
      steps[0]!.start();
      const execution = PipelineExecution.create('exec-1', 'job-1', steps);

      expect(execution.currentStep).toBe(steps[0]);
    });

    it('IN_PROGRESS 상태인 단계가 없으면 null', () => {
      const steps = createTestSteps();
      const execution = PipelineExecution.create('exec-1', 'job-1', steps);

      expect(execution.currentStep).toBeNull();
    });
  });

  describe('nextPendingStep', () => {
    it('첫 번째 PENDING 단계를 반환', () => {
      const steps = createTestSteps();
      const execution = PipelineExecution.create('exec-1', 'job-1', steps);

      expect(execution.nextPendingStep).toBe(steps[0]);
    });

    it('첫 단계가 완료되면 두 번째 PENDING 단계를 반환', () => {
      const steps = createTestSteps();
      steps[0]!.start();
      steps[0]!.complete();
      const execution = PipelineExecution.create('exec-1', 'job-1', steps);

      expect(execution.nextPendingStep).toBe(steps[1]);
    });

    it('모든 단계가 완료되면 null', () => {
      const steps = createTestSteps();
      for (const step of steps) {
        step.start();
        step.complete();
      }
      const execution = PipelineExecution.create('exec-1', 'job-1', steps);

      expect(execution.nextPendingStep).toBeNull();
    });
  });

  describe('isCompleted', () => {
    it('모든 단계가 COMPLETED면 true', () => {
      const steps = createTestSteps();
      for (const step of steps) {
        step.start();
        step.complete();
      }
      const execution = PipelineExecution.create('exec-1', 'job-1', steps);

      expect(execution.isCompleted).toBe(true);
    });

    it('SKIPPED + COMPLETED 조합도 true', () => {
      const steps = createTestSteps();
      steps[0]!.skip();
      steps[1]!.skip();
      steps[2]!.start();
      steps[2]!.complete();
      steps[3]!.start();
      steps[3]!.complete();
      steps[4]!.start();
      steps[4]!.complete();
      const execution = PipelineExecution.create('exec-1', 'job-1', steps);

      expect(execution.isCompleted).toBe(true);
    });

    it('PENDING 단계가 남아있으면 false', () => {
      const steps = createTestSteps();
      const execution = PipelineExecution.create('exec-1', 'job-1', steps);

      expect(execution.isCompleted).toBe(false);
    });
  });

  describe('isFailed', () => {
    it('하나라도 FAILED면 true', () => {
      const steps = createTestSteps();
      steps[0]!.start();
      steps[0]!.fail();
      const execution = PipelineExecution.create('exec-1', 'job-1', steps);

      expect(execution.isFailed).toBe(true);
    });

    it('FAILED 단계 없으면 false', () => {
      const steps = createTestSteps();
      const execution = PipelineExecution.create('exec-1', 'job-1', steps);

      expect(execution.isFailed).toBe(false);
    });
  });

  describe('getStepByCsc', () => {
    it('해당 CSC의 단계를 반환', () => {
      const steps = createTestSteps();
      const execution = PipelineExecution.create('exec-1', 'job-1', steps);

      expect(execution.getStepByCsc(TargetCsc.CSC_04)?.productLevel).toBe(ProductLevel.LEVEL_1);
    });

    it('없는 CSC면 undefined', () => {
      const steps = [new PipelineStep(1, TargetCsc.CSC_03, ProductLevel.LEVEL_0)];
      const execution = PipelineExecution.create('exec-1', 'job-1', steps);

      expect(execution.getStepByCsc(TargetCsc.CSC_06)).toBeUndefined();
    });
  });

  describe('getStepByProductLevel', () => {
    it('해당 레벨의 단계를 반환', () => {
      const steps = createTestSteps();
      const execution = PipelineExecution.create('exec-1', 'job-1', steps);

      expect(execution.getStepByProductLevel(ProductLevel.LEVEL_2)?.targetCsc).toBe(TargetCsc.CSC_05);
    });
  });
});
