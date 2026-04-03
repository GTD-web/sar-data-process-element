import { Test } from '@nestjs/testing';
import { JobFailedAlertEvent, JobFailedAlertHandler } from './job-failed-alert.handler';
import { StepCompletedAuditEvent, StepCompletedAuditHandler } from './step-completed-audit.handler';
import { ALERT_DISPATCHER, type IAlertDispatcher, ALERT_CONDITION_EVALUATOR, type IAlertConditionEvaluator, AlertType } from '@sdpe/alert';
import { AUDIT_LOG_WRITER, type IAuditLogWriter, AuditEventType } from '@sdpe/audit-log';
import { ProductLevel, TargetCsc } from '@sdpe/shared';

describe('Event Handlers', () => {
  describe('JobFailedAlertHandler', () => {
    let handler: JobFailedAlertHandler;
    let mockAlertDispatcher: jest.Mocked<IAlertDispatcher>;
    let mockAlertConditionEvaluator: jest.Mocked<IAlertConditionEvaluator>;

    beforeEach(async () => {
      mockAlertDispatcher = { dispatch: jest.fn() };
      mockAlertConditionEvaluator = { evaluateRetryExhausted: jest.fn(), evaluatePipelineDelay: jest.fn() };

      const module = await Test.createTestingModule({
        providers: [
          JobFailedAlertHandler,
          { provide: ALERT_DISPATCHER, useValue: mockAlertDispatcher },
          { provide: ALERT_CONDITION_EVALUATOR, useValue: mockAlertConditionEvaluator },
        ],
      }).compile();

      handler = module.get(JobFailedAlertHandler);
    });

    it('Alert 조건 충족 시 dispatch 호출', async () => {
      const payload = {
        alertType: AlertType.RETRY_EXHAUSTED,
        jobId: 'job-001',
        message: 'Retry exhausted',
        details: { retryCount: 3 },
        timestamp: new Date(),
      };
      mockAlertConditionEvaluator.evaluateRetryExhausted.mockReturnValue(payload);

      await handler.handle(new JobFailedAlertEvent('job-001', 3));

      expect(mockAlertConditionEvaluator.evaluateRetryExhausted).toHaveBeenCalledWith('job-001', 3);
      expect(mockAlertDispatcher.dispatch).toHaveBeenCalledWith(payload);
    });

    it('Alert 조건 미충족 시 dispatch 호출하지 않음', async () => {
      mockAlertConditionEvaluator.evaluateRetryExhausted.mockReturnValue(null);

      await handler.handle(new JobFailedAlertEvent('job-001', 1));

      expect(mockAlertDispatcher.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('StepCompletedAuditHandler', () => {
    let handler: StepCompletedAuditHandler;
    let mockAuditLogWriter: jest.Mocked<IAuditLogWriter>;

    beforeEach(async () => {
      mockAuditLogWriter = { write: jest.fn() };

      const module = await Test.createTestingModule({
        providers: [
          StepCompletedAuditHandler,
          { provide: AUDIT_LOG_WRITER, useValue: mockAuditLogWriter },
        ],
      }).compile();

      handler = module.get(StepCompletedAuditHandler);
    });

    it('JOB_COMPLETED 감사 로그 기록', async () => {
      await handler.handle(new StepCompletedAuditEvent('job-001', TargetCsc.CSC_04, ProductLevel.LEVEL_1));

      expect(mockAuditLogWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.JOB_COMPLETED,
          jobId: 'job-001',
          payload: { targetCsc: TargetCsc.CSC_04, productLevel: ProductLevel.LEVEL_1 },
        }),
      );
    });
  });
});
