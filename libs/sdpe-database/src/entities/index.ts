/**
 * 공용 TypeORM 엔티티를 여기에 두고 data-source.ts 의 entities 배열에 포함한다.
 * 앱 전용 엔티티는 해당 앱 csc 폴더의 infrastructure 디렉터리에 둘 수 있다.
 */
import type { EntitySchema } from 'typeorm';
import { JobEntity } from './job.entity';
import { PipelineExecutionEntity } from './pipeline-execution.entity';
import { PipelineStepEntity } from './pipeline-step.entity';
import { ProcessingProfileEntity } from './processing-profile.entity';
import { AuditEventEntity } from './audit-event.entity';
import { ProcessingMetricEntity } from './processing-metric.entity';

/** Aligns with DataSourceOptions.entities: class, path glob, or EntitySchema */
export const sdpeDatabaseEntities: Array<string | (new () => unknown) | EntitySchema> = [
  JobEntity,
  PipelineExecutionEntity,
  PipelineStepEntity,
  ProcessingProfileEntity,
  AuditEventEntity,
  ProcessingMetricEntity,
];

export { JobEntity } from './job.entity';
export { PipelineExecutionEntity } from './pipeline-execution.entity';
export { PipelineStepEntity } from './pipeline-step.entity';
export { ProcessingProfileEntity } from './processing-profile.entity';
export { AuditEventEntity } from './audit-event.entity';
export { ProcessingMetricEntity } from './processing-metric.entity';
