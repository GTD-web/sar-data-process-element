# CSC-07 Pipeline Orchestrator — 인터페이스 명세

> ICD v1.0 (2026-03-20) 기준으로 작성하였습니다.

---

## CSC-07 개요

CSC-07은 **Pipeline Workflow Subsystem (PWS)** 소속이며, ICD에서는 "Pipeline Orchestrator"로 지칭합니다.

CSC-07은 **파이프라인 컨트롤 타워** 역할을 수행합니다.

위성 데이터가 수신되면 L0 → L1 → L2 → L3 순서로 처리기(CSC-02~06)에 작업을 할당하고, 처리 결과를 수신하여 다음 단계로 전달합니다. 처리 실패 시에는 자동 재시도를 수행하며, 모든 처리가 완료되면 CSC-08에 제품 등록 트리거를 발행합니다.

CSC-07은 SAR 데이터를 직접 처리하지 않습니다. **작업을 할당하고 추적하는 오케스트레이션 컴포넌트**입니다.

내부적으로 수신 이벤트 수신, 처리 프로파일 선택, DAG 생성, 큐 관리, 처리 모니터링, 감사 로그, Alert 발행, 성능 분석 등의 기능을 포함하지만, 내부 CSU 구성은 설계 단계에서 변경될 수 있으므로 본 문서에서는 CSC 수준의 인터페이스만 정의합니다.

---

## ICD에서 CSC-07이 관여하는 인터페이스

| ID    | 명칭                                | CSC-07 역할                                                     | ICD 절 |
| ----- | ----------------------------------- | --------------------------------------------------------------- | ------ |
| EI-01 | 위성 수신국 원시 데이터 수신        | **소비자** — 수신 이벤트를 수신합니다                           | 5.1.1  |
| SI-01 | 원시 데이터 NAS 저장 및 수신 이벤트 | **소비자** — CSC-02가 NAS에 저장한 후 이벤트를 수신합니다       | 2.3    |
| SI-03 | 처리 완료/실패 이벤트               | **소비자** — CSC-02~06이 발행하는 완료/실패 이벤트를 수신합니다 | 6.4    |
| SI-04 | 작업 할당 이벤트                    | **제공자** — CSC-02~06에 작업을 할당합니다                      | 6.5    |
| SI-05 | 제품 등록 트리거                    | **제공자** — CSC-08에 제품 등록 트리거를 발행합니다             | 6.6    |
| CI-03 | 공통 인프라 서비스                  | **소비자** — CSC-01의 DB/NAS/Geo 모듈을 사용합니다              | 6.8    |

### 운영 시나리오

| 시나리오           | CSC-07 수행 내용                                                                                                                        | ICD 절 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| OPS-01 정상 처리   | 수신 이벤트 수신 → job 생성 → 처리 프로파일 선택 → 단계별 작업 할당 → 완료 이벤트 수신 → 다음 단계 할당 → 최종 완료 시 등록 트리거 발행 | 3.1    |
| OPS-02 실패/재시도 | 실패 이벤트 수신 → retry_count < 3이면 자동 재시도 → 3회 도달 시 Alert 발행 → 운영자 수동 재처리 요청 시 재시작                         | 3.2    |
| OPS-03 부분 재처리 | target_level 기반 DAG 생성 → 해당 레벨부터 파이프라인 재기동 → 기존 제품 버전 관리 후 신규 버전 등록                                    | 3.3    |

---

## CSC-07이 주고받는 pgmq 메시지 정리

각 메시지의 TypeScript interface, 큐 설정, 미확정 필드 결정 주체는 [interfaces.md](./interfaces.md)를 참조하세요.

### 수신하는 큐 (Consumer)

| 큐명 | 인터페이스 | 메시지 타입 | 설명 |
|------|-----------|-------------|------|
| `sdpe.reception.events` | EI-01 | `RAW_DATA_RECEIVED` | 위성 수신국이 NAS에 원시 데이터를 저장한 후 발행. CSC-07이 파이프라인을 시작하는 트리거 |
| `sdpe.processing.events` | SI-03 | `PROCESSING_COMPLETED` / `PROCESSING_FAILED` | CSC-02~06이 처리 완료 또는 실패 시 발행. CSC-07이 다음 단계 할당 / 재시도 / Alert을 결정 |

