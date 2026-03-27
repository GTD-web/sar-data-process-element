# CSC-07 Pipeline Orchestrator — 인터페이스 명세

> ICD v1.0 (2026-03-20) 기준으로 작성하였습니다. ICD 본문만으로 정리한 문서입니다.

---

## CSC-07 개요

CSC-07은 **Pipeline Workflow Subsystem (PWS)** 소속이며, ICD에서는 "Pipeline Orchestrator"로 지칭합니다.

CSC-07은 **파이프라인 컨트롤 타워** 역할을 수행합니다.

위성 데이터가 수신되면 L0 → L1 → L2 → L3 순서로 처리기(CSC-02~06)에 작업을 할당하고, 처리 결과를 수신하여 다음 단계로 전달합니다. 처리 실패 시에는 자동 재시도를 수행하며, 모든 처리가 완료되면 CSC-08에 제품 등록 트리거를 발행합니다.

CSC-07은 SAR 데이터를 직접 처리하지 않습니다. **작업을 할당하고 추적하는 오케스트레이션 컴포넌트**입니다.

---

## ICD에서 CSC-07이 언급되는 인터페이스 총정리

### 인터페이스 목록

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

## CSC-07 내부 CSU 구성

ICD 본문에서 CSC-07 하위 CSU로 직접 언급되는 항목은 다음과 같습니다.

| CSU       | 명칭                       | ICD에서 언급되는 맥락                                                         |
| --------- | -------------------------- | ----------------------------------------------------------------------------- |
| CSU-07.01 | Reception Event Listener   | OPS-01 2단계: "CSU-07.01이 이벤트 수신"                                       |
| CSU-07.02 | Processing Profile Manager | OPS-01 2단계: "CSU-07.02가 처리 프로파일 자동 선택"                           |
| CSU-07.03 | DAG Builder                | OPS-03 2단계: "CSU-07.03이 target_level 기반 DAG 생성"                        |
| CSU-07.04 | Task Queue Manager         | OPS-01 3단계: "CSU-07.04가 sdpe.jobs.csc02에 JOB_ASSIGNED 발행". SI-04 제공자 |
| CSU-07.05 | Processing Monitor         | SI-03 소비자: "CSU-07.05 Processing Monitor". OPS-02 3단계 재시도 판단        |
| CSU-07.06 | Audit Log                  | OPS-02 6단계: "CSU-07.06 Audit Log 조회"                                      |
| CSU-07.07 | Alert Manager              | OPS-02 5단계: "CSU-07.07 Alert Manager가 운영자 알림 발송"                    |
| CSU-07.08 | Performance Analyzer       | OPS-02 6단계: "CSU-07.08 Performance Analyzer에서 처리 시간·병목 분석"        |

---

## CSC-07이 주고받는 pgmq 메시지 정리

### 수신하는 큐 (Consumer)

**1) `sdpe.reception.events`** — EI-01 수신 이벤트

위성 수신국이 NAS에 원시 데이터를 저장한 후 발행하는 이벤트입니다. CSC-07이 파이프라인을 시작하는 트리거로 사용합니다.

```
메시지 타입: RAW_DATA_RECEIVED
주요 필드:
  - schema_version (string)     -- 메시지 스키마 버전. 현재 "1.0"
  - event_id (UUID)             -- 중복 수신 방지 키
  - satellite_id (string)       -- 위성 식별자 (TBC)
  - acquisition_start (ISO8601) -- 촬영 시작 UTC
  - acquisition_end (ISO8601)   -- 촬영 종료 UTC
  - raw_data_path (string)      -- NAS 파일 절대 경로
  - file_size_bytes (int64)     -- 파일 크기 (바이트). 전송 완료 검증용
  - checksum_sha256 (string)    -- SHA-256 체크섬. 무결성 검증용
  - mode (string)               -- 촬영 모드. SM/SC/SL 등 (TBC)
  - polarization (string[])     -- 편파 구성. 예: ["HH"], ["HH","HV"] (TBC)
  - center_frequency_hz (float64) -- 레이더 중심 주파수 (Hz) (TBC)
  - prf_hz (float64)            -- Pulse Repetition Frequency (Hz) (TBC)
  - metadata_path (string)      -- 부가 메타데이터 JSON 경로. 선택 필드 (TBD)
```

**2) `sdpe.processing.events`** — SI-03 처리 완료/실패 이벤트

CSC-02~06이 처리를 완료하거나 실패할 때 발행하는 이벤트입니다. CSC-07이 수신하여 다음 행동(다음 단계 할당, 재시도, Alert 발행 등)을 결정합니다.

