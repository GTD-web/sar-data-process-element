import type { AlertPayload } from '../type/alert-payload.type';

export const ALERT_DISPATCHER = Symbol('ALERT_DISPATCHER');

export interface IAlertDispatcher {
  dispatch(payload: AlertPayload): Promise<void>;
}