### 발행하는 큐 (Producer)

| 큐명 | 인터페이스 | 메시지 타입 | 설명 |
|------|-----------|-------------|------|
| `sdpe.jobs.csc02` ~ `.csc06` | SI-04 | `JOB_ASSIGNED` | CSC별 전용 큐에 작업 할당. VT: csc02=3,600초, csc04=9,000초, csc05=2,700초, csc06=1,800초 |
| `sdpe.catalog.registration` | SI-05 | (등록 트리거) | Level-1 이상 제품 처리 완료 시 CSC-08에 등록 요청. Level-0은 미발행 |

---

## 정상 처리 흐름 (OPS-01) — CSC-07 관점

전체 소요 시간 상한은 14,400초(4시간)이며, 각 단계 목표 시간 합계는 13,680초로 720초(5분)의 여유가 있습니다.

```mermaid
sequenceDiagram
    participant GS as 위성 수신국
    participant Q_RX as sdpe.reception.events
    participant CSC07 as CSC-07<br/>Pipeline Orchestrator
    participant DB as CSC-01<br/>DB Interface
    participant Q_PE as sdpe.processing.events
    participant CSC02 as CSC-02<br/>데이터 수집
    participant CSC03 as CSC-03<br/>L0 처리
    participant CSC04 as CSC-04<br/>L1 처리
    participant CSC05 as CSC-05<br/>L2 처리
    participant CSC06 as CSC-06<br/>L3 처리
    participant Q_CR as sdpe.catalog.registration
    participant CSC08 as CSC-08<br/>제품 등록

    GS->>Q_RX: EI-01 RAW_DATA_RECEIVED
    Q_RX->>CSC07: 이벤트 수신
    CSC07->>DB: 작업 생성 + 처리 프로파일 선택

    critical CSC-02 데이터 수집 [VT: 3,600초]
        CSC07-->>CSC02: SI-04 JOB_ASSIGNED (sdpe.jobs.csc02)
        CSC02->>Q_PE: SI-03 COMPLETED
        Q_PE->>CSC07: 완료 수신
    end

    critical CSC-03 L0 처리 [경과 목표: 2,880초 이내]
        CSC07-->>CSC03: SI-04 JOB_ASSIGNED (sdpe.jobs.csc03)
        CSC03->>Q_PE: SI-03 COMPLETED (HDF5→NAS)
        Q_PE->>CSC07: 완료 수신
    end

    critical CSC-04 L1 처리 [VT: 9,000초 / 경과 목표: 7,200초 이내]
        CSC07-->>CSC04: SI-04 JOB_ASSIGNED (sdpe.jobs.csc04)
        CSC04->>Q_PE: SI-03 COMPLETED (SLC/GRD/GEC/MAP→NAS)
        Q_PE->>CSC07: 완료 수신
    end

    critical CSC-05 L2 처리 [VT: 2,700초 / 경과 목표: 2,160초 이내]
        CSC07-->>CSC05: SI-04 JOB_ASSIGNED (sdpe.jobs.csc05)
        CSC05->>Q_PE: SI-03 COMPLETED (마스크/탐지/변화→NAS)
        Q_PE->>CSC07: 완료 수신
    end

    critical CSC-06 L3 처리 [VT: 1,800초 / 경과 목표: 1,440초 이내]
        CSC07-->>CSC06: SI-04 JOB_ASSIGNED (sdpe.jobs.csc06)
        CSC06->>Q_PE: SI-03 COMPLETED (응용 제품→NAS)
        Q_PE->>CSC07: 완료 수신
    end

    CSC07->>Q_CR: SI-05 등록 트리거
    Q_CR->>CSC08: 메타데이터 추출 + 품질 검증 + STAC 등록
    Note over CSC08: status = PUBLISHED
```

