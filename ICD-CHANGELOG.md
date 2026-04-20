# ICD & Library 변경 관리 문서

> `interfaces/`(ICD 문서)와 `libs/`(구현 라이브러리)의 변경사항을 버전별로 추적합니다.
> 문서가 변경되면 관련 코드도 함께 변경되어야 하므로, 양쪽의 변경사항을 한 곳에서 관리합니다.

---

## 현재 버전: v1.0 (2026-04-07)

---

## 1. ICD 문서 (`interfaces/`)

전체 9개 CSC의 인터페이스 명세를 초기 정의.

| CSC   | 문서                        | 핵심 인터페이스                                        |
| ----- | --------------------------- | ------------------------------------------------------ |
| CSC-01 | `csc-1/interfaces.md`      | CI-03: DbRepository, GeoDataManager, NasManager        |
| CSC-02 | `csc-2/interfaces.md`      | SI-01 수신 이벤트, SI-03 처리 이벤트                    |
| CSC-03 | `csc-3/interfaces.md`      | SI-04 잡 수신 (`sdpe.jobs.csc03`, 3600s), FI-01 BAQ    |
| CSC-04 | `csc-4/interfaces.md`      | SI-04 잡 수신 (`sdpe.jobs.csc04`, 9000s), FI-02~04     |
| CSC-05 | `csc-5/interfaces.md`      | SI-04 잡 수신 (`sdpe.jobs.csc05`, 2700s), FI-05~06     |
| CSC-06 | `csc-6/interfaces.md`      | SI-04 잡 수신 (`sdpe.jobs.csc06`, 1800s), FI-07 플러그인 |
| CSC-07 | `csc-7/interfaces.md`      | SI-05 카탈로그 등록, SI-06 DB, SI-08 결과 알림          |
| CSC-08 | `csc-8/interfaces.md`      | SI-01/03/04/05/07/08 오케스트레이션 전체                |
| CSC-09 | `csc-9/interfaces.md`      | UI-01 REST, UI-02 OGC, UI-03 운영콘솔, CI-04 Redis     |

### 메시지 스키마 (SchemaVersion: `'1.0'`)

| ID    | 메시지                       | 방향                     |
| ----- | ---------------------------- | ------------------------ |
| EI-01 | RawDataReceivedEvent         | 위성 수신국 → CSC-02     |
| SI-01 | ReceptionEvent               | CSC-02 → CSC-08          |
| SI-03 | ProcessingEvent              | CSC-02~06 → CSC-08       |
| SI-04 | JobAssignedMessage           | CSC-08 → CSC-02~06       |
| SI-05 | CatalogRegistrationMessage   | CSC-08 → CSC-07          |
| SI-06 | SarProduct (DB Entity)       | CSC-07 ↔ CSC-09          |
| SI-07 | ReprocessingRequest          | CSC-09 → CSC-08          |
| SI-08 | CatalogRegistrationResult    | CSC-07 → CSC-08 **(TBD)** |

### 미확정 항목 (TBD/TBC)

주요 미확정 항목을 아래에 정리합니다. 각 CSC별 상세 TBD/TBC는 해당 `interfaces.md` 8절 참조.

| 구분 | 항목                               | 의존                        |
| ---- | ---------------------------------- | --------------------------- |
| TBC  | `@sdpe/common` 패키지명            | npm 명명 규칙 내부 결정      |
| TBC  | satellite_id 형식                  | 위성팀 협의                  |
| TBC  | scene_id 명명 규칙                 | 위성팀 협의                  |
| TBC  | NAS 저장 경로 규칙                 | satellite_id 형식 의존       |
| TBC  | FI-01 bits_per_sample 허용값       | 위성 OBS 팀 확정 필요        |
| TBD  | SI-08 CatalogRegistrationResult    | CSC-07 상세 설계 시 확정     |
| TBD  | FI-07 run_application() 인터페이스 | CSC-06 플러그인 설계 시 확정 |
| TBD  | error_code 체계 (공통)             | 내부 설계 결정 필요          |
| TBD  | 트랜잭션 관리 패턴                 | 내부 설계 결정 필요          |
| TBD  | OGC 서비스 상세 파라미터           | CSC-09 상세 설계 시 확정     |

