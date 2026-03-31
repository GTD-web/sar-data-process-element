import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SdpeTaskQueueModule } from '@sdpe/task-queue';
import { SdpePipelineSchedulerModule } from '@sdpe/pipeline-scheduler';
import { SdpeProcessingProfileModule } from '@sdpe/processing-profile';
import { SdpeProcessingMonitorModule } from '@sdpe/processing-monitor';
import { SdpeAlertModule } from '@sdpe/alert';
import { SdpeAuditLogModule } from '@sdpe/audit-log';
import { SdpePerformanceAnalyzerModule } from '@sdpe/performance-analyzer';
import {
  JobEntity,
  PipelineExecutionEntity,
  PipelineStepEntity,
  ProcessingProfileEntity,
  AuditEventEntity,
  ProcessingMetricEntity,
} from '@sdpe/database';
import { Csc08OrchestratorContextService } from './csc08-orchestrator-context.service';
import { commandHandlers, queryHandlers, eventHandlers } from './handlers';
// Infrastructure Adapters — TypeORM (DB)
import { TypeOrmJobRepository } from './infrastructure/adapter/typeorm/typeorm-job.repository';
import { TypeOrmPipelineExecutionRepository } from './infrastructure/adapter/typeorm/typeorm-pipeline-execution.repository';
import { TypeOrmProcessingProfileRepository } from './infrastructure/adapter/typeorm/typeorm-processing-profile.repository';
import { TypeOrmAuditLogAdapter } from './infrastructure/adapter/typeorm/typeorm-audit-log.adapter';
import { TypeOrmMetricRecorderAdapter } from './infrastructure/adapter/typeorm/typeorm-metric-recorder.adapter';
// Infrastructure Adapters — Domain Service (비즈니스 규칙 / 외부 연동)
import { StepResolverAdapter } from './infrastructure/adapter/domain-service/step-resolver.adapter';
import { DagBuilderAdapter } from './infrastructure/adapter/domain-service/dag-builder.adapter';
import { ProfileSelectorAdapter } from './infrastructure/adapter/domain-service/profile-selector.adapter';
import { RetryEvaluatorAdapter } from './infrastructure/adapter/domain-service/retry-evaluator.adapter';
import { DelayDetectorAdapter } from './infrastructure/adapter/domain-service/delay-detector.adapter';
import { AlertConditionEvaluatorAdapter } from './infrastructure/adapter/domain-service/alert-condition-evaluator.adapter';
import { PerformanceAnalyzerAdapter } from './infrastructure/adapter/domain-service/performance-analyzer.adapter';
import { ConsoleAlertDispatcherAdapter } from './infrastructure/adapter/domain-service/console-alert-dispatcher.adapter';
// Consumers
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
    SdpeTaskQueueModule.forRoot({ jobRepository: TypeOrmJobRepository, stepResolver: StepResolverAdapter }),
    SdpePipelineSchedulerModule.forRoot({
      pipelineExecutionRepository: TypeOrmPipelineExecutionRepository,
      dagBuilder: DagBuilderAdapter,
    }),
    SdpeProcessingProfileModule.forRoot({
      profileRepository: TypeOrmProcessingProfileRepository,
      profileSelector: ProfileSelectorAdapter,
    }),
    SdpeProcessingMonitorModule.forRoot({
      retryEvaluator: RetryEvaluatorAdapter,
      metricRecorder: TypeOrmMetricRecorderAdapter,
      delayDetector: DelayDetectorAdapter,
    }),
    SdpeAlertModule.forRoot({
      alertDispatcher: ConsoleAlertDispatcherAdapter,
      alertConditionEvaluator: AlertConditionEvaluatorAdapter,
    }),
    SdpeAuditLogModule.forRoot({ writer: TypeOrmAuditLogAdapter, reader: TypeOrmAuditLogAdapter }),
    SdpePerformanceAnalyzerModule.forRoot({ performanceAnalyzer: PerformanceAnalyzerAdapter }),
  ],
  providers: [
    Csc08OrchestratorContextService,
    ...commandHandlers,
    ...queryHandlers,
    ...eventHandlers,
    // Adapters (forRoot에서 주입하지 않는 것들)
    ProfileSelectorAdapter,
    // Consumers
    ReceptionEventConsumer,
    ProcessingEventConsumer,
  ],
  exports: [Csc08OrchestratorContextService],
})
export class Csc08OrchestratorContextModule {}