## 실패 및 자동 재시도 흐름 (OPS-02) — CSC-07 관점

```mermaid
sequenceDiagram
    participant CSC04 as CSC-04<br/>L1 처리
    participant Q_PE as sdpe.processing.events
    participant CSC07 as CSC-07<br/>Pipeline Orchestrator
    participant OP as 운영자
    participant CSC09 as CSC-09<br/>Data API

    loop 자동 재시도 (최대 3회)
        CSC04->>Q_PE: SI-03 PROCESSING_FAILED
        Q_PE->>CSC07: 실패 수신
        CSC07->>CSC07: retry_count < 3 → 재시도 판단
        CSC07-->>CSC04: SI-04 JOB_ASSIGNED 재발행 (retry_count 증가)
    end

    CSC04->>Q_PE: SI-03 PROCESSING_FAILED (retry_count=3)
    Q_PE->>CSC07: 실패 수신
    CSC07->>CSC07: retry_count == 3 → job status = FAILED
    CSC07->>OP: Alert 발송 (job_id, error_code, retry 횟수)
    Note over CSC07: 해당 job 일시 중단

    break 운영자 수동 개입
        OP->>CSC07: 감사 로그 조회 (CSC-01 DB 경유)
        OP->>CSC07: 성능 분석 (처리 시간·병목)
        Note over OP: 원인 파악 및 조치
        OP->>CSC09: POST /v1/processing/jobs (수동 재처리)
        CSC09->>CSC07: 재처리 요청 전달
        CSC07->>CSC07: retry_count 초기화, 신규 job 생성
        CSC07-->>CSC04: SI-04 JOB_ASSIGNED (신규 job)
        Note over CSC04: OPS-01 4단계부터 재개
    end
```

### 재시도 정책 요약

| 항목                  | 정책                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| 최대 자동 재시도 횟수 | 3회 (시스템 설계서 2.2 요건)                                                                        |
| 재시도 간격           | 즉시 재시도 (즉각성 우선). 지수 백오프 적용 여부: TBC                                               |
| 재시도 후 처리        | retry_count == 3 도달 시 job status = 'FAILED'. Alert 발행. 수동 개입 전까지 재처리하지 않습니다    |
| 수동 재처리 API       | UI-01 `POST /v1/processing/jobs`. retry_count 초기화 후 신규 job으로 처리합니다                     |

## 부분 재처리 흐름 (OPS-03) — CSC-07 관점

이미 등록된 제품에 대해 특정 레벨부터 파이프라인을 재기동하는 시나리오입니다. 운영자 또는 User Service가 `target_level` 파라미터를 지정하여 요청합니다.

```mermaid
sequenceDiagram
    participant OP as 운영자 / User Service
    participant CSC09 as CSC-09<br/>Data API
    participant CSC07 as CSC-07<br/>Pipeline Orchestrator
    participant Q_PE as sdpe.processing.events
    participant CSC05 as CSC-05<br/>L2 처리
    participant CSC06 as CSC-06<br/>L3 처리
    participant Q_CR as sdpe.catalog.registration
    participant CSC08 as CSC-08<br/>제품 등록

    OP->>CSC09: POST /v1/processing/jobs<br/>(target_level = LEVEL_2)
    CSC09->>CSC07: 재처리 요청 전달
    CSC07->>CSC07: target_level 기반 DAG 생성<br/>(L0·L1 단계 건너뜀)

    critical L1 결과를 입력으로 L2부터 재실행
        CSC07-->>CSC05: SI-04 JOB_ASSIGNED (sdpe.jobs.csc05)
        CSC05->>Q_PE: SI-03 COMPLETED
        Q_PE->>CSC07: 완료 수신
    end

    critical CSC-06 L3 처리
        CSC07-->>CSC06: SI-04 JOB_ASSIGNED (sdpe.jobs.csc06)
        CSC06->>Q_PE: SI-03 COMPLETED
        Q_PE->>CSC07: 완료 수신
    end

    CSC07->>Q_CR: SI-05 등록 트리거
    Q_CR->>CSC08: 신규 버전 등록
    Note over CSC08: 기존 버전 아카이빙<br/>최신 버전 PUBLISHED

    OP->>CSC09: GET /v1/products/{id}
    Note over CSC09: 최신 버전 반환
```

