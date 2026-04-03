import type { AlertPayload } from '../type/alert-payload.type';

export const ALERT_DISPATCHER = Symbol('ALERT_DISPATCHER');

/**
 * Alert 발송 포트.
 * 현재는 ConsoleAlertDispatcherService(콘솔 출력)로 구현되어 있으며,
 * 추후 이메일/Slack 등 실제 알림 채널로 교체할 수 있다.
 */
export interface IAlertDispatcher {
  dispatch(payload: AlertPayload): Promise<void>;
}
