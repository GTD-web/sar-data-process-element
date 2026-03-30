# CSC-07 Pipeline Orchestrator — 아키텍처 및 코드 흐름

> ICD v1.0 (2026-03-20) 기준, 상세 설계 (2026-03-30) 작성

---

## 1. 설계 원칙

CSC-07은 **DDD Ports & Adapters (Hexagonal Architecture)** 패턴으로 구현되었습니다.

```mermaid
graph TB
  subgraph apps["apps/ (Application Layer)"]
    direction TB
    Consumer["Consumer<br/>큐 메시지 수신"]
    ContextService["Context Service<br/>CommandBus / QueryBus Facade"]
    Handler["CQRS Handler<br/>Command · Query · Event"]
    Adapter["Infrastructure Adapter<br/>TypeORM · pgmq · Console"]
    Consumer --> ContextService --> Handler
    Handler -.->|Port 호출| Adapter
  end

  subgraph libs["libs/ (Domain Layer)"]
    direction TB
    SharedEntity["@sdpe/shared<br/>Entity · VO · Message Type"]
    CSU_Services["CSU Domain Services<br/>StepResolver · RetryEvaluator · ..."]
    Port["Port (Interface)<br/>IJobRepository · IAlertDispatcher · ..."]
    SharedEntity --> CSU_Services
    CSU_Services --> Port
  end

  Handler -->|사용| CSU_Services
  Handler -->|사용| SharedEntity
  Adapter -.->|구현| Port

  style libs fill:#e8f5e9,stroke:#2e7d32
  style apps fill:#e3f2fd,stroke:#1565c0
```

**핵심 규칙:**

- `libs/` 코드는 `apps/`, TypeORM, pgmq, `@nestjs/cqrs`를 **절대 import하지 않습니다**
- Model과 Type은 `@sdpe/shared`에 공통 배치하여 어떤 CSU/앱에서든 자유롭게 참조합니다
- CSU는 Port(인터페이스)만 정의하고, 구체 구현은 `apps/`의 Adapter가 담당합니다
- 각 CSU 모듈은 `forRoot()` 패턴으로 Port 구현체를 외부에서 주입받습니다

---

## 2. Model 및 Type 배치

Model(비즈니스 로직 객체)과 Type(식별자, 상태 열거형)은 `@sdpe/shared`에 공통 배치됩니다.
CSU는 Service와 Port만 소유합니다.
나중에 TypeORM으로 DB를 연결할 때의 DB 매핑 클래스는 `entity/`에 별도로 만듭니다.

| 용어 | 위치 | 역할 | DB 의존 |
|---|---|---|---|
| **Model** | `@sdpe/shared/model/` | 비즈니스 로직 (`job.assign()`, `job.fail()`) | 없음 |
| **Type** | `@sdpe/shared/type/` | 식별자, 상태 열거형 (`JobId`, `JobStatus`) | 없음 |
| **Entity** (향후) | `apps/.../infrastructure/entity/` | TypeORM DB 테이블 매핑 (`@Column()`) | TypeORM |

```mermaid
graph LR
  subgraph shared["@sdpe/shared"]
    direction TB
    Model["Model<br/>Job · PipelineExecution · PipelineStep · ProcessingProfile"]
    Type["Type<br/>JobId · JobStatus · StepStatus"]
    MsgType["Message Type<br/>EI-01 · SI-03 · SI-04 · SI-05"]
    CommonType["Common Type<br/>ProductLevel · TargetCsc · SourceCsc"]
  end

  subgraph csu["CSU (libs/)"]
    direction TB
    Service["Domain Service"]
    Port["Port (Interface)"]
    Constant["Constant"]
  end

  subgraph app["apps/ Context"]
    Adapter["Adapter (구현체)"]
    HandlerApp["CQRS Handler"]
  end

  shared --> csu
  shared --> app
  csu --> app
  Adapter -.->|구현| Port

  style shared fill:#fff3e0,stroke:#e65100
  style csu fill:#e8f5e9,stroke:#2e7d32
  style app fill:#e3f2fd,stroke:#1565c0
```

