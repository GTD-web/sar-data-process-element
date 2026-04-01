import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ProcessingProfile } from '@sdpe/shared';
import type { IProcessingProfileRepository } from '@sdpe/processing-profile';
import { ProcessingProfileEntity } from '../entities';

@Injectable()
export class TypeOrmProcessingProfileRepository implements IProcessingProfileRepository {
  constructor(
    @InjectRepository(ProcessingProfileEntity)
    private readonly repo: Repository<ProcessingProfileEntity>,
  ) {}

  async findById(id: string): Promise<ProcessingProfile | null> {
    const entity = await this.repo.findOneBy({ id });
    return entity?.toDomain() ?? null;
  }

  async findBySatelliteAndMode(satelliteId: string, mode: string): Promise<ProcessingProfile | null> {
    const entity = await this.repo.findOneBy({ satelliteId, mode });
    return entity?.toDomain() ?? null;
  }

  async findAll(): Promise<ProcessingProfile[]> {
    const entities = await this.repo.find();
    return entities.map((e) => e.toDomain());
  }
}