---

## 2. 구현 라이브러리 (`libs/`)

CSC-08 오케스트레이터의 도메인 로직을 8개 CSU 모듈 + 3개 인프라 모듈로 구현.

### CSU 모듈 (CSC-08 서브컴포넌트)

| 모듈                          | 핵심 포트/서비스                                           |
| ----------------------------- | ---------------------------------------------------------- |
| `csu-08.01-reception-event`   | `IReceptionEventListener` — SI-01 수신 이벤트 처리          |
| `csu-08.02-processing-profile`| `IProcessingProfileRepository`, `IProfileSelector`          |
| `csu-08.03-pipeline-scheduler`| `IDagBuilder` — DAG 기반 파이프라인 구성 (5단계)             |
| `csu-08.04-task-queue`        | `IJobRepository`, `IStepResolver`, QUEUE_CONFIG 정의        |
| `csu-08.05-processing-monitor`| `IRetryEvaluator` (MAX_RETRY=3), `IDelayDetector`, `IMetricRecorder` |
| `csu-08.06-audit-log`         | `IAuditLogWriter`, `IAuditLogReader`                        |
| `csu-08.07-alert`             | `IAlertDispatcher`, `IAlertConditionEvaluator`              |
| `csu-08.08-performance-analyzer` | `IPerformanceAnalyzer` — 성능 분석 및 요약                |

### 인프라 모듈

| 모듈                 | 핵심 내용                                                   |
| -------------------- | ----------------------------------------------------------- |
| `sdpe-shared`        | 도메인 모델 (Job, PipelineExecution, PipelineStep, ProcessingProfile), 메시지 인터페이스 4종, 타입/상수 |
| `sdpe-database`      | TypeORM 엔티티 6종, 리포지토리 5종, 마이그레이션             |
| `sdpe-infrastructure`| PGMQ 메시징 (Producer/Consumer/Client), ConsoleAlertDispatcher |

### 파이프라인 단계 정의

```
CSC-02 (LEVEL_0) → CSC-03 (LEVEL_0) → CSC-04 (LEVEL_1) → CSC-05 (LEVEL_2) → CSC-06 (LEVEL_3)
```

### 큐 구성

| 큐 이름                       | 용도                    | Visibility Timeout |
| ----------------------------- | ----------------------- | ------------------ |
| `sdpe.reception.events`       | SI-01 수신 이벤트       | —                  |
| `sdpe.processing.events`      | SI-03 처리 이벤트       | —                  |
| `sdpe.jobs.csc02`             | CSC-02 잡 배정          | 3,600s             |
| `sdpe.jobs.csc03`             | CSC-03 잡 배정          | 3,600s             |
| `sdpe.jobs.csc04`             | CSC-04 잡 배정          | 9,000s             |
| `sdpe.jobs.csc05`             | CSC-05 잡 배정          | 2,700s             |
| `sdpe.jobs.csc06`             | CSC-06 잡 배정          | 1,800s             |
| `sdpe.catalog.registration`   | SI-05 카탈로그 등록     | —                  |

---

## 3. 문서 ↔ 코드 대응 관계

ICD 문서의 인터페이스가 코드의 어디에 구현되어 있는지 추적합니다.

| ICD 인터페이스 | 문서 위치                   | 코드 위치                                                |
| -------------- | --------------------------- | -------------------------------------------------------- |
| EI-01/SI-01    | `csc-2/interfaces.md`      | `sdpe-shared/src/csc08/message/raw-data-received-event-interface.ts` |
| SI-03          | `csc-8/interfaces.md`      | `sdpe-shared/src/csc08/message/processing-event-interface.ts`        |
| SI-04          | `csc-8/interfaces.md`      | `sdpe-shared/src/csc08/message/job-assigned-message-interface.ts`    |
| SI-05          | `csc-8/interfaces.md`      | `sdpe-shared/src/csc08/message/catalog-registration-message-interface.ts` |
| Job 모델       | `csc-8/interfaces.md`      | `sdpe-shared/src/csc08/model/job.model.ts`                           |
| Pipeline 모델  | `csc-8/interfaces.md`      | `sdpe-shared/src/csc08/model/pipeline-execution.model.ts`            |
| 큐 이름        | 각 CSC `interfaces.md`     | `sdpe-shared/src/csc08/constant/queue-name.constant.ts`              |
| 큐 설정        | `csc-8/interfaces.md`      | `csu-08.04-task-queue/src/domain/constant/queue-config.constant.ts`  |
| 재시도 정책    | `csc-8/interfaces.md`      | `csu-08.05-processing-monitor/src/domain/constant/retry-policy.constant.ts` |
| DB 엔티티      | `csc-7/interfaces.md` (SI-06) | `sdpe-database/src/entities/`                                     |

