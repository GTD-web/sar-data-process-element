import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SdpeTaskQueueModule, StepResolverService } from '@sdpe/task-queue';
import { SdpePipelineSchedulerModule, DagBuilderService } from '@sdpe/pipeline-scheduler';
import { SdpeProcessingProfileModule, ProfileSelectorService } from '@sdpe/processing-profile';
import { SdpeProcessingMonitorModule, RetryEvaluatorService, DelayDetectorService } from '@sdpe/processing-monitor';
import { SdpeAlertModule, AlertConditionEvaluatorService } from '@sdpe/alert';
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
import { Csc08OrchestratorContextService } from './csc08-orchestrator-context.service';
import { commandHandlers, queryHandlers, eventHandlers } from './handlers';
// Use Cases
import { StartPipelineUseCase } from './use-case/start-pipeline.use-case';
import { HandleStepCompletedUseCase } from './use-case/handle-step-completed.use-case';
import { HandleStepFailedUseCase } from './use-case/handle-step-failed.use-case';
import { ReprocessPipelineUseCase } from './use-case/reprocess-pipeline.use-case';
// Infrastructure
import { ConsoleAlertDispatcherAdapter } from './infrastructure/console-alert-dispatcher.adapter';
import { ReceptionEventConsumer } from './infrastructure/consumer/reception-event.consumer';
import { ProcessingEventConsumer } from './infrastructure/consumer/processing-event.consumer';

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
      alertDispatcher: ConsoleAlertDispatcherAdapter,
      alertConditionEvaluator: AlertConditionEvaluatorService,
    }),
    SdpeAuditLogModule.forRoot({ writer: TypeOrmAuditLogRepository, reader: TypeOrmAuditLogRepository }),
    SdpePerformanceAnalyzerModule.forRoot({ performanceAnalyzer: PerformanceAnalyzerService }),
  ],
  providers: [
    Csc08OrchestratorContextService,
    // Use Cases
    StartPipelineUseCase,
    HandleStepCompletedUseCase,
    HandleStepFailedUseCase,
    ReprocessPipelineUseCase,
    // CQRS Handlers
    ...commandHandlers,
    ...queryHandlers,
    ...eventHandlers,
    // Consumers
    ReceptionEventConsumer,
    ProcessingEventConsumer,
  ],
  exports: [Csc08OrchestratorContextService],
})
export class Csc08OrchestratorContextModule {}