이렇게 분리하면:
- 어떤 CSU의 Service도 `Job`, `PipelineExecution` 등을 자유롭게 참조 가능
- CSU 간 의존(cross-CSU dependency)이 발생하지 않음
- Entity가 없는 CSU도 자연스러움 (RetryPolicy, Alert 등은 Service + VO + Constant만 보유)

---

## 3. CSU 분해 (7개 도메인)

```mermaid
graph TB
  CSC07["CSC-07<br/>Pipeline Orchestrator"]

  CSC07 --> CSU01["CSU-0701 Job<br/><i>@sdpe/job</i><br/>Port: IJobRepository"]
  CSC07 --> CSU02["CSU-0702 Pipeline<br/><i>@sdpe/pipeline</i><br/>Service: StepResolver, DagBuilder<br/>Port: IPipelineExecutionRepository"]
  CSC07 --> CSU03["CSU-0703 Processing Profile<br/><i>@sdpe/processing-profile</i><br/>Service: ProfileSelector<br/>Port: IProcessingProfileRepository"]
  CSC07 --> CSU04["CSU-0704 Retry Policy<br/><i>@sdpe/retry-policy</i><br/>Service: RetryEvaluator<br/>Port: 없음 (순수 로직)"]
  CSC07 --> CSU05["CSU-0705 Alert<br/><i>@sdpe/alert</i><br/>Service: AlertConditionEvaluator<br/>Port: IAlertDispatcher"]
  CSC07 --> CSU06["CSU-0706 Audit Log<br/><i>@sdpe/audit-log</i><br/>Port: IAuditLogWriter, IAuditLogReader"]
  CSC07 --> CSU07["CSU-0707 Monitoring<br/><i>@sdpe/monitoring</i><br/>Service: DelayDetector, PerformanceAnalyzer<br/>Port: IMetricRecorder"]

  style CSC07 fill:#ffcdd2,stroke:#c62828
  style CSU01 fill:#e8f5e9,stroke:#2e7d32
  style CSU02 fill:#e8f5e9,stroke:#2e7d32
  style CSU03 fill:#e8f5e9,stroke:#2e7d32
  style CSU04 fill:#e8f5e9,stroke:#2e7d32
  style CSU05 fill:#e8f5e9,stroke:#2e7d32
  style CSU06 fill:#e8f5e9,stroke:#2e7d32
  style CSU07 fill:#e8f5e9,stroke:#2e7d32
```

### CSU별 구성 요소

| CSU | 라이브러리 | Service | Port | Entity(shared) 참조 |
|---|---|---|---|---|
| 0701 | `@sdpe/job` | — | `IJobRepository` | Job, JobId, JobStatus |
| 0702 | `@sdpe/pipeline` | `StepResolverService`, `DagBuilderService` | `IPipelineExecutionRepository` | PipelineExecution, PipelineStep, StepStatus |
| 0703 | `@sdpe/processing-profile` | `ProfileSelectorService` | `IProcessingProfileRepository` | ProcessingProfile |
| 0704 | `@sdpe/retry-policy` | `RetryEvaluatorService` | 없음 (순수 로직) | — |
| 0705 | `@sdpe/alert` | `AlertConditionEvaluatorService` | `IAlertDispatcher` | — |
| 0706 | `@sdpe/audit-log` | — | `IAuditLogWriter`, `IAuditLogReader` | — |
| 0707 | `@sdpe/monitoring` | `DelayDetectorService`, `PerformanceAnalyzerService` | `IMetricRecorder` | — |

---

## 4. ICD 메시지 흐름

