import { RetryEvaluatorService } from './retry-evaluator.service';
import { RETRY_POLICY } from '../constant/retry-policy.constant';

describe('RetryEvaluatorService', () => {
  let service: RetryEvaluatorService;

  beforeEach(() => {
    service = new RetryEvaluatorService();
  });

  it('retryCount=0이면 재시도 가능', () => {
    const decision = service.evaluate(0);

    expect(decision.shouldRetry).toBe(true);
    expect(decision.shouldAlert).toBe(false);
    expect(decision.reason).toContain('1/3');
  });

  it('retryCount=1이면 재시도 가능', () => {
    const decision = service.evaluate(1);

    expect(decision.shouldRetry).toBe(true);
    expect(decision.shouldAlert).toBe(false);
    expect(decision.reason).toContain('2/3');
  });

  it('retryCount=2이면 재시도 가능 (마지막 재시도)', () => {
    const decision = service.evaluate(2);

    expect(decision.shouldRetry).toBe(true);
    expect(decision.shouldAlert).toBe(false);
    expect(decision.reason).toContain('3/3');
  });

  it('retryCount=3이면 재시도 불가, Alert 발행', () => {
    const decision = service.evaluate(RETRY_POLICY.MAX_RETRY_COUNT);

    expect(decision.shouldRetry).toBe(false);
    expect(decision.shouldAlert).toBe(true);
    expect(decision.reason).toContain('Max retry count');
  });

  it('retryCount > MAX_RETRY_COUNT여도 재시도 불가', () => {
    const decision = service.evaluate(10);

    expect(decision.shouldRetry).toBe(false);
    expect(decision.shouldAlert).toBe(true);
  });
});