---

## 모니터링 임계값 및 Alert 조건

CSC-07이 담당하는 모니터링 항목입니다 (ICD 3.3절, 시스템 설계서 13.2 기준).

| 모니터링 항목        | 임계값                  | 관련 인터페이스       | Alert 발행 경로            |
| -------------------- | ----------------------- | --------------------- | -------------------------- |
| 처리 파이프라인 지연 | 2시간 이상 지연         | SI-03, SI-04          | CSC-07 → 운영자 Alert      |
| 처리 실패            | retry_count = 3 도달    | SI-03 (FAILED 이벤트) | CSC-07 → 운영자 Alert      |
| 시스템 리소스        | CPU > 90%, 디스크 > 85% | CSC-01 인프라 (CI-03) | Prometheus → Grafana Alert |
| API 서비스 상태      | 응답 > 5초, 오류율 > 5% | UI-01 (API)           | API Gateway → 운영자 Alert |
| 데이터 품질          | 품질 기준 미달          | SI-05 (등록 트리거)   | CSC-08 → CSC-07 Alert      |
| 스토리지 용량        | 잔여 용량 20% 이하      | CI-03 (NAS Manager)   | CSC-01 → 운영자 Alert      |

Alert 발행 조건 요약:

1. 처리 실패 3회 도달
2. 처리 지연 2시간 초과 (시스템 설계서 13.2)
3. CPU > 90%, 디스크 > 85%
4. API 오류율 > 5%

---

## CSC-07 관련 TBD/TBC 항목 (ICD 8절 기준)

CSC-07 구현에 직접 영향을 주는 미확정 사항입니다.

| 성숙도 | 항목                              | 영향                                                       | 사유                     |
| ------ | --------------------------------- | ---------------------------------------------------------- | ------------------------ |
| TBC    | satellite_id 형식                 | 프로파일 선택 로직, 파일 경로 생성                         | 위성팀 협의 필요         |
| TBC    | mode/polarization 허용값          | 프로파일 선택 로직                                         | 위성팀 협의 필요         |
| TBC    | SI-04 priority 기본값             | 작업 할당 우선순위 정책                                    | 내부 결정 대기           |
| TBD    | SI-04 processing_params 구조      | 파라미터 오버라이드 설계                                   | FI 시그니처 확정 후 가능 |
| TBD    | SI-03 error_code 체계             | 실패 처리 분기 로직                                        | 각 CSC 담당자 취합 필요  |
| TBC    | target_product_types 허용값       | JOB_ASSIGNED 메시지 구성                                   | 내부 결정 대기           |
| TBC    | 재시도 간격 (즉시 vs 지수 백오프) | 재시도 로직 구현                                           | 내부 결정 대기           |
| TBC    | output_product_type 허용값 목록   | SI-03 이벤트 처리. 파일명 규칙 PRODUCT_TYPE과 일관성 필요  | 내부 결정 대기           |

### 미확정 항목 해결 의존 관계

| 선행 확정 항목                   | 연쇄 해결 항목                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 위성팀: satellite_id 형식 확정   | EI-01 NAS 경로 / 이벤트 satellite_id / 파일명 코드 / CI-01~03 NAS 경로 (4개 항목)                        |
| 위성팀: 촬영 모드·편파 코드 확정 | EI-01 mode/polarization / 파일명 MODE·POL / CSC-07 처리 프로파일 로직 / FI-01 bits_per_sample (4개 항목) |
| FI-02~06 시그니처 전체 확정      | SI-04 processing_params 오버라이드 허용 목록 / CSC-07 처리 프로파일 파라미터 구조                        |
