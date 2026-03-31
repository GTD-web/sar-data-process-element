import { Injectable, Logger } from '@nestjs/common';
import { ProcessingProfile } from '@sdpe/shared';
import type { IProcessingProfileRepository } from '@sdpe/processing-profile';

@Injectable()
export class TypeOrmProcessingProfileRepository implements IProcessingProfileRepository {
  private readonly logger = new Logger(TypeOrmProcessingProfileRepository.name);

  async findById(id: string): Promise<ProcessingProfile | null> {
    this.logger.debug(`[STUB] Finding profile by id: ${id}`);
    return null;
  }

  async findBySatelliteAndMode(satelliteId: string, mode: string): Promise<ProcessingProfile | null> {
    this.logger.debug(`[STUB] Finding profile: satellite=${satelliteId}, mode=${mode}`);
    return new ProcessingProfile('default-profile', satelliteId, mode, [], 'Default processing profile');
  }

  async findAll(): Promise<ProcessingProfile[]> {
    this.logger.debug('[STUB] Finding all profiles');
    return [];
  }
}
