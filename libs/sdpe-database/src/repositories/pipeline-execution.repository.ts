import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { PipelineExecution } from '@sdpe/shared';
import type { IPipelineExecutionRepository } from '@sdpe/pipeline-scheduler';
import { PipelineExecutionEntity } from '../entities';

@Injectable()
export class TypeOrmPipelineExecutionRepository implements IPipelineExecutionRepository {
  constructor(
    @InjectRepository(PipelineExecutionEntity)
    private readonly repo: Repository<PipelineExecutionEntity>,
  ) {}

  async save(execution: PipelineExecution): Promise<void> {
    const entity = PipelineExecutionEntity.fromDomain(execution);
    await this.repo.save(entity);
  }

  async findById(id: string): Promise<PipelineExecution | null> {
    const entity = await this.repo.findOneBy({ id });
    return entity?.toDomain() ?? null;
  }

  async findByJobId(jobId: string): Promise<PipelineExecution | null> {
    const entity = await this.repo.findOneBy({ jobId });
    return entity?.toDomain() ?? null;
  }
}