```
메시지 타입: PROCESSING_COMPLETED 또는 PROCESSING_FAILED
주요 필드:
  - schema_version (string)           -- 메시지 스키마 버전. 현재 "1.0"
  - job_id (UUID)                     -- CSC-07이 부여한 작업 고유 식별자
  - event_type (string)               -- "PROCESSING_COMPLETED" 또는 "PROCESSING_FAILED"
  - source_csc (string)               -- 이벤트 발행 CSC. 예: "CSC-04"
  - product_level (string)            -- 처리 완료 레벨. "LEVEL_0" ~ "LEVEL_3"
  - timestamp (ISO8601)               -- 이벤트 발생 UTC 시각
  - input_path (string)               -- 입력 파일 NAS 경로
  - output_path (string)              -- 결과 파일 NAS 경로. COMPLETED 시 필수, FAILED 시 null
  - output_product_type (string)      -- 산출물 유형. 예: "SLC", "GRD". COMPLETED 시 필수 (TBC)
  - processing_duration_ms (int64)    -- 처리 소요 시간 (밀리초) (TBC)
  - error_code (string)               -- 실패 시 오류 코드 (TBD)
  - error_message (string)            -- 실패 시 사람이 읽을 수 있는 오류 메시지 (TBC)
  - retry_count (int32)               -- 현재까지 재시도 횟수. 최초 시도 = 0, 최대값 = 3
```

### 발행하는 큐 (Producer)

**3) `sdpe.jobs.csc02` / `.csc03` / `.csc04` / `.csc05`** — SI-04 작업 할당

CSC별 전용 큐에 작업을 할당합니다. CSC-07.04 Task Queue Manager가 메시지를 발행합니다.

```
메시지 타입: JOB_ASSIGNED
주요 필드:
  - schema_version (string)           -- 메시지 스키마 버전. 현재 "1.0"
  - job_id (UUID)                     -- 작업 고유 식별자. SI-03 이벤트와 동일 ID 사용
  - message_type (string)             -- "JOB_ASSIGNED" 고정값
  - target_csc (string)               -- 작업 대상 CSC. 예: "CSC-04"
  - priority (int32)                  -- 처리 우선순위. 1(최고) ~ 10(최저). 기본값 TBC
  - timestamp (ISO8601)               -- 작업 할당 UTC 시각
  - input_path (string)               -- 입력 파일 NAS 경로
  - processing_profile_id (UUID)      -- 처리 프로파일 ID
  - target_product_level (string)     -- 목표 처리 레벨. "LEVEL_0" ~ "LEVEL_3"
  - target_product_types (string[])   -- 생성 산출물 유형 목록. 예: ["SLC", "GRD"] (TBC)
  - processing_params (object)        -- 파라미터 오버라이드. 프로파일 기본값 우선 (TBD)
  - deadline_utc (ISO8601)            -- 처리 완료 기한. SLA 모니터링용 (TBC)

Visibility Timeout (큐별, 500GB/4시간 요건에서 역산):
  - sdpe.jobs.csc02: 3,600초 (1시간)   -- 전체 예산 20%
  - sdpe.jobs.csc04: 9,000초 (2.5시간) -- 전체 예산 50%
  - sdpe.jobs.csc05: 2,700초 (45분)    -- 전체 예산 15%
  - sdpe.jobs.csc06: 1,800초 (30분)    -- 전체 예산 10%
  ※ 정상 1회 처리 시 전체 13,500초 < 14,400초(4시간) 충족
```

**4) `sdpe.catalog.registration`** — SI-05 제품 등록 트리거

최종 처리 완료 후 CSC-08에 제품 등록을 요청하는 메시지입니다. Level-1 이상 제품 처리 완료 시 자동 발행되며, Level-0은 발행하지 않습니다.

```
주요 필드:
  - schema_version (string)           -- 메시지 스키마 버전. "1.0" (TBC)
  - registration_id (UUID)            -- 등록 요청 고유 ID (TBC)
  - job_id (UUID)                     -- 원본 처리 작업 ID. SI-04와 연결
  - product_level (string)            -- 등록 대상 레벨. "LEVEL_1" ~ "LEVEL_3"
  - product_type (string)             -- 산출물 유형. 예: "GRD", "SLC" (TBC)
  - product_path (string)             -- NAS 제품 파일 경로
  - satellite_id (string)             -- 위성 식별자 (TBC)
  - acquisition_start (ISO8601)       -- 촬영 시작 UTC 시각
  - acquisition_end (ISO8601)         -- 촬영 종료 UTC 시각
  - footprint_wkt (WKT string)        -- 제품 공간 범위. POLYGON 형식 (TBC)
  - quality_run (boolean)             -- 품질 검증 실행 여부. true 시 CSC-08.02 자동 실행 (TBC)
```

---

## 정상 처리 흐름 (OPS-01) — CSC-07 관점

전체 소요 시간 상한은 14,400초(4시간)이며, 각 단계 목표 시간 합계는 13,680초로 720초(5분)의 여유가 있습니다.

