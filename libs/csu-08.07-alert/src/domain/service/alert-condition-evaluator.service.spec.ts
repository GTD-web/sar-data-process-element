import { AlertConditionEvaluatorService } from './alert-condition-evaluator.service';
import { AlertType } from '../type/alert-type.type';
import { ALERT_THRESHOLD } from '../constant/alert-threshold.constant';

describe('AlertConditionEvaluatorService', () => {
  let service: AlertConditionEvaluatorService;

  beforeEach(() => {
    service = new AlertConditionEvaluatorService();
  });

  describe('evaluateRetryExhausted', () => {
    it('retryCount >= 3이면 RETRY_EXHAUSTED Alert 생성', () => {
      const payload = service.evaluateRetryExhausted('job-1', 3);

      expect(payload).not.toBeNull();
      expect(payload!.alertType).toBe(AlertType.RETRY_EXHAUSTED);
      expect(payload!.jobId).toBe('job-1');
      expect(payload!.message).toContain('3 retries');
      expect(payload!.details).toEqual({ retryCount: 3 });
      expect(payload!.timestamp).toBeInstanceOf(Date);
    });

    it('retryCount < 3이면 null 반환', () => {
      expect(service.evaluateRetryExhausted('job-1', 2)).toBeNull();
      expect(service.evaluateRetryExhausted('job-1', 0)).toBeNull();
    });
  });

  describe('evaluatePipelineDelay', () => {
    it('경과 시간이 임계값 이상이면 PIPELINE_DELAYED Alert 생성', () => {
      const payload = service.evaluatePipelineDelay('job-1', ALERT_THRESHOLD.PIPELINE_DELAY_SEC);

      expect(payload).not.toBeNull();
      expect(payload!.alertType).toBe(AlertType.PIPELINE_DELAYED);
      expect(payload!.jobId).toBe('job-1');
    });

    it('경과 시간이 임계값 미만이면 null 반환', () => {
      const payload = service.evaluatePipelineDelay('job-1', ALERT_THRESHOLD.PIPELINE_DELAY_SEC - 1);

      expect(payload).toBeNull();
    });
  });
});
