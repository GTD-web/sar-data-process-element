import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { IProcessingProfileRepository } from './domain/port/processing-profile-repository.port';
import { PROCESSING_PROFILE_REPOSITORY } from './domain/port/processing-profile-repository.port';
import type { IProfileSelector } from './domain/port/profile-selector.port';
import { PROFILE_SELECTOR } from './domain/port/profile-selector.port';

/**
 * CSU-08.02 처리 프로파일 모듈.
 * 위성 ID + 촬영 모드별 처리 파라미터를 관리한다.
 */
export interface SdpeProcessingProfileModuleOptions {
  profileRepository: Type<IProcessingProfileRepository>;
  profileSelector: Type<IProfileSelector>;
}

@Module({})
export class SdpeProcessingProfileModule {
  static forRoot(options: SdpeProcessingProfileModuleOptions): DynamicModule {
    return {
      module: SdpeProcessingProfileModule,
      providers: [
        { provide: PROCESSING_PROFILE_REPOSITORY, useClass: options.profileRepository },
        { provide: PROFILE_SELECTOR, useClass: options.profileSelector },
      ],
      exports: [PROCESSING_PROFILE_REPOSITORY, PROFILE_SELECTOR],
    };
  }
}