```mermaid
graph LR
  GS["위성 수신국"]
  CSC07["CSC-07<br/>Pipeline Orchestrator"]
  CSC02["CSC-02"]
  CSC03["CSC-03"]
  CSC04["CSC-04"]
  CSC05["CSC-05"]
  CSC06["CSC-06"]
  CSC08["CSC-08<br/>Product & Catalog"]

  GS -- "EI-01<br/>RAW_DATA_RECEIVED<br/>sdpe.reception.events" --> CSC07
  CSC07 -- "SI-04 JOB_ASSIGNED<br/>sdpe.jobs.csc02" --> CSC02
  CSC07 -- "SI-04 JOB_ASSIGNED<br/>sdpe.jobs.csc03" --> CSC03
  CSC07 -- "SI-04 JOB_ASSIGNED<br/>sdpe.jobs.csc04" --> CSC04
  CSC07 -- "SI-04 JOB_ASSIGNED<br/>sdpe.jobs.csc05" --> CSC05
  CSC07 -- "SI-04 JOB_ASSIGNED<br/>sdpe.jobs.csc06" --> CSC06
  CSC02 -- "SI-03 COMPLETED/FAILED<br/>sdpe.processing.events" --> CSC07
  CSC03 -- "SI-03 COMPLETED/FAILED" --> CSC07
  CSC04 -- "SI-03 COMPLETED/FAILED" --> CSC07
  CSC05 -- "SI-03 COMPLETED/FAILED" --> CSC07
  CSC06 -- "SI-03 COMPLETED/FAILED" --> CSC07
  CSC07 -- "SI-05 등록 트리거<br/>sdpe.catalog.registration" --> CSC08

  style CSC07 fill:#ffcdd2,stroke:#c62828
```

### 메시지 타입 파일

파일명에 인터페이스 ID(EI-01, SI-03 등)를 포함하여 ICD 추적이 가능합니다.

```
libs/sdpe-shared/src/interface/message/
├── ei-01-raw-data-received-event.interface.ts      EI-01 수신 이벤트
├── si-03-processing-event.interface.ts             SI-03 처리 완료/실패
├── si-04-job-assigned-message.interface.ts         SI-04 작업 할당
└── si-05-catalog-registration-message.interface.ts SI-05 제품 등록 트리거
```

---

## 5. PWS Context 계층 — CQRS 패턴

```mermaid
graph TB
  subgraph context["csc07-orchestrator-context"]
    direction TB

    subgraph consumer["infrastructure/consumer/"]
      RC["ReceptionEventConsumer<br/>sdpe.reception.events"]
      PC["ProcessingEventConsumer<br/>sdpe.processing.events"]
    end

    CS["Csc07OrchestratorContextService<br/>(Facade)"]

    subgraph commands["handlers/commands/"]
      C1["StartPipelineHandler<br/>OPS-01 파이프라인 시작"]
      C2["HandleStepCompletedHandler<br/>OPS-01 단계 완료"]
      C3["HandleStepFailedHandler<br/>OPS-02 단계 실패"]
      C4["ReprocessPipelineHandler<br/>OPS-03 부분 재처리"]
    end

    subgraph queries["handlers/queries/"]
      Q1["GetJobStatusHandler"]
      Q2["GetPipelineExecutionHandler"]
    end

    subgraph events["handlers/events/"]
      E1["JobFailedAlertHandler"]
      E2["StepCompletedAuditHandler"]
    end

    subgraph adapters["infrastructure/adapter/"]
      A1["TypeOrmJobRepository"]
      A2["TypeOrmPipelineExecutionRepository"]
      A3["TypeOrmProcessingProfileRepository"]
      A4["ConsoleAlertDispatcherAdapter"]
      A5["TypeOrmAuditLogAdapter"]
      A6["LogMetricRecorderAdapter"]
    end

    RC --> CS
    PC --> CS
    CS -->|CommandBus| commands
    CS -->|QueryBus| queries
  end

  style context fill:#e3f2fd,stroke:#1565c0
  style commands fill:#c8e6c9,stroke:#2e7d32
  style queries fill:#fff9c4,stroke:#f57f17
  style events fill:#f3e5f5,stroke:#7b1fa2
  style adapters fill:#fce4ec,stroke:#c62828
```

### Context Service 메서드

```
Csc07OrchestratorContextService
├── 파이프라인을_시작한다(event)        → StartPipelineCommand
├── 단계_완료를_처리한다(event)         → HandleStepCompletedCommand
├── 단계_실패를_처리한다(event)         → HandleStepFailedCommand
├── 파이프라인을_재처리한다(params)     → ReprocessPipelineCommand
├── 작업_상태를_조회한다(jobId)         → GetJobStatusQuery
└── 파이프라인_실행을_조회한다(execId)  → GetPipelineExecutionQuery
```

---

## 6. 운영 시나리오별 코드 흐름

### OPS-01: 정상 처리 흐름

