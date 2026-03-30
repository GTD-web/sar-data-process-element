import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SdpeJobModule } from '@sdpe/job';
import { SdpePipelineModule } from '@sdpe/pipeline';
import { SdpeProcessingProfileModule } from '@sdpe/processing-profile';
import { SdpeRetryPolicyModule } from '@sdpe/retry-policy';
import { SdpeAlertModule } from '@sdpe/alert';
import { SdpeAuditLogModule } from '@sdpe/audit-log';
import { SdpeMonitoringModule } from '@sdpe/monitoring';
import { Csc07OrchestratorContextService } from './csc07-orchestrator-context.service';
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
    SdpeJobModule.forRoot({ jobRepository: TypeOrmJobRepository }),
    SdpePipelineModule.forRoot({
      pipelineExecutionRepository: TypeOrmPipelineExecutionRepository,
      stepResolver: DefaultStepResolverAdapter,
      dagBuilder: DefaultDagBuilderAdapter,
    }),
    SdpeProcessingProfileModule.forRoot({
      profileRepository: TypeOrmProcessingProfileRepository,
      profileSelector: DefaultProfileSelectorAdapter,
    }),
    SdpeRetryPolicyModule.forRoot({ retryEvaluator: DefaultRetryEvaluatorAdapter }),
    SdpeAlertModule.forRoot({
      alertDispatcher: ConsoleAlertDispatcherAdapter,
      alertConditionEvaluator: DefaultAlertConditionEvaluatorAdapter,
    }),
    SdpeAuditLogModule.forRoot({ writer: TypeOrmAuditLogAdapter, reader: TypeOrmAuditLogAdapter }),
    SdpeMonitoringModule.forRoot({
      metricRecorder: LogMetricRecorderAdapter,
      delayDetector: DefaultDelayDetectorAdapter,
      performanceAnalyzer: DefaultPerformanceAnalyzerAdapter,
    }),
  ],
  providers: [
    Csc07OrchestratorContextService,
    ...commandHandlers,
    ...queryHandlers,
    ...eventHandlers,
    // Adapters (forRoot에서 주입하지 않는 것들)
    DefaultProfileSelectorAdapter,
    // Consumers
    ReceptionEventConsumer,
    ProcessingEventConsumer,
  ],
  exports: [Csc07OrchestratorContextService],
})
export class Csc07OrchestratorContextModule {}
