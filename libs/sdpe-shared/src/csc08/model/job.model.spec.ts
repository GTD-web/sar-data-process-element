import { Job, type CreateJobParams } from './job.model';
import { JobStatus } from '../type/job-status.type';
import { ProductLevel } from '../type/product-level.type';
import { TargetCsc } from '../type/target-csc.type';
import { createJobId } from '../type/job-id.type';

function createTestJobParams(overrides?: Partial<CreateJobParams>): CreateJobParams {
  return {
    id: createJobId('test-job-id'),
    eventId: 'event-001',
    rawDataPath: '/data/raw/test.dat',
    processingProfileId: 'profile-001',
    satelliteId: 'SAT-1',
    mode: 'STRIPMAP',
    ...overrides,
  };
}

describe('Job', () => {
  describe('create', () => {
    it('초기 상태는 CREATED, retryCount=0, 할당 정보 없음', () => {
      const job = Job.create(createTestJobParams());

      expect(job.id).toBe('test-job-id');
      expect(job.eventId).toBe('event-001');
      expect(job.rawDataPath).toBe('/data/raw/test.dat');
      expect(job.processingProfileId).toBe('profile-001');
      expect(job.satelliteId).toBe('SAT-1');
      expect(job.mode).toBe('STRIPMAP');
      expect(job.status).toBe(JobStatus.CREATED);
      expect(job.retryCount).toBe(0);
      expect(job.currentTargetCsc).toBeNull();
      expect(job.currentProductLevel).toBeNull();
      expect(job.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('assign', () => {
    it('CREATED 상태에서 CSC와 레벨을 할당하면 ASSIGNED로 전이', () => {
      const job = Job.create(createTestJobParams());

      job.assign(TargetCsc.CSC_03, ProductLevel.LEVEL_0);

      expect(job.status).toBe(JobStatus.ASSIGNED);
      expect(job.currentTargetCsc).toBe(TargetCsc.CSC_03);
      expect(job.currentProductLevel).toBe(ProductLevel.LEVEL_0);
    });

    it('FAILED 상태에서 재할당 가능 (재시도)', () => {
      const job = Job.create(createTestJobParams());
      job.assign(TargetCsc.CSC_03, ProductLevel.LEVEL_0);
      job.fail();

      job.assign(TargetCsc.CSC_03, ProductLevel.LEVEL_0);

      expect(job.status).toBe(JobStatus.ASSIGNED);
    });

    it('ASSIGNED 상태에서 assign 호출 시 에러', () => {
      const job = Job.create(createTestJobParams());
      job.assign(TargetCsc.CSC_03, ProductLevel.LEVEL_0);

      expect(() => job.assign(TargetCsc.CSC_04, ProductLevel.LEVEL_1)).toThrow(
        "Cannot assign job in status 'ASSIGNED'",
      );
    });

    it('COMPLETED 상태에서 assign 호출 시 에러', () => {
      const job = Job.create(createTestJobParams());
      job.assign(TargetCsc.CSC_03, ProductLevel.LEVEL_0);
      job.complete();

      expect(() => job.assign(TargetCsc.CSC_04, ProductLevel.LEVEL_1)).toThrow(
        "Cannot assign job in status 'COMPLETED'",
      );
    });
  });

  describe('complete', () => {
    it('ASSIGNED 상태에서 완료 처리', () => {
      const job = Job.create(createTestJobParams());
      job.assign(TargetCsc.CSC_03, ProductLevel.LEVEL_0);

      job.complete();

      expect(job.status).toBe(JobStatus.COMPLETED);
    });

    it('CREATED 상태에서 complete 호출 시 에러', () => {
      const job = Job.create(createTestJobParams());

      expect(() => job.complete()).toThrow("Cannot complete job in status 'CREATED'");
    });
  });

  describe('fail', () => {
    it('ASSIGNED 상태에서 실패 처리하면 retryCount 증가', () => {
      const job = Job.create(createTestJobParams());
      job.assign(TargetCsc.CSC_03, ProductLevel.LEVEL_0);

      job.fail();

      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.retryCount).toBe(1);
    });

    it('재시도마다 retryCount가 누적됨', () => {
      const job = Job.create(createTestJobParams());

      // 1차 시도 → 실패
      job.assign(TargetCsc.CSC_03, ProductLevel.LEVEL_0);
      job.fail();
      expect(job.retryCount).toBe(1);

      // 2차 시도 → 실패
      job.assign(TargetCsc.CSC_03, ProductLevel.LEVEL_0);
      job.fail();
      expect(job.retryCount).toBe(2);

      // 3차 시도 → 실패
      job.assign(TargetCsc.CSC_03, ProductLevel.LEVEL_0);
      job.fail();
      expect(job.retryCount).toBe(3);
    });

    it('CREATED 상태에서 fail 호출 시 에러', () => {
      const job = Job.create(createTestJobParams());

      expect(() => job.fail()).toThrow("Cannot fail job in status 'CREATED'");
    });
  });

  describe('resetForReprocessing', () => {
    it('상태를 CREATED로 초기화하고 retryCount와 할당 정보 리셋', () => {
      const job = Job.create(createTestJobParams());
      job.assign(TargetCsc.CSC_04, ProductLevel.LEVEL_1);
      job.fail();

      job.resetForReprocessing();

      expect(job.status).toBe(JobStatus.CREATED);
      expect(job.retryCount).toBe(0);
      expect(job.currentTargetCsc).toBeNull();
      expect(job.currentProductLevel).toBeNull();
    });
  });
});
