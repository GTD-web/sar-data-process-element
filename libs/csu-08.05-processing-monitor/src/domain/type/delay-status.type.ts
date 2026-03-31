export const DelayStatus = {
  NORMAL: 'NORMAL',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const;

export type DelayStatus = (typeof DelayStatus)[keyof typeof DelayStatus];
