import type { RawDataReceivedEvent } from '@sdpe/shared';

export const RECEPTION_EVENT_LISTENER = Symbol('RECEPTION_EVENT_LISTENER');

export interface IReceptionEventListener {
  onRawDataReceived(event: RawDataReceivedEvent): Promise<void>;
}