```mermaid
sequenceDiagram
  participant GS as 위성 수신국
  participant RC as ReceptionEventConsumer
  participant CS as ContextService
  participant SP as StartPipelineHandler
  participant PS as ProfileSelectorService
  participant DB as DagBuilderService
  participant JR as IJobRepository
  participant PR as IPipelineExecutionRepository

  GS->>RC: EI-01 RAW_DATA_RECEIVED
  RC->>CS: 파이프라인을_시작한다(event)
  CS->>SP: CommandBus.execute(StartPipelineCommand)

  SP->>PS: selectProfile(satellite_id, mode)
  PS-->>SP: ProcessingProfile

  SP->>SP: Job.create() — status: CREATED
  SP->>DB: buildFullDag()
  DB-->>SP: PipelineStep[] (CSC-02→03→04→05→06)

  SP->>SP: PipelineExecution.create()
  SP->>SP: firstStep.start() → IN_PROGRESS
  SP->>SP: job.assign(CSC-02, LEVEL_0) → ASSIGNED

  SP->>JR: save(job)
  SP->>PR: save(execution)
  Note over SP: SI-04 JOB_ASSIGNED → sdpe.jobs.csc02 (TODO)
```

```mermaid
sequenceDiagram
  participant CSC as CSC-02~06
  participant PC as ProcessingEventConsumer
  participant CS as ContextService
  participant HC as HandleStepCompletedHandler
  participant SR as StepResolverService
  participant JR as IJobRepository
  participant MR as IMetricRecorder

  CSC->>PC: SI-03 PROCESSING_COMPLETED
  PC->>CS: 단계_완료를_처리한다(event)
  CS->>HC: CommandBus.execute(HandleStepCompletedCommand)

  HC->>JR: findById(jobId)
  JR-->>HC: Job

  HC->>HC: currentStep.complete()
  HC->>HC: job.complete()
  HC->>MR: record(metric) — 소요 시간 기록

  HC->>SR: resolveNextStep(execution)
  SR-->>HC: nextPendingStep (or null)

  alt 다음 단계 있음
    HC->>HC: nextStep.start()
    HC->>HC: job.assign(nextCsc, nextLevel)
    Note over HC: SI-04 JOB_ASSIGNED → 다음 CSC 큐 (TODO)
  else 마지막 단계 완료
    Note over HC: 파이프라인 완료
    Note over HC: SI-05 등록 트리거 → sdpe.catalog.registration (TODO)
  end

  HC->>JR: save(job)
```

### OPS-02: 실패 및 자동 재시도 흐름

```mermaid
sequenceDiagram
  participant CSC as CSC-04 (L1 처리)
  participant PC as ProcessingEventConsumer
  participant CS as ContextService
  participant HF as HandleStepFailedHandler
  participant RE as RetryEvaluatorService
  participant ACE as AlertConditionEvaluatorService
  participant AD as IAlertDispatcher
  participant AW as IAuditLogWriter

  CSC->>PC: SI-03 PROCESSING_FAILED
  PC->>CS: 단계_실패를_처리한다(event)
  CS->>HF: CommandBus.execute(HandleStepFailedCommand)

  HF->>HF: currentStep.fail()
  HF->>HF: job.fail() — retryCount 증가

  HF->>RE: evaluate(retryCount)

  alt retryCount < 3 (재시도 가능)
    RE-->>HF: { shouldRetry: true }
    HF->>HF: job.assign(CSC-04, LEVEL_1) — 재할당
    HF->>AW: write(JOB_RETRIED)
    Note over HF: SI-04 JOB_ASSIGNED 재발행 (TODO)
  else retryCount >= 3 (재시도 소진)
    RE-->>HF: { shouldRetry: false, shouldAlert: true }
    HF->>ACE: evaluateRetryExhausted(jobId, retryCount)
    ACE-->>HF: AlertPayload
    HF->>AD: dispatch(alertPayload) — Alert 발행
    HF->>AW: write(ALERT_DISPATCHED)
    HF->>AW: write(JOB_FAILED)
    Note over HF: Job 일시 중단. 운영자 수동 개입 대기
  end
```

### OPS-03: 부분 재처리 흐름

