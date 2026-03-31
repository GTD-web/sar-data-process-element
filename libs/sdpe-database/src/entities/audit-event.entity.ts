import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { AuditEvent, AuditEventType } from '@sdpe/audit-log';

@Entity({ name: 'audit_event', schema: 'sdpe' })
export class AuditEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'event_type', type: 'varchar' })
  eventType!: string;

  @Column({ type: 'timestamptz' })
  timestamp!: Date;

  @Column({ type: 'varchar' })
  actor!: string;

  @Index()
  @Column({ name: 'job_id', type: 'varchar', nullable: true })
  jobId!: string | null;

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  static fromDomain(event: AuditEvent): AuditEventEntity {
    const entity = new AuditEventEntity();
    entity.eventType = event.eventType;
    entity.timestamp = event.timestamp;
    entity.actor = event.actor;
    entity.jobId = event.jobId ?? null;
    entity.payload = event.payload;
    return entity;
  }

  toDomain(): AuditEvent {
    return {
      eventType: this.eventType as AuditEventType,
      timestamp: this.timestamp,
      actor: this.actor,
      jobId: this.jobId ?? undefined,
      payload: this.payload,
    };
  }
}
