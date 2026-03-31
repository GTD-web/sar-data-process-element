import { Inject, Injectable } from '@nestjs/common';
import type { ProcessingProfile } from '@sdpe/shared';
import { type IProfileSelector, PROCESSING_PROFILE_REPOSITORY, type IProcessingProfileRepository } from '@sdpe/processing-profile';

@Injectable()
export class ProfileSelectorAdapter implements IProfileSelector {
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