```
[위성 수신국] --EI-01--> sdpe.reception.events
                              |
                    CSC-07 수신 (07.01 Reception Event Listener)
                    처리 프로파일 선택 (07.02 Processing Profile Manager)
                    job 생성 (CSC-01 DB Interface 경유)
                              |
                    07.04 -> sdpe.jobs.csc02 ---> CSC-02 (데이터 수집)
                                                      |    VT: 3,600초
                              sdpe.processing.events <-+  (COMPLETED)
                              |
                    CSC-07 수신 (07.05 Processing Monitor)
                              |
                    07.04 -> sdpe.jobs.csc03 ---> CSC-03 (L0 처리)
                                                      |    경과 목표: 2,880초 이내
                              sdpe.processing.events <-+  (COMPLETED)
                              |
                    07.04 -> sdpe.jobs.csc04 ---> CSC-04 (L1 처리: SLC→GRD→GEC→MAP)
                                                      |    VT: 9,000초, 경과 목표: 7,200초 이내
                              sdpe.processing.events <-+  (COMPLETED)
                              |
                    07.04 -> sdpe.jobs.csc05 ---> CSC-05 (L2 처리: 마스크·탐지·변화)
                                                      |    VT: 2,700초, 경과 목표: 2,160초 이내
                              sdpe.processing.events <-+  (COMPLETED)
                              |
                    07.04 -> sdpe.jobs.csc06 ---> CSC-06 (L3 응용 제품 생성)
                                                      |    VT: 1,800초, 경과 목표: 1,440초 이내
                              sdpe.processing.events <-+  (COMPLETED)
                              |
                    07 -> sdpe.catalog.registration ---> CSC-08 (메타데이터 추출, 품질 검증, STAC 등록)
                                                              status = 'PUBLISHED'
```

## 실패 및 자동 재시도 흐름 (OPS-02) — CSC-07 관점

```
CSC-04 실패 -> sdpe.processing.events (PROCESSING_FAILED, retry_count=0)
                    |
          CSC-07 수신 (07.05 Processing Monitor)
          retry_count(0) < 3 → 재시도 판단
                    |
          07.04 -> sdpe.jobs.csc04 (retry_count=1, VT: 9,000초)
                    |
          ... 반복 실패 시 retry_count 증가 (1 → 2 → 3) ...
                    |
          retry_count == 3 → 최종 실패 판정
          job status = 'FAILED'
          07.07 Alert Manager → 운영자 알림 발송
            (job_id, 마지막 error_code, retry 횟수 포함)
          파이프라인 해당 job 일시 중단
                    |
          운영자: 07.06 Audit Log 조회 (CSC-01 DB Interface 경유)
          운영자: 07.08 Performance Analyzer에서 처리 시간·병목 분석
          원인 파악 및 조치
                    |
          운영자 → UI-01 POST /v1/processing/jobs → CSC-07
          retry_count 초기화, 신규 job으로 재시작
          CSC-04에 작업 재할당 → OPS-01 4단계부터 재개
```

### 재시도 정책 요약

| 항목                  | 정책                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| 최대 자동 재시도 횟수 | 3회 (시스템 설계서 2.2 요건)                                                                                 |
| 재시도 간격           | 즉시 재시도 (즉각성 우선). 지수 백오프 적용 여부: TBC                                                        |
| 재시도 후 처리        | retry_count == 3 도달 시 job status = 'FAILED'. CSC-07.07이 Alert 발행. 수동 개입 전까지 재처리하지 않습니다 |
| 수동 재처리 API       | UI-01 `POST /v1/processing/jobs`. retry_count 초기화 후 신규 job으로 처리합니다                              |

## 부분 재처리 흐름 (OPS-03) — CSC-07 관점

이미 등록된 제품에 대해 특정 레벨부터 파이프라인을 재기동하는 시나리오입니다. 운영자 또는 User Service가 `target_level` 파라미터를 지정하여 요청합니다.

```
[운영자 또는 User Service]
          |
          UI-01 POST /v1/processing/jobs (target_level = 'LEVEL_2')
          |
    CSC-09 → CSC-07 수신
          |
    CSC-07.03 DAG Builder
      target_level 기반 DAG 생성 (이전 단계 건너뜀)
      예: LEVEL_2 지정 시 L1 결과를 입력으로 L2부터 재실행
          |
    07.04 -> sdpe.jobs.csc05 ---> CSC-05 (L2 처리)
                                      |
              sdpe.processing.events <-+  (COMPLETED)
              |
    07.04 -> sdpe.jobs.csc06 ---> CSC-06 (L3 처리)
                                      |
              sdpe.processing.events <-+  (COMPLETED)
              |
    07 -> sdpe.catalog.registration ---> CSC-08
      기존 제품 버전 관리 후 신규 버전 등록 (CSC-08.05 Product Lifecycle Manager)
      이전 버전은 아카이빙 상태로 유지
      User Service가 GET /v1/products/{id} 조회 시 최신 버전 반환
```

