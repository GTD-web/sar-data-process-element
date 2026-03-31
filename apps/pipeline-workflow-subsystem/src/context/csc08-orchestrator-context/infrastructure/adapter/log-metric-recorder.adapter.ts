import { Injectable, Logger } from '@nestjs/common';
import type { IMetricRecorder, ProcessingMetric } from '@sdpe/processing-monitor';

@Injectable()
export class LogMetricRecorderAdapter implements IMetricRecorder {
  private readonly logger = new Logger(LogMetricRecorderAdapter.name);

  async record(metric: ProcessingMetric): Promise<void> {
    this.logger.debug(
      `[METRIC] job=${metric.jobId} csc=${metric.targetCsc} duration=${metric.durationMs}ms`,
    );
  }

  async findByJobId(jobId: string): Promise<ProcessingMetric[]> {
    this.logger.debug(`[STUB] Finding metrics for job: ${jobId}`);
    return [];
  }
}