---

## 변경 이력

버전 간 변경사항(diff)은 `icd-changelog/` 폴더에 개별 파일로 관리됩니다.

| 버전 변경        | 날짜       | 요약 | 상세 |
| ---------------- | ---------- | ---- | ---- |
| (아직 변경 없음) |            |      |      |

> **이 문서**는 항상 최신 상태의 전체 현황을 보여줍니다.
> **`icd-changelog/`** 폴더에는 버전이 올라갈 때마다 "이전 버전 대비 무엇이 달라졌는지"만 기록합니다.

```
ICD-CHANGELOG.md                ← 이 파일 (전체 현황 + 변경 이력 인덱스)
icd-changelog/
  v1.0-to-v1.1.md              ← (예시) v1.0 → v1.1 변경사항
  v1.1-to-v2.0.md              ← (예시) v1.1 → v2.0 변경사항
  ...
```

---

## 변경 가이드

### 버전 업데이트 절차

1. **이 문서(`ICD-CHANGELOG.md`)를 최신 상태로 갱신**: 변경된 인터페이스, 코드, TBD/TBC 등을 본문 테이블에 직접 반영하고, 상단의 `현재 버전`을 갱신합니다.
2. **변경사항 파일 생성**: `icd-changelog/v{이전}-to-v{새버전}.md` 파일을 만들어 이전 대비 변경 내용만 기록합니다.
3. **변경 이력 테이블에 행 추가**: 하단의 변경 이력 테이블에 새 행과 링크를 추가합니다.

### 변경사항 파일 템플릿 (`icd-changelog/v1.0-to-v1.1.md`)

```markdown
# v1.0 → v1.1 변경사항 (날짜)

## ICD 변경 (`interfaces/`)
- CSC-03: FI-01 `bits_per_sample` 허용값 확정 → `[2, 3, 4, 8]` (TBC 해소)
- CSC-08: SI-08 CatalogRegistrationResult 스키마 확정 (TBD 해소)

## 코드 변경 (`libs/`)
- `sdpe-shared/src/csc08/message/catalog-registration-result-interface.ts` 추가
- `csu-08.01-reception-event` — SI-08 수신 핸들러 추가

## TBD/TBC 해소
| 항목                          | 확정 내용               |
| ----------------------------- | ----------------------- |
| FI-01 bits_per_sample 허용값  | `[2, 3, 4, 8]`         |
| SI-08 스키마                  | (상세 스키마 참조)      |

## Breaking Changes
- 없음
```

### 버전 번호 규칙

- **Major (v2.0)**: 메시지 스키마 비호환 변경, SchemaVersion 변경
- **Minor (v1.1)**: 새 인터페이스 추가, 기존 인터페이스에 선택 필드 추가, TBD 확정
- **Patch (v1.0.1)**: 문서 오타 수정, 코드 버그 수정 (인터페이스 변경 없음)

### 작성 시 유의사항

- **이 문서는 항상 최신 스냅샷**: 변경이 있을 때마다 본문 테이블들을 직접 업데이트
- **변경사항 파일은 diff만**: 이전 버전 대비 무엇이 추가/수정/삭제되었는지만 기록
- **ICD 변경과 코드 변경을 함께 기록**: 문서만 바뀌고 코드가 미반영이면 그 사실도 명시
- **TBD/TBC 해소 추적**: 이전 버전에서 미확정이었던 항목이 확정되면 반드시 기록
- **Breaking Changes**: 기존 메시지 스키마나 API의 호환성이 깨지는 변경은 별도 섹션으로 강조