---

## 모니터링 임계값 및 Alert 조건

CSC-07.07 Alert Manager가 담당하는 모니터링 항목입니다 (ICD 3.3절, 시스템 설계서 13.2 기준).

| 모니터링 항목        | 임계값                  | 관련 인터페이스       | Alert 발행 경로             |
| -------------------- | ----------------------- | --------------------- | --------------------------- |
| 처리 파이프라인 지연 | 2시간 이상 지연         | SI-03, SI-04          | CSC-07.07 → 운영자 Alert    |
| 처리 실패            | retry_count = 3 도달    | SI-03 (FAILED 이벤트) | CSC-07.07 → 운영자 Alert    |
| 시스템 리소스        | CPU > 90%, 디스크 > 85% | CSC-01 인프라 (CI-03) | Prometheus → Grafana Alert  |
| API 서비스 상태      | 응답 > 5초, 오류율 > 5% | UI-01 (API)           | API Gateway → 운영자 Alert  |
| 데이터 품질          | 품질 기준 미달          | SI-05 (등록 트리거)   | CSC-08.02 → CSC-07.07 Alert |
| 스토리지 용량        | 잔여 용량 20% 이하      | CI-03 (NAS Manager)   | CSC-01 → 운영자 Alert       |

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
| TBC    | SI-05 등록 트리거 발행 CSU        | CSU-07.05에서 발행하는지 다른 CSU에서 발행하는지 결정 필요 | 내부 설계 결정 필요      |
| TBD    | SI-03 error_code 체계             | 실패 처리 분기 로직                                        | 각 CSC 담당자 취합 필요  |
| TBC    | target_product_types 허용값       | JOB_ASSIGNED 메시지 구성                                   | 내부 결정 대기           |
| TBC    | 재시도 간격 (즉시 vs 지수 백오프) | 재시도 로직 구현                                           | 내부 결정 대기           |
| TBC    | output_product_type 허용값 목록   | SI-03 이벤트 처리. 파일명 규칙 PRODUCT_TYPE과 일관성 필요  | 내부 결정 대기           |

### 미확정 항목 해결 의존 관계

아래 선행 항목이 해결되면 연쇄적으로 복수 항목이 해결됩니다.

| 선행 확정 항목                   | 연쇄 해결 항목                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 위성팀: satellite_id 형식 확정   | EI-01 NAS 경로 / 이벤트 satellite_id / 파일명 코드 / CI-01~03 NAS 경로 (4개 항목)                        |
| 위성팀: 촬영 모드·편파 코드 확정 | EI-01 mode/polarization / 파일명 MODE·POL / CSC-07 처리 프로파일 로직 / FI-01 bits_per_sample (4개 항목) |
| FI-02~06 시그니처 전체 확정      | SI-04 processing_params 오버라이드 허용 목록 / CSC-07 처리 프로파일 파라미터 구조                        |

---

## 요약: CSC-07 개발 시 구현해야 하는 항목

1. **pgmq 큐 폴링 및 이벤트 핸들링** — 수신 이벤트(`sdpe.reception.events`), 처리 완료/실패 이벤트(`sdpe.processing.events`) 수신 처리
2. **작업 할당 메시지 발행** — CSC별 전용 큐(`sdpe.jobs.csc02~05`)에 JOB_ASSIGNED 메시지 발행
3. **제품 등록 트리거 발행** — CSC-08에 SI-05 메시지(`sdpe.catalog.registration`) 발행. Level-1 이상만 대상
4. **처리 프로파일 관리** — satellite_id/mode/polarization 기반 프로파일 자동 선택 (CSU-07.02)
5. **DAG 생성** — 전체 파이프라인 또는 target_level 기반 부분 파이프라인 실행 순서 결정 (CSU-07.03)
6. **재시도 로직** — 최대 3회 자동 재시도, retry_count == 3 도달 시 job status = 'FAILED' 처리 및 Alert 발행
7. **감사 로그** — 모든 이벤트 이력을 CSC-01 DB Interface 경유로 기록 및 조회 (CSU-07.06)
8. **Alert 발행** — 처리 실패 3회, 처리 지연 2시간 초과, 리소스 임계값 초과 시 운영자 알림 (CSU-07.07)
9. **성능 분석** — job별·단계별 처리 시간 분석, 500GB/4시간 SLA 검증 (CSU-07.08)
10. **Visibility Timeout 관리** — CSC별 VT 값(3,600/9,000/2,700/1,800초)을 적용하여 작업 큐를 관리합니다
