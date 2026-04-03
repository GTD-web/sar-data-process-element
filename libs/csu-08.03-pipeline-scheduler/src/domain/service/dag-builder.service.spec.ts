import { DagBuilderService } from './dag-builder.service';
import { ProductLevel, TargetCsc, StepStatus } from '@sdpe/shared';

describe('DagBuilderService', () => {
  let service: DagBuilderService;

  beforeEach(() => {
    service = new DagBuilderService();
  });

  describe('buildFullDag', () => {
    it('5개의 파이프라인 단계를 순서대로 생성 (CSC-02 → CSC-06)', () => {
      const steps = service.buildFullDag();

      expect(steps).toHaveLength(5);
      expect(steps[0]).toMatchObject({ order: 1, targetCsc: TargetCsc.CSC_02, productLevel: ProductLevel.LEVEL_0 });
      expect(steps[1]).toMatchObject({ order: 2, targetCsc: TargetCsc.CSC_03, productLevel: ProductLevel.LEVEL_0 });
      expect(steps[2]).toMatchObject({ order: 3, targetCsc: TargetCsc.CSC_04, productLevel: ProductLevel.LEVEL_1 });
      expect(steps[3]).toMatchObject({ order: 4, targetCsc: TargetCsc.CSC_05, productLevel: ProductLevel.LEVEL_2 });
      expect(steps[4]).toMatchObject({ order: 5, targetCsc: TargetCsc.CSC_06, productLevel: ProductLevel.LEVEL_3 });
    });

    it('모든 단계가 PENDING 상태로 생성', () => {
      const steps = service.buildFullDag();

      for (const step of steps) {
        expect(step.status).toBe(StepStatus.PENDING);
      }
    });
  });

  describe('buildPartialDag', () => {
    it('LEVEL_1부터 재처리 시 order 1,2는 SKIPPED, order 3부터 PENDING', () => {
      const steps = service.buildPartialDag(ProductLevel.LEVEL_1);

      expect(steps).toHaveLength(5);
      // targetIndex=2, def.order <= 2 → order 1,2 skip
      expect(steps[0]!.status).toBe(StepStatus.SKIPPED);
      expect(steps[1]!.status).toBe(StepStatus.SKIPPED);
      expect(steps[2]!.status).toBe(StepStatus.PENDING);
      expect(steps[3]!.status).toBe(StepStatus.PENDING);
      expect(steps[4]!.status).toBe(StepStatus.PENDING);
    });

    it('LEVEL_2부터 재처리 시 order 1~3은 SKIPPED', () => {
      const steps = service.buildPartialDag(ProductLevel.LEVEL_2);

      // targetIndex=3, def.order <= 3 → order 1,2,3 skip
      expect(steps[0]!.status).toBe(StepStatus.SKIPPED);
      expect(steps[1]!.status).toBe(StepStatus.SKIPPED);
      expect(steps[2]!.status).toBe(StepStatus.SKIPPED);
      expect(steps[3]!.status).toBe(StepStatus.PENDING);
      expect(steps[4]!.status).toBe(StepStatus.PENDING);
    });

    it('LEVEL_0부터 재처리 시 모든 단계 PENDING (targetIndex=0, order<=0 없음)', () => {
      const steps = service.buildPartialDag(ProductLevel.LEVEL_0);

      // targetIndex=0, def.order <= 0 → 모든 order >= 1이므로 skip 없음
      expect(steps[0]!.status).toBe(StepStatus.PENDING);
      expect(steps[1]!.status).toBe(StepStatus.PENDING);
    });

    it('존재하지 않는 레벨이면 에러', () => {
      expect(() => service.buildPartialDag('LEVEL_99' as ProductLevel)).toThrow('Unknown target level');
    });
  });
});
