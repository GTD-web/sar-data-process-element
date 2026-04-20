import type { AlertType } from './alert-type.type';

export interface AlertPayload {
  readonly alertType: AlertType;
  readonly jobId?: string;
  readonly message: string;
  readonly details: Record<string, unknown>;
  readonly timestamp: Date;
}
