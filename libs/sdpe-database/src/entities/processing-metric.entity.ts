import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { TargetCsc } from '@sdpe/shared';
import type { ProcessingMetric } from '@sdpe/processing-monitor';

@Entity({ name: 'processing_metric', schema: 'sdpe' })
export class ProcessingMetricEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'job_id', type: 'varchar' })
  jobId!: string;

  @Column({ name: 'target_csc', type: 'varchar' })
  targetCsc!: string;

  @Column({ name: 'duration_ms', type: 'int' })
  durationMs!: number;

  @Column({ type: 'timestamptz' })
  timestamp!: Date;

  static fromDomain(metric: ProcessingMetric): ProcessingMetricEntity {
    const entity = new ProcessingMetricEntity();
    entity.jobId = metric.jobId;
    entity.targetCsc = metric.targetCsc;
    entity.durationMs = metric.durationMs;
    entity.timestamp = metric.timestamp;
    return entity;
  }

  toDomain(): ProcessingMetric {
    return {
      jobId: this.jobId,
      targetCsc: this.targetCsc as TargetCsc,
      durationMs: this.durationMs,
      timestamp: this.timestamp,
    };
  }
}
