import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryColumn } from 'typeorm';
import { PipelineExecution } from '@sdpe/shared';
import { PipelineStepEntity } from './pipeline-step.entity';

@Entity({ name: 'pipeline_execution', schema: 'sdpe' })
export class PipelineExecutionEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'job_id', type: 'varchar' })
  jobId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => PipelineStepEntity, (step) => step.execution, { cascade: true, eager: true })
  steps!: PipelineStepEntity[];

  static fromDomain(execution: PipelineExecution): PipelineExecutionEntity {
    const entity = new PipelineExecutionEntity();
    entity.id = execution.id;
    entity.jobId = execution.jobId;
    entity.createdAt = execution.createdAt;
    entity.steps = execution.steps.map((step) => PipelineStepEntity.fromDomain(step, execution.id));
    return entity;
  }

  toDomain(): PipelineExecution {
    const sortedSteps = [...this.steps].sort((a, b) => a.order - b.order);
    const domainSteps = sortedSteps.map((s) => s.toDomain());

    const execution = Object.create(PipelineExecution.prototype) as PipelineExecution;
    Object.assign(execution, {
      id: this.id,
      jobId: this.jobId,
      createdAt: this.createdAt,
      _steps: domainSteps,
    });
    return execution;
  }
}
