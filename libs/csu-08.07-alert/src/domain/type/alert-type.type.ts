export const AlertType = {
  RETRY_EXHAUSTED: 'RETRY_EXHAUSTED',
  PIPELINE_DELAYED: 'PIPELINE_DELAYED',
  RESOURCE_THRESHOLD: 'RESOURCE_THRESHOLD',
} as const;

export type AlertType = (typeof AlertType)[keyof typeof AlertType];
