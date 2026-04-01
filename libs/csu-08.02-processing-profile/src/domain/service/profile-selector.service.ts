import { Inject, Injectable } from '@nestjs/common';
import type { ProcessingProfile } from '@sdpe/shared';
import type { IProfileSelector } from '../port/profile-selector.port';
import { PROCESSING_PROFILE_REPOSITORY, type IProcessingProfileRepository } from '../port/processing-profile-repository.port';

@Injectable()
export class ProfileSelectorService implements IProfileSelector {
  constructor(
    @Inject(PROCESSING_PROFILE_REPOSITORY)
    private readonly profileRepository: IProcessingProfileRepository,
  ) {}

  async selectProfile(satelliteId: string, mode: string): Promise<ProcessingProfile> {
    const profile = await this.profileRepository.findBySatelliteAndMode(satelliteId, mode);
    if (!profile) {
      throw new Error(`No processing profile found for satellite '${satelliteId}' with mode '${mode}'.`);
    }
    return profile;
  }
}
