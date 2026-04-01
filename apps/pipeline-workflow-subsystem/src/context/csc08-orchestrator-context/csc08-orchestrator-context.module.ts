import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SdpeTaskQueueModule, StepResolverService } from '@sdpe/task-queue';
import { SdpePipelineSchedulerModule, DagBuilderService } from '@sdpe/pipeline-scheduler';
import { SdpeProcessingProfileModule, ProfileSelectorService } from '@sdpe/processing-profile';
import { SdpeProcessingMonitorModule, RetryEvaluatorService, DelayDetectorService } from '@sdpe/processing-monitor';
import { SdpeAlertModule, AlertConditionEvaluatorService } from '@sdpe/alert';
import { ConsoleAlertDispatcherService } from '@sdpe/infrastructure';
import { SdpePgmqModule } from '@sdpe/database';
import { SdpeAuditLogModule } from '@sdpe/audit-log';
import { SdpePerformanceAnalyzerModule, PerformanceAnalyzerService } from '@sdpe/performance-analyzer';
import {
  JobEntity,
  PipelineExecutionEntity,
  PipelineStepEntity,
  ProcessingProfileEntity,
  AuditEventEntity,
  ProcessingMetricEntity,
  TypeOrmJobRepository,
  TypeOrmPipelineExecutionRepository,
  TypeOrmProcessingProfileRepository,
  TypeOrmAuditLogRepository,
  TypeOrmMetricRecorderRepository,
} from '@sdpe/database';
import { QUEUE_CONFIG } from '@sdpe/task-queue';
import {
  commandHandlers,
  queryHandlers,
  eventHandlers,
  ReceptionEventMessageHandler,
  ProcessingEventMessageHandler,
} from './handlers';
// Use Cases
import { StartPipelineUseCase } from './use-case/start-pipeline.use-case';
import { HandleStepCompletedUseCase } from './use-case/handle-step-completed.use-case';
import { HandleStepFailedUseCase } from './use-case/handle-step-failed.use-case';
import { ReprocessPipelineUseCase } from './use-case/reprocess-pipeline.use-case';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      JobEntity,
      PipelineExecutionEntity,
      PipelineStepEntity,
      ProcessingProfileEntity,
      AuditEventEntity,
      ProcessingMetricEntity,
    ]),
    SdpePgmqModule.forRoot({
      consumers: [
        {
          queue: QUEUE_CONFIG.consume.RECEPTION_EVENTS,
          handler: ReceptionEventMessageHandler,
          visibilityTimeoutSec: 30,
          pollIntervalMs: 1000,
        },
        {
          queue: QUEUE_CONFIG.consume.PROCESSING_EVENTS,
          handler: ProcessingEventMessageHandler,
          visibilityTimeoutSec: 30,
          pollIntervalMs: 1000,
        },
      ],
    }),
    SdpeTaskQueueModule.forRoot({ jobRepository: TypeOrmJobRepository, stepResolver: StepResolverService }),
    SdpePipelineSchedulerModule.forRoot({
      pipelineExecutionRepository: TypeOrmPipelineExecutionRepository,
      dagBuilder: DagBuilderService,
    }),
    SdpeProcessingProfileModule.forRoot({
      profileRepository: TypeOrmProcessingProfileRepository,
      profileSelector: ProfileSelectorService,
    }),
    SdpeProcessingMonitorModule.forRoot({
      retryEvaluator: RetryEvaluatorService,
      metricRecorder: TypeOrmMetricRecorderRepository,
      delayDetector: DelayDetectorService,
    }),
    SdpeAlertModule.forRoot({
      alertDispatcher: ConsoleAlertDispatcherService,
      alertConditionEvaluator: AlertConditionEvaluatorService,
    }),
    SdpeAuditLogModule.forRoot({ writer: TypeOrmAuditLogRepository, reader: TypeOrmAuditLogRepository }),
    SdpePerformanceAnalyzerModule.forRoot({ performanceAnalyzer: PerformanceAnalyzerService }),
  ],
  providers: [
    // Use Cases
    StartPipelineUseCase,
    HandleStepCompletedUseCase,
    HandleStepFailedUseCase,
    ReprocessPipelineUseCase,
    // CQRS Handlers
    ...commandHandlers,
    ...queryHandlers,
    ...eventHandlers,
  ],
  exports: [],
})
export class Csc08OrchestratorContextModule {}
