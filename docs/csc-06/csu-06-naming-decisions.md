# SDPE CSC-06 명칭 결정 문서

> ICD에 공식 명칭이 없는 CSU 클래스·타입·예외 명칭의 파생 근거를 집중 관리한다.
> CDR에서 공식 명칭이 확정되면 이 문서를 기준으로 각 CSU 문서와 코드를 일괄 갱신한다.

| 항목          | 내용                                 |
| ------------- | ------------------------------------ |
| **대상 CSC**  | CSC-06 Pipeline Orchestrator (PWS)   |
| **작성 기준** | PDR 완료 기준 (v0.9-PDR, 2026-03-20) |
| **확정 목표** | CDR                                  |

---

## 1. 배경 및 원칙

ICD(Interface Control Document)는 PDR 기준 문서로서 CSU 번호와 역할 설명만 제공하며,
클래스명·타입명·예외명 등 구현 수준의 명칭은 기술하지 않는다.

본 문서는 ICD 텍스트에서 각 명칭을 파생한 근거를 기록하여 다음을 보장한다.

- 팀 전체가 동일한 명칭을 사용한다 (코드·문서 일관성)
- CDR 검토 시 명칭 결정 근거를 한 곳에서 제시할 수 있다
- 명칭 변경 시 영향 범위를 즉시 파악할 수 있다

**파생 규칙 원칙**

| 유형        | 규칙                                                                     |
| ----------- | ------------------------------------------------------------------------ |
| CSU 클래스  | ICD 역할 묘사 또는 기능 설명 문구 → PascalCase 단일어 (공백 제거)        |
| 메시지 타입 | ICD `event_type` / `message_type` 고정값 → PascalCase + `Message` suffix |
| 도메인 타입 | ICD 필드명 → 단수형 PascalCase 도메인 객체명                             |
| 열거 타입   | 도메인 + `Type` suffix                                                   |
| 예외        | 실패 대상 설명 + NestJS 관례 `Error` suffix                              |

---

## 2. ICD 명시 여부 기준

명칭을 세 등급으로 분류한다.

| 등급              | 기준                                             | 예시                                                       |
| ----------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| **ICD 명시**      | ICD에 클래스명이 직접 기술됨                     | `DbRepository`, `GeoDataManager`, `NasManager` (IF-INT-08) |
| **ICD 문구 파생** | ICD 자연어 기술에서 PascalCase 변환              | `TaskQueueManager` ← "Task Queue Manager" (IF-INT-05)      |
| **ICD 미명시**    | ICD에 관련 텍스트 없음. 역할·컨텍스트만으로 파생 | `ProfileNotFoundError`, `StageMetrics` 등                  |

---

## 3. CSU 클래스 명칭

| 명칭                       | CSU       | 등급          | ICD 근거 텍스트                                                    | 파생 규칙                                                                                            |
| -------------------------- | --------- | ------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `ReceptionEventListener`   | CSU-06.01 | ICD 미명시    | OPS-01: _"CSC-06.01이 이벤트 수신"_                                | 큐명 `sdpe.reception.events`의 `reception` + pgmq "이벤트" + NestJS Polling Consumer 관례 `Listener` |
| `ProcessingProfileManager` | CSU-06.02 | ICD 미명시    | OPS-01: _"CSC-06.02가 처리 프로파일 자동 선택"_                    | 역할 묘사 "처리 프로파일" → `ProcessingProfile` + 관리 주체 `Manager`                                |
| `DagGenerator`             | CSU-06.03 | ICD 미명시    | OPS-03: _"CSC-06.03이 target_level 기반 DAG 생성"_                 | ICD 약어집 "DAG" + 생성 행위 `Generator`                                                             |
| `TaskQueueManager`         | CSU-06.04 | ICD 문구 파생 | IF-INT-05 제공자: _"CSC-06 Task Queue Manager — CSU-06.04"_        | "Task Queue Manager" → 공백 제거 PascalCase                                                          |
| `ProcessingMonitor`        | CSU-06.05 | ICD 문구 파생 | IF-INT-04 소비자: _"CSC-06 Processing Monitor (CSU-06.05)"_        | "Processing Monitor" → 공백 제거 PascalCase                                                          |
| `AuditLogCollector`        | CSU-06.06 | ICD 문구 파생 | IF-INT-06 제공자: _"CSC-06 Audit Log Collector / CSU-06.06"_       | "Audit Log Collector" → 공백 제거 PascalCase                                                         |
| `AlertManager`             | CSU-06.07 | ICD 문구 파생 | OPS-02: _"CSC-06.07 Alert Manager가 운영자 알림 발송"_             | "Alert Manager" → 공백 제거 PascalCase                                                               |
| `PerformanceAnalyzer`      | CSU-06.08 | ICD 문구 파생 | OPS-02: _"CSC-06.08 Performance Analyzer에서 처리 시간·병목 분석"_ | "Performance Analyzer" → 공백 제거 PascalCase                                                        |

