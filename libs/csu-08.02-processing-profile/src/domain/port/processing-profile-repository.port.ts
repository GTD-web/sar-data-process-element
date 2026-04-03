import type { ProcessingProfile } from '@sdpe/shared';

export const PROCESSING_PROFILE_REPOSITORY = Symbol('PROCESSING_PROFILE_REPOSITORY');

/**
 * 처리 프로파일 저장소 포트.
 * 위성 ID + 촬영 모드 조합별로 어떤 처리 파라미터를 적용할지 결정하는 프로파일을 관리한다.
 */
export interface IProcessingProfileRepository {
  findById(id: string): Promise<ProcessingProfile | null>;
  findBySatelliteAndMode(satelliteId: string, mode: string): Promise<ProcessingProfile | null>;
  findAll(): Promise<ProcessingProfile[]>;
}
