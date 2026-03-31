import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Job, type JobStatus, type ProductLevel, type TargetCsc, createJobId } from '@sdpe/shared';

@Entity({ name: 'job', schema: 'sdpe' })
export class JobEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'event_id', type: 'varchar' })
  eventId!: string;

  @Column({ name: 'raw_data_path', type: 'varchar' })
  rawDataPath!: string;

  @Column({ name: 'processing_profile_id', type: 'varchar' })
  processingProfileId!: string;

  @Column({ name: 'satellite_id', type: 'varchar' })
  satelliteId!: string;

  @Column({ type: 'varchar' })
  mode!: string;

  @Column({ type: 'varchar' })
  status!: string;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount!: number;

  @Column({ name: 'current_target_csc', type: 'varchar', nullable: true })
  currentTargetCsc!: string | null;

  @Column({ name: 'current_product_level', type: 'varchar', nullable: true })
  currentProductLevel!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  static fromDomain(job: Job): JobEntity {
    const entity = new JobEntity();
    entity.id = job.id as string;
    entity.eventId = job.eventId;
    entity.rawDataPath = job.rawDataPath;
    entity.processingProfileId = job.processingProfileId;
    entity.satelliteId = job.satelliteId;
    entity.mode = job.mode;
    entity.status = job.status;
    entity.retryCount = job.retryCount;
    entity.currentTargetCsc = job.currentTargetCsc;
    entity.currentProductLevel = job.currentProductLevel;
    entity.createdAt = job.createdAt;
    entity.updatedAt = job.updatedAt;
    return entity;
  }

  toDomain(): Job {
    const job = Object.create(Job.prototype) as Job;
    Object.assign(job, {
      id: createJobId(this.id),
      eventId: this.eventId,
      rawDataPath: this.rawDataPath,
      processingProfileId: this.processingProfileId,
      satelliteId: this.satelliteId,
      mode: this.mode,
      createdAt: this.createdAt,
      _status: this.status as JobStatus,
      _retryCount: this.retryCount,
      _currentTargetCsc: this.currentTargetCsc as TargetCsc | null,
      _currentProductLevel: this.currentProductLevel as ProductLevel | null,
      _updatedAt: this.updatedAt,
    });
    return job;
  }
}