---

## 4. 메시지·이벤트 타입 명칭

| 명칭                     | 관련 IF   | 등급       | ICD 근거 텍스트                                    | 파생 규칙                                               |
| ------------------------ | --------- | ---------- | -------------------------------------------------- | ------------------------------------------------------- |
| `RawDataReceivedEvent`   | IF-EXT-01 | ICD 미명시 | `event_type: "RAW_DATA_RECEIVED"` 고정값           | `event_type` 값을 PascalCase TypeScript 타입명으로 변환 |
| `JobAssignedMessage`     | IF-INT-05 | ICD 미명시 | `message_type: "JOB_ASSIGNED"` 고정값. 타입명 없음 | `message_type` 값을 PascalCase + `Message` suffix       |
| `ProcessingEventMessage` | IF-INT-04 | ICD 미명시 | 처리 이벤트 메시지 필드 목록 정의. 타입명 없음     | IF-INT-04 역할("처리 이벤트") + `Message` suffix        |

---

## 5. 도메인·열거 타입 명칭

| 명칭                     | 관련 CSU        | 등급       | ICD 근거 텍스트                                                                | 파생 규칙                                                      |
| ------------------------ | --------------- | ---------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `ProcessingProfileQuery` | CSU-06.02       | ICD 미명시 | IF-INT-05: `processing_profile_id` 필드만 언급. 조회 입력 타입명 없음          | 조회 대상 `ProcessingProfile` + 입력을 나타내는 `Query` suffix |
| `ProcessingProfile`      | CSU-06.02       | ICD 미명시 | IF-INT-05: `processing_profile_id` 필드만 언급. 반환 타입명 없음               | 필드명 `processing_profile_id`에서 도메인 객체명 파생          |
| `ProductLevel`           | CSU-06.03/04/05 | ICD 미명시 | IF-INT-05: `target_product_level` 필드에 "LEVEL_0"~"LEVEL_3" 나열. 타입명 없음 | 필드명 `target_product_level`에서 도메인 타입명 파생           |
| `DagNode`                | CSU-06.03       | ICD 미명시 | ICD 약어집: "DAG — 파이프라인 처리 흐름 표현 구조". 노드 단위 타입명 없음      | DAG 구성 단위 개념 + `Node` suffix                             |
| `ProcessingDag`          | CSU-06.03       | ICD 미명시 | OPS-03: DAG 생성 언급. 반환 타입명 없음                                        | 용도("처리 파이프라인") + ICD 약어 `DAG` 조합                  |
| `TargetCsc`              | CSU-06.04       | ICD 미명시 | IF-INT-05: `target_csc` 필드에 "CSC-02"~"CSC-05" 나열. 타입명 없음             | 필드명 `target_csc`를 PascalCase 타입명으로 변환               |
| `ProductType`            | CSU-06.04       | ICD 미명시 | IF-INT-05: `target_product_types` 필드에 "SLC", "GRD" 등 나열. 타입명 없음     | 필드명 `target_product_types`에서 단수형 도메인 타입명 파생    |
| `ProcessingEventType`    | CSU-06.05       | ICD 미명시 | IF-INT-04: `event_type` 필드에 두 허용값 나열. 열거 타입명 없음                | 필드명 `event_type` + 도메인 맥락 `Processing` 조합            |
| `AuditLogType`           | CSU-06.06       | ICD 미명시 | OPS-02: 감사 로그 기록 언급. 로그 타입 열거명 없음                             | 도메인 "Audit Log" + 열거 관례 `Type` suffix                   |
| `AuditLogEntry`          | CSU-06.06       | ICD 미명시 | OPS-02: 감사 로그 항목 개념 언급. 타입명 없음                                  | 도메인 "Audit Log" + 단건 레코드 `Entry` suffix                |
| `AlertConditionType`     | CSU-06.07       | ICD 미명시 | ICD 3.3절: Alert 조건 목록 나열. 열거 타입명 없음                              | 도메인 "Alert 조건" + 열거 관례 `Type` suffix                  |
| `AlertCondition`         | CSU-06.07       | ICD 미명시 | ICD 3.3절: Alert 발행 조건 항목 나열. 구조체 타입명 없음                       | 도메인 개념 "Alert 조건"을 단일 타입명으로 변환                |
| `StageMetrics`           | CSU-06.08       | ICD 미명시 | OPS-02: "처리 시간·병목 구간 파악" 언급. 단계별 지표 타입명 없음               | 파이프라인 "단계(Stage)" + 지표를 나타내는 `Metrics` suffix    |
| `PerformanceReport`      | CSU-06.08       | ICD 미명시 | OPS-02: "처리 시간·병목 분석" 결과물 언급. 반환 타입명 없음                    | CSU 명칭 "Performance" + 분석 결과물 `Report` suffix           |

