import { Column, Entity, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { PipelineStep, type StepStatus, type TargetCsc, type ProductLevel } from '@sdpe/shared';
import { PipelineExecutionEntity } from './pipeline-execution.entity';

/**
 * PipelineStep을 sdpe.pipeline_step 테이블에 매핑하는 엔티티.
 * PipelineExecutionEntity와 ManyToOne 관계이며, 실행 삭제 시 CASCADE로 함께 삭제된다.
 */
@Entity({ name: 'pipeline_step', schema: 'sdpe' })
export class PipelineStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'execution_id', type: 'uuid' })
  executionId!: string;

  @ManyToOne(() => PipelineExecutionEntity, (execution) => execution.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'execution_id' })
  execution!: PipelineExecutionEntity;

  @Column({ type: 'int' })
  order!: number;

  @Column({ name: 'target_csc', type: 'varchar' })
  targetCsc!: string;

  @Column({ name: 'product_level', type: 'varchar' })
  productLevel!: string;

  @Column({ type: 'varchar' })
  status!: string;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  static fromDomain(step: PipelineStep, executionId: string): PipelineStepEntity {
    const entity = new PipelineStepEntity();
    entity.executionId = executionId;
    entity.order = step.order;
    entity.targetCsc = step.targetCsc;
    entity.productLevel = step.productLevel;
    entity.status = step.status;
    entity.startedAt = step.startedAt;
    entity.completedAt = step.completedAt;
    return entity;
  }

  toDomain(): PipelineStep {
    const step = new PipelineStep(this.order, this.targetCsc as TargetCsc, this.productLevel as ProductLevel);
    Object.assign(step, {
      _status: this.status as StepStatus,
      _startedAt: this.startedAt,
      _completedAt: this.completedAt,
    });
    return step;
  }
}
