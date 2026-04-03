/** Job 고유 식별자 (UUID v4) */
export type JobId = string & { readonly __brand: unique symbol };

export function createJobId(uuid: string): JobId {
  return uuid as JobId;
}
