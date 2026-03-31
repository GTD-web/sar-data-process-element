import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SdpeTaskQueueModule } from '@sdpe/task-queue';
import { SdpePipelineSchedulerModule } from '@sdpe/pipeline-scheduler';
import { SdpeProcessingProfileModule } from '@sdpe/processing-profile';
import { SdpeProcessingMonitorModule } from '@sdpe/processing-monitor';
import { SdpeAlertModule } from '@sdpe/alert';
import { SdpeAuditLogModule } from '@sdpe/audit-log';
import { SdpePerformanceAnalyzerModule } from '@sdpe/performance-analyzer';
import { Csc08OrchestratorContextService } from './csc08-orchestrator-context.service';
import { commandHandlers, queryHandlers, eventHandlers } from './handlers';
// Infrastructure Adapters
import { TypeOrmJobRepository } from './infrastructure/adapter/typeorm-job.repository';
import { TypeOrmPipelineExecutionRepository } from './infrastructure/adapter/typeorm-pipeline-execution.repository';
import { DefaultStepResolverAdapter } from './infrastructure/adapter/default-step-resolver.adapter';
import { DefaultDagBuilderAdapter } from './infrastructure/adapter/default-dag-builder.adapter';
import { TypeOrmProcessingProfileRepository } from './infrastructure/adapter/typeorm-processing-profile.repository';
import { DefaultProfileSelectorAdapter } from './infrastructure/adapter/default-profile-selector.adapter';
import { DefaultRetryEvaluatorAdapter } from './infrastructure/adapter/default-retry-evaluator.adapter';
import { ConsoleAlertDispatcherAdapter } from './infrastructure/adapter/console-alert-dispatcher.adapter';
import { DefaultAlertConditionEvaluatorAdapter } from './infrastructure/adapter/default-alert-condition-evaluator.adapter';
import { TypeOrmAuditLogAdapter } from './infrastructure/adapter/typeorm-audit-log.adapter';
import { LogMetricRecorderAdapter } from './infrastructure/adapter/log-metric-recorder.adapter';
import { DefaultDelayDetectorAdapter } from './infrastructure/adapter/default-delay-detector.adapter';
import { DefaultPerformanceAnalyzerAdapter } from './infrastructure/adapter/default-performance-analyzer.adapter';
// Consumers
import { ReceptionEventConsumer } from './infrastructure/consumer/reception-event.consumer';
import { ProcessingEventConsumer } from './infrastructure/consumer/processing-event.consumer';

@Module({
  imports: [
    CqrsModule,
    SdpeTaskQueueModule.forRoot({ jobRepository: TypeOrmJobRepository, stepResolver: DefaultStepResolverAdapter }),
    SdpePipelineSchedulerModule.forRoot({
      pipelineExecutionRepository: TypeOrmPipelineExecutionRepository,
      dagBuilder: DefaultDagBuilderAdapter,
    }),
    SdpeProcessingProfileModule.forRoot({
      profileRepository: TypeOrmProcessingProfileRepository,
      profileSelector: DefaultProfileSelectorAdapter,
    }),
    SdpeProcessingMonitorModule.forRoot({
      retryEvaluator: DefaultRetryEvaluatorAdapter,
      metricRecorder: LogMetricRecorderAdapter,
      delayDetector: DefaultDelayDetectorAdapter,
    }),
    SdpeAlertModule.forRoot({
      alertDispatcher: ConsoleAlertDispatcherAdapter,
      alertConditionEvaluator: DefaultAlertConditionEvaluatorAdapter,
    }),
    SdpeAuditLogModule.forRoot({ writer: TypeOrmAuditLogAdapter, reader: TypeOrmAuditLogAdapter }),
    SdpePerformanceAnalyzerModule.forRoot({ performanceAnalyzer: DefaultPerformanceAnalyzerAdapter }),
  ],
  providers: [
    Csc08OrchestratorContextService,
    ...commandHandlers,
    ...queryHandlers,
    ...eventHandlers,
    // Adapters (forRoot에서 주입하지 않는 것들)
    DefaultProfileSelectorAdapter,
    // Consumers
    ReceptionEventConsumer,
    ProcessingEventConsumer,
  ],
  exports: [Csc08OrchestratorContextService],
})
export class Csc08OrchestratorContextModule {}
