import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { IMetricRecorder, ProcessingMetric } from '@sdpe/processing-monitor';
import { ProcessingMetricEntity } from '@sdpe/database';

@Injectable()
export class TypeOrmMetricRecorderAdapter implements IMetricRecorder {
  constructor(
    @InjectRepository(ProcessingMetricEntity)
    private readonly repo: Repository<ProcessingMetricEntity>,
  ) {}

  async record(metric: ProcessingMetric): Promise<void> {
    const entity = ProcessingMetricEntity.fromDomain(metric);
    await this.repo.save(entity);
  }

  async findByJobId(jobId: string): Promise<ProcessingMetric[]> {
    const entities = await this.repo.find({
      where: { jobId },
      order: { timestamp: 'ASC' },
    });
    return entities.map((e) => e.toDomain());
  }
}
