import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { IMetricRecorder, ProcessingMetric } from '@sdpe/processing-monitor';
import { ProcessingMetricEntity } from '../entities';

/**
 * IMetricRecorder 포트의 TypeORM 구현체 (@sdpe/processing-monitor).
 * CSC 처리 소요시간 메트릭을 기록하고 Job ID로 조회한다 (CSU-08.05).
 */
@Injectable()
export class TypeOrmMetricRecorderRepository implements IMetricRecorder {
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
