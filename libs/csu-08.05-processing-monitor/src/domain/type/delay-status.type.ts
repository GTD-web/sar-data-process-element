/** 처리 지연 상태. WARNING은 목표시간의 80%, CRITICAL은 100% 초과 */
export const DelayStatus = {
  NORMAL: 'NORMAL',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const;

export type DelayStatus = (typeof DelayStatus)[keyof typeof DelayStatus];
