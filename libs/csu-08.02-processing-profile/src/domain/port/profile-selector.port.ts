import type { ProcessingProfile } from '@sdpe/shared';

export const PROFILE_SELECTOR = Symbol('PROFILE_SELECTOR');

/** 위성 ID와 촬영 모드로부터 적절한 처리 프로파일을 선택하는 포트 */
export interface IProfileSelector {
  selectProfile(satelliteId: string, mode: string): Promise<ProcessingProfile>;
}
