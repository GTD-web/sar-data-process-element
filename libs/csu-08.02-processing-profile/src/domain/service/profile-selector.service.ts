import { Inject, Injectable } from '@nestjs/common';
import type { ProcessingProfile } from '@sdpe/shared';
import type { IProfileSelector } from '../port/profile-selector.port';
import { PROCESSING_PROFILE_REPOSITORY, type IProcessingProfileRepository } from '../port/processing-profile-repository.port';

/** 위성 ID + 촬영 모드 조합으로 프로파일을 조회. 매칭되는 프로파일이 없으면 에러 */
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
