import type { RawDataReceivedEvent } from '@sdpe/shared';

export const RECEPTION_EVENT_LISTENER = Symbol('RECEPTION_EVENT_LISTENER');

/**
 * SI-01 수신 이벤트 리스너 포트.
 * CSC-02가 원시 데이터를 NAS에 저장한 후 발행하는 RawDataReceivedEvent를 처리한다.
 */
export interface IReceptionEventListener {
  onRawDataReceived(event: RawDataReceivedEvent): Promise<void>;
}