```mermaid
sequenceDiagram
  participant OP as 운영자 / CSC-09
  participant CS as ContextService
  participant RP as ReprocessPipelineHandler
  participant DB as DagBuilderService
  participant JR as IJobRepository

  OP->>CS: 파이프라인을_재처리한다({ jobId, targetLevel: LEVEL_2 })
  CS->>RP: CommandBus.execute(ReprocessPipelineCommand)

  RP->>JR: findById(jobId)
  JR-->>RP: Job

  RP->>RP: job.resetForReprocessing()<br/>status=CREATED, retryCount=0

  RP->>DB: buildPartialDag('LEVEL_2')
  Note over DB: CSC-02(SKIP) → CSC-03(SKIP) → CSC-04(SKIP)<br/>→ CSC-05(PENDING) → CSC-06(PENDING)
  DB-->>RP: PipelineStep[] (LEVEL_2 이전은 SKIPPED)

  RP->>RP: PipelineExecution.create()
  RP->>RP: firstStep(CSC-05).start()
  RP->>RP: job.assign(CSC-05, LEVEL_2)

  RP->>JR: save(job)
  Note over RP: SI-04 JOB_ASSIGNED → sdpe.jobs.csc05 (TODO)
```

---

## 7. 모듈 조합 (DI Wiring)

```mermaid
graph LR
  subgraph module["Csc07OrchestratorContextModule"]
    direction TB
    CqrsModule["CqrsModule"]

    subgraph forRoot["CSU.forRoot() 호출"]
      JM["SdpeJobModule.forRoot"]
      PM["SdpePipelineModule.forRoot"]
      PPM["SdpeProcessingProfileModule.forRoot"]
      RPM["SdpeRetryPolicyModule.forRoot"]
      AM["SdpeAlertModule.forRoot"]
      ALM["SdpeAuditLogModule.forRoot"]
      MM["SdpeMonitoringModule.forRoot"]
    end

    subgraph adapters["Adapter 주입"]
      JM ---|"jobRepository"| A1["TypeOrmJobRepository"]
      PM ---|"pipelineExecutionRepository"| A2["TypeOrmPipelineExecutionRepository"]
      PPM ---|"profileRepository"| A3["TypeOrmProcessingProfileRepository"]
      AM ---|"alertDispatcher"| A4["ConsoleAlertDispatcherAdapter"]
      ALM ---|"writer, reader"| A5["TypeOrmAuditLogAdapter"]
      MM ---|"metricRecorder"| A6["LogMetricRecorderAdapter"]
    end
  end

  style module fill:#e3f2fd,stroke:#1565c0
  style forRoot fill:#e8f5e9,stroke:#2e7d32
  style adapters fill:#fce4ec,stroke:#c62828
```

Adapter는 현재 **스켈레톤(stub)** 상태입니다.
DB 스키마 및 pgmq 인프라 확정 후 Adapter 파일만 교체하면 됩니다.
도메인 로직(libs/)은 변경이 필요 없습니다.

---

## 8. Job 상태 전이

```mermaid
stateDiagram-v2
  [*] --> CREATED : Job.create()
  CREATED --> ASSIGNED : job.assign(csc, level)
  ASSIGNED --> COMPLETED : job.complete()
  ASSIGNED --> FAILED : job.fail()
  FAILED --> ASSIGNED : job.assign() — 재시도
  COMPLETED --> CREATED : job.resetForReprocessing() — OPS-03
  FAILED --> CREATED : job.resetForReprocessing() — OPS-03

  note right of FAILED
    retryCount 증가
    retryCount >= 3 이면 Alert 발행
  end note
```

## 9. PipelineStep 상태 전이

```mermaid
stateDiagram-v2
  [*] --> PENDING : new PipelineStep()
  PENDING --> IN_PROGRESS : step.start()
  PENDING --> SKIPPED : step.skip() — OPS-03 부분 재처리
  IN_PROGRESS --> COMPLETED : step.complete()
  IN_PROGRESS --> FAILED : step.fail()
```

---

## 10. 전체 파일 구조

