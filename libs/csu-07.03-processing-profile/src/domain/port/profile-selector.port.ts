import type { ProcessingProfile } from '@sdpe/shared';

export const PROFILE_SELECTOR = Symbol('PROFILE_SELECTOR');

export interface IProfileSelector {
  selectProfile(satelliteId: string, mode: string): Promise<ProcessingProfile>;
}
