import { PipelineStep } from './pipeline-step.model';
import { StepStatus } from '../type/step-status.type';
import { ProductLevel } from '../type/product-level.type';
import { TargetCsc } from '../type/target-csc.type';

describe('PipelineStep', () => {
  function createStep(): PipelineStep {
    return new PipelineStep(1, TargetCsc.CSC_03, ProductLevel.LEVEL_0);
  }

  describe('constructor', () => {
    it('초기 상태는 PENDING, 시작/완료 시간 없음', () => {
      const step = createStep();

      expect(step.order).toBe(1);
      expect(step.targetCsc).toBe(TargetCsc.CSC_03);
      expect(step.productLevel).toBe(ProductLevel.LEVEL_0);
      expect(step.status).toBe(StepStatus.PENDING);
      expect(step.startedAt).toBeNull();
      expect(step.completedAt).toBeNull();
    });
  });

  describe('start', () => {
    it('PENDING → IN_PROGRESS 전이, startedAt 설정', () => {
      const step = createStep();

      step.start();

      expect(step.status).toBe(StepStatus.IN_PROGRESS);
      expect(step.startedAt).toBeInstanceOf(Date);
    });

    it('IN_PROGRESS 상태에서 start 호출 시 에러', () => {
      const step = createStep();
      step.start();

      expect(() => step.start()).toThrow("Cannot start step in status 'IN_PROGRESS'");
    });
  });

  describe('complete', () => {
    it('IN_PROGRESS → COMPLETED 전이, completedAt 설정', () => {
      const step = createStep();
      step.start();

      step.complete();

      expect(step.status).toBe(StepStatus.COMPLETED);
      expect(step.completedAt).toBeInstanceOf(Date);
    });

    it('PENDING 상태에서 complete 호출 시 에러', () => {
      const step = createStep();

      expect(() => step.complete()).toThrow("Cannot complete step in status 'PENDING'");
    });
  });

  describe('fail', () => {
    it('IN_PROGRESS → FAILED 전이, completedAt 설정', () => {
      const step = createStep();
      step.start();

      step.fail();

      expect(step.status).toBe(StepStatus.FAILED);
      expect(step.completedAt).toBeInstanceOf(Date);
    });

    it('PENDING 상태에서 fail 호출 시 에러', () => {
      const step = createStep();

      expect(() => step.fail()).toThrow("Cannot fail step in status 'PENDING'");
    });
  });

  describe('skip', () => {
    it('PENDING → SKIPPED 전이', () => {
      const step = createStep();

      step.skip();

      expect(step.status).toBe(StepStatus.SKIPPED);
    });

    it('IN_PROGRESS 상태에서 skip 호출 시 에러', () => {
      const step = createStep();
      step.start();

      expect(() => step.skip()).toThrow("Cannot skip step in status 'IN_PROGRESS'");
    });
  });
});
