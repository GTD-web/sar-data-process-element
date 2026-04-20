/**
 * CSC-08 오케스트레이터 모듈.
 *
 * CSC-08은 SAR 데이터 처리 파이프라인의 중앙 오케스트레이터로,
 * 수신 이벤트(SI-01)를 트리거로 파이프라인을 시작하고,
 * 각 CSC(03~06)의 처리 결과(SI-03)를 받아 다음 단계를 할당한다.
 *
 * 파이프라인 흐름:
 *   CSC-02(수신) → CSC-03(LEVEL_0) → CSC-04(LEVEL_1) → CSC-05(LEVEL_2) → CSC-06(LEVEL_3)
 *
 * 각 CSU(CSC Sub-Unit) 라이브러리가 하나의 도메인 관심사를 담당하며,
 * 이 모듈에서 forRoot()를 통해 구체 구현체(TypeORM, Console 등)를 바인딩한다.
 */
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SdpeTaskQueueModule, StepResolverService } from '@sdpe/task-queue';
import { SdpePipelineSchedulerModule, DagBuilderService } from '@sdpe/pipeline-scheduler';
import { SdpeProcessingProfileModule, ProfileSelectorService } from '@sdpe/processing-profile';
import { SdpeProcessingMonitorModule, RetryEvaluatorService, DelayDetectorService } from '@sdpe/processing-monitor';
import { SdpeAlertModule, AlertConditionEvaluatorService } from '@sdpe/alert';
import { ConsoleAlertDispatcherService, SdpePgmqModule } from '@sdpe/infrastructure';
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
import { StartPipelineHandler } from './handlers/commands/start-pipeline.handler';
import { HandleStepCompletedHandler } from './handlers/commands/handle-step-completed.handler';
import { HandleStepFailedHandler } from './handlers/commands/handle-step-failed.handler';
import { ReprocessPipelineHandler } from './handlers/commands/reprocess-pipeline.handler';
import { GetJobStatusHandler } from './handlers/queries/get-job-status.handler';
import { GetPipelineExecutionHandler } from './handlers/queries/get-pipeline-execution.handler';
import { JobFailedAlertHandler } from './handlers/events/job-failed-alert.handler';
import { StepCompletedAuditHandler } from './handlers/events/step-completed-audit.handler';
import { ReceptionEventMessageHandler } from './infrastructure/reception-event.message-handler';
import { ProcessingEventMessageHandler } from './infrastructure/processing-event.message-handler';
import { StartPipelineUseCase } from './use-case/start-pipeline.use-case';
import { HandleStepCompletedUseCase } from './use-case/handle-step-completed.use-case';
import { HandleStepFailedUseCase } from './use-case/handle-step-failed.use-case';
import { ReprocessPipelineUseCase } from './use-case/reprocess-pipeline.use-case';

@Module({
  imports: [
    CqrsModule,
    // --- 영속성: TypeORM 엔티티 등록 ---
    TypeOrmModule.forFeature([
      JobEntity,
      PipelineExecutionEntity,
      PipelineStepEntity,
      ProcessingProfileEntity,
      AuditEventEntity,
      ProcessingMetricEntity,
    ]),
    // --- 메시징: PGMQ 소비자 (SI-01 수신 이벤트, SI-03 처리 이벤트) ---
    SdpePgmqModule.forRoot({
      imports: [CqrsModule],
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
    // --- CSU 도메인 모듈: 포트(인터페이스)에 구체 구현체 바인딩 ---
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
    StartPipelineUseCase,
    HandleStepCompletedUseCase,
    HandleStepFailedUseCase,
    ReprocessPipelineUseCase,
    StartPipelineHandler,
    HandleStepCompletedHandler,
    HandleStepFailedHandler,
    ReprocessPipelineHandler,
    GetJobStatusHandler,
    GetPipelineExecutionHandler,
    JobFailedAlertHandler,
    StepCompletedAuditHandler,
  ],
  exports: [],
})
export class Csc08OrchestratorModule {}
