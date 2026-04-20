import { Injectable, Logger } from '@nestjs/common';
import type { IAlertDispatcher, AlertPayload } from '@sdpe/alert';

/**
 * 콘솔 기반 알림 디스패처 (개발용 placeholder).
 * {@link IAlertDispatcher}를 구현하며, 운영 환경에서는 이메일/Slack 등 실제 채널로 교체한다 (EI-03).
 */
@Injectable()
export class ConsoleAlertDispatcherService implements IAlertDispatcher {
  private readonly logger = new Logger(ConsoleAlertDispatcherService.name);

  async dispatch(payload: AlertPayload): Promise<void> {
    this.logger.warn(`[ALERT] type=${payload.alertType} job=${payload.jobId ?? 'N/A'} message=${payload.message}`);
  }
}
