export const JobStatus = {
  CREATED: 'CREATED',
  ASSIGNED: 'ASSIGNED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];
