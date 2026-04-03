import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';
import { ProcessingProfile } from '@sdpe/shared';

/**
 * ProcessingProfile 값 객체를 sdpe.processing_profile 테이블에 매핑하는 엔티티.
 * (satelliteId, mode) 조합에 대해 유니크 제약을 가진다.
 */
@Entity({ name: 'processing_profile', schema: 'sdpe' })
@Unique(['satelliteId', 'mode'])
export class ProcessingProfileEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ name: 'satellite_id', type: 'varchar' })
  satelliteId!: string;

  @Column({ type: 'varchar' })
  mode!: string;

  @Column({ type: 'text', array: true })
  polarizations!: string[];

  @Column({ type: 'varchar' })
  description!: string;

  static fromDomain(profile: ProcessingProfile): ProcessingProfileEntity {
    const entity = new ProcessingProfileEntity();
    entity.id = profile.id;
    entity.satelliteId = profile.satelliteId;
    entity.mode = profile.mode;
    entity.polarizations = profile.polarizations;
    entity.description = profile.description;
    return entity;
  }

  toDomain(): ProcessingProfile {
    return new ProcessingProfile(this.id, this.satelliteId, this.mode, this.polarizations, this.description);
  }
}