---

## 6. 예외 타입 명칭

| 명칭                      | 발생 CSU     | 등급       | 발생 조건                        | ICD 근거 텍스트                                                 | 파생 규칙                                         |
| ------------------------- | ------------ | ---------- | -------------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| `FileIntegrityError`      | CSU-06.01    | ICD 미명시 | 체크섬 불일치                    | IF-EXT-01: `checksum_sha256` 무결성 검증 명시. 예외 타입명 없음 | 검증 실패 대상("파일 무결성") + `Error` suffix    |
| `ProfileNotFoundError`    | CSU-06.01/02 | ICD 미명시 | 처리 프로파일 선택 실패          | OPS-01: CSU-06.02 프로파일 선택 명시. 예외 타입명 없음          | 실패 대상("프로파일 미발견") + `Error` suffix     |
| `DbError`                 | CSU-06.01    | ICD 미명시 | job 레코드 저장 실패             | IF-INT-08: DbRepository 사용 명시. 예외 타입명 없음             | 실패 대상("DB") + `Error` suffix                  |
| `InvalidTargetLevelError` | CSU-06.03    | ICD 미명시 | 허용되지 않는 target_level 값    | IF-INT-05: `target_product_level` 허용값 나열. 예외 타입명 없음 | 실패 대상("잘못된 target_level") + `Error` suffix |
| `QueuePublishError`       | CSU-06.04    | ICD 미명시 | pgmq 발행 실패                   | IF-INT-05: pgmq 발행 명시. 예외 타입명 없음                     | 실패 대상("큐 발행") + `Error` suffix             |
| `RetryLimitExceededError` | CSU-06.05    | ICD 미명시 | retry_count == 3 도달            | OPS-02: "retry_count == 3 도달 시 Alert" 명시. 예외 타입명 없음 | 실패 대상("재시도 한도 초과") + `Error` suffix    |
| `AlertDeliveryError`      | CSU-06.07    | ICD 미명시 | 알림 발송 실패                   | OPS-02: Alert 발행 명시. 예외 타입명 없음                       | 실패 대상("Alert 전달") + `Error` suffix          |
| `JobNotFoundError`        | CSU-06.08    | ICD 미명시 | job_id에 해당하는 감사 로그 없음 | OPS-02: job 기반 로그 조회 언급. 예외 타입명 없음               | 실패 대상("Job 미발견") + `Error` suffix          |

---

## 7. 참고 — ICD 직접 명시 명칭 (추론 아님)

아래는 ICD IF-INT-08(6.8절)에 클래스명이 직접 기술된 항목으로, 추론 명칭이 아니다.

| 명칭             | CSU       | ICD 명시 위치                              |
| ---------------- | --------- | ------------------------------------------ |
| `DbRepository`   | CSU-01.01 | IF-INT-08: _"제공 클래스: DbRepository"_   |
| `GeoDataManager` | CSU-01.02 | IF-INT-08: _"제공 클래스: GeoDataManager"_ |
| `NasManager`     | CSU-01.03 | IF-INT-08: _"제공 클래스: NasManager"_     |

---

## 8. CDR 이행 체크리스트

CDR에서 아래 항목을 순서대로 처리한다.

- [ ] 위성팀 협의 완료 → `satellite_id` 형식 확정 → `ReceptionEventListener` 파싱 로직 반영
- [ ] 각 CSU 공식 클래스명 CCB 승인
- [ ] 승인된 명칭으로 이 문서 갱신
- [ ] 각 CSU 문서의 간략 노트 제거
- [ ] 코드베이스 명칭 일괄 변경 (rename refactoring)