```
libs/sdpe-shared/src/
├── model/                ← 공통 Model (비즈니스 로직 객체, DB 무관)
│   ├── job.model.ts
│   ├── pipeline-execution.model.ts
│   ├── pipeline-step.model.ts
│   └── processing-profile.model.ts
├── type/                 ← 공통 Type (식별자, 상태 열거형 등)
│   ├── job-id.type.ts
│   ├── job-status.type.ts
│   └── step-status.type.ts
├── interface/
│   ├── common/           ← ICD 공통 타입 (ProductLevel, TargetCsc 등)
│   └── message/          ← ICD 메시지 인터페이스 (ei-01-*, si-03-*, ...)
└── constants/

libs/sdpe-job/src/          ← CSU-0701 (Port만 소유)
├── domain/port/job-repository.port.ts
└── sdpe-job.module.ts

libs/sdpe-pipeline/src/     ← CSU-0702 (Service + Port + Constant)
├── domain/
│   ├── service/step-resolver.service.ts
│   ├── service/dag-builder.service.ts
│   ├── port/pipeline-execution-repository.port.ts
│   └── constant/pipeline-steps.constant.ts, queue-config.constant.ts
└── sdpe-pipeline.module.ts

libs/sdpe-processing-profile/src/  ← CSU-0703 (Service + Port)
├── domain/
│   ├── service/profile-selector.service.ts
│   └── port/processing-profile-repository.port.ts
└── sdpe-processing-profile.module.ts

libs/sdpe-retry-policy/src/        ← CSU-0704 (Service + Type + Constant)
├── domain/
│   ├── service/retry-evaluator.service.ts
│   ├── type/retry-decision.type.ts
│   └── constant/retry-policy.constant.ts
└── sdpe-retry-policy.module.ts

libs/sdpe-alert/src/               ← CSU-0705 (Service + Port + Type + Constant)
├── domain/
│   ├── service/alert-condition-evaluator.service.ts
│   ├── port/alert-dispatcher.port.ts
│   ├── type/alert-type.type.ts, alert-payload.type.ts
│   └── constant/alert-threshold.constant.ts
└── sdpe-alert.module.ts

libs/sdpe-audit-log/src/           ← CSU-0706 (Port + Type)
├── domain/
│   ├── port/audit-log-writer.port.ts, audit-log-reader.port.ts
│   └── type/audit-event.type.ts, audit-event-type.type.ts
└── sdpe-audit-log.module.ts

libs/sdpe-monitoring/src/          ← CSU-0707 (Service + Port + Type + Constant)
├── domain/
│   ├── service/delay-detector.service.ts, performance-analyzer.service.ts
│   ├── port/metric-recorder.port.ts
│   ├── type/delay-status.type.ts, processing-metric.type.ts
│   └── constant/monitoring-threshold.constant.ts
└── sdpe-monitoring.module.ts

apps/pipeline-workflow-subsystem/src/
└── context/csc07-orchestrator-context/
    ├── csc07-orchestrator-context.module.ts
    ├── csc07-orchestrator-context.service.ts
    ├── handlers/commands/   ← OPS-01, OPS-02, OPS-03
    ├── handlers/queries/    ← 작업/파이프라인 조회
    ├── handlers/events/     ← Alert, Audit 이벤트
    ├── infrastructure/adapter/   ← Port 구현체 (stub)
    └── infrastructure/consumer/  ← 큐 메시지 소비자
```

---

## 11. 현재 상태 및 다음 단계

### 완료

- [x] Model/Type을 `@sdpe/shared`에 공통 배치 (CSU 간 의존 없이 참조 가능)
- [x] 7개 CSU 도메인 라이브러리 (Service, Port, Constant)
- [x] ICD 메시지 타입 (EI-01, SI-03, SI-04, SI-05)
- [x] CQRS Context 계층 (Command/Query/Event Handlers)
- [x] Infrastructure Adapter 스켈레톤
- [x] 빌드 + 린트 통과

### TODO

- [ ] Adapter 실제 구현 (TypeORM Entity 정의, pgmq 큐 연동)
- [ ] SI-04 메시지 발행 로직 (HandleStepCompleted에서 다음 CSC 큐에 JOB_ASSIGNED 발행)
- [ ] SI-05 등록 트리거 발행 (파이프라인 완료 시 CSC-08에 발행)
- [ ] 도메인 서비스 단위 테스트
- [ ] TBC/TBD 필드 확정 후 인터페이스 업데이트
