import { Injectable, Logger } from '@nestjs/common';
import type { IAlertDispatcher, AlertPayload } from '@sdpe/alert';

@Injectable()
export class ConsoleAlertDispatcherAdapter implements IAlertDispatcher {
  private readonly logger = new Logger(ConsoleAlertDispatcherAdapter.name);

  async dispatch(payload: AlertPayload): Promise<void> {
    this.logger.warn(`[ALERT] type=${payload.alertType} job=${payload.jobId ?? 'N/A'} message=${payload.message}`);
  }
}
