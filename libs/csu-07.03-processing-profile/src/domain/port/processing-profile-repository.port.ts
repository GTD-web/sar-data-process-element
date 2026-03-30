import type { ProcessingProfile } from '@sdpe/shared';

export const PROCESSING_PROFILE_REPOSITORY = Symbol('PROCESSING_PROFILE_REPOSITORY');

export interface IProcessingProfileRepository {
  findById(id: string): Promise<ProcessingProfile | null>;
  findBySatelliteAndMode(satelliteId: string, mode: string): Promise<ProcessingProfile | null>;
  findAll(): Promise<ProcessingProfile[]>;
}
