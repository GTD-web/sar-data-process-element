# CSC-07 Pipeline Orchestrator -- 작업 파악

> ICD v1.0 (2026-03-20) 기준. 기존 CSU 명세 파일 참조 없이, ICD 본문만으로 정리.

---

## CSC-07이 뭔가

CSC-07은 **Pipeline Workflow Subsystem (PWS)** 소속이고, ICD에서 "Pipeline Orchestrator"라고 부른다.

한마디로: **파이프라인 컨트롤 타워**.

위성 데이터가 들어오면 L0 -> L1 -> L2 -> L3 순서로 처리기(CSC-03~06)들한테 일을 시키고, 결과를 받아서 다음 단계로 넘기고, 실패하면 재시도하고, 다 끝나면 CSC-08한테 "등록해라" 하고 트리거를 쏘는 역할이다.

직접 SAR 데이터를 처리하지는 않는다. **일을 시키고 추적하는 놈**이다.

---

## ICD에서 CSC-07이 언급되는 곳 총정리

### 인터페이스 목록에서

| ID | 명칭 | CSC-07 역할 | ICD 절 |
|---|---|---|---|
| EI-01 | 위성 수신국 원시 데이터 수신 | **소비자** -- 수신 이벤트를 받는다 | 5.1.1 |
| SI-01 | 원시 데이터 NAS 저장 및 수신 이벤트 | **소비자** -- CSC-02가 NAS에 저장한 뒤 이벤트를 받는다 | 2.3 |
| SI-03 | 처리 완료/실패 이벤트 | **소비자** -- CSC-02~06이 보내는 완료/실패 이벤트 수신 | 6.4 |
| SI-04 | 작업 할당 이벤트 | **제공자** -- CSC-03~06한테 작업 배정 | 6.5 |
| SI-05 | 제품 등록 트리거 | **제공자** -- CSC-08한테 등록하라고 트리거 | 6.6 |
| CI-03 | 공통 인프라 서비스 | **소비자** -- CSC-01의 DB/NAS/Geo 모듈 사용 | 6.8 |

### 운영 시나리오에서

| 시나리오 | CSC-07이 하는 일 | ICD 절 |
|---|---|---|
| OPS-01 정상 처리 | 수신 이벤트 받고 -> job 생성 -> 처리 프로파일 선택 -> 단계별 작업 할당 -> 완료 이벤트 수신 -> 다음 단계 할당 -> 마지막에 등록 트리거 | 3.1 |
| OPS-02 실패/재시도 | 실패 이벤트 수신 -> retry_count < 3이면 재시도 -> 3회 도달 시 Alert 발행 -> 운영자가 수동 재처리 요청하면 다시 시작 | 3.2 |
| OPS-03 부분 재처리 | target_level 기반 DAG 생성 -> 해당 레벨부터 파이프라인 재기동 | 3.3 |

---

## CSC-07 내부에 언급되는 CSU들

ICD 본문에서 CSC-07 하위 CSU로 직접 이름이 나오는 것들:

| CSU | 명칭 | ICD에서 언급되는 맥락 |
|---|---|---|
| CSU-07.01 | Reception Event Listener | OPS-01 2단계: "CSU-07.01이 이벤트 수신" |
| CSU-07.02 | Processing Profile Manager | OPS-01 2단계: "CSU-07.02가 처리 프로파일 자동 선택" |
| CSU-07.03 | (DAG 관련) | OPS-03 2단계: "CSU-07.03이 target_level 기반 DAG 생성" |
| CSU-07.04 | Task Queue Manager | OPS-01 3단계: "CSU-07.04가 sdpe.jobs.csc02에 JOB_ASSIGNED 발행", SI-04 제공자 |
| CSU-07.05 | Processing Monitor | SI-03 소비자: "CSU-07.05 Processing Monitor", OPS-02 3단계 |
| CSU-07.06 | Audit Log | OPS-02 6단계: "CSU-07.06 Audit Log 조회" |
| CSU-07.07 | Alert Manager | OPS-02 5단계: "CSU-07.07 Alert Manager가 운영자 알림 발송" |
| CSU-07.08 | Performance Analyzer | OPS-02 6단계: "CSU-07.08 Performance Analyzer에서 처리 시간/병목 분석" |

---

## CSC-07이 주고받는 pgmq 메시지 정리

### 수신하는 큐 (Consumer)

**1) `sdpe.reception.events`** -- EI-01 수신 이벤트

위성 수신국이 NAS에 원시 데이터 저장 후 발행. CSC-07이 파이프라인을 시작하는 트리거.

```
메시지 타입: RAW_DATA_RECEIVED
주요 필드:
  - event_id (UUID) -- 중복 방지 키
  - satellite_id -- 위성 식별자 (TBC)
  - acquisition_start/end -- 촬영 시간
  - raw_data_path -- NAS 파일 경로
  - file_size_bytes -- 파일 크기
  - checksum_sha256 -- 무결성 검증
  - mode -- 촬영 모드 (TBC)
  - polarization -- 편파 (TBC)
  - center_frequency_hz, prf_hz -- 레이더 파라미터 (TBC)
```

**2) `sdpe.processing.events`** -- SI-03 처리 완료/실패 이벤트

CSC-02~06이 처리 끝나면 여기로 보낸다. CSC-07이 받아서 다음 행동 결정.

```
메시지 타입: PROCESSING_COMPLETED 또는 PROCESSING_FAILED
주요 필드:
  - job_id (UUID) -- CSC-07이 부여한 작업 ID
  - event_type -- COMPLETED or FAILED
  - source_csc -- 어디서 보냈나 (예: "CSC-04")
  - product_level -- 처리 완료 레벨 (LEVEL_0 ~ LEVEL_3)
  - output_path -- 결과 파일 경로 (성공 시)
  - output_product_type -- 산출물 유형 (TBC)
  - processing_duration_ms -- 소요 시간 (TBC)
  - error_code / error_message -- 실패 시 (TBD/TBC)
  - retry_count -- 재시도 횟수. 최대 3
```

### 발행하는 큐 (Producer)

**3) `sdpe.jobs.csc03` / `.csc04` / `.csc05` / `.csc06`** -- SI-04 작업 할당

CSC별 전용 큐에 작업을 할당한다.

```
메시지 타입: JOB_ASSIGNED
주요 필드:
  - job_id (UUID)
  - target_csc -- 대상 CSC
  - priority -- 우선순위 1~10 (TBC)
  - input_path -- 입력 파일 NAS 경로
  - processing_profile_id -- 처리 프로파일 ID
  - target_product_level -- 목표 레벨
  - target_product_types -- 산출물 유형 목록 (TBC)
  - processing_params -- 파라미터 오버라이드 (TBD)
  - deadline_utc -- 처리 기한 (TBC)

Visibility Timeout (큐별):
  - sdpe.jobs.csc03: 3,600초 (1시간)
  - sdpe.jobs.csc04: 9,000초 (2.5시간)
  - sdpe.jobs.csc05: 2,700초 (45분)
  - sdpe.jobs.csc06: 1,800초 (30분)
```

**4) `sdpe.catalog.registration`** -- SI-05 제품 등록 트리거

마지막 처리 완료 후 CSC-08한테 등록하라고 보냄.

```
주요 필드:
  - registration_id (UUID)
  - job_id -- 원본 작업 ID
  - product_level -- LEVEL_1 ~ LEVEL_3 (L0은 미발행)
  - product_type -- 산출물 유형 (TBC)
  - product_path -- NAS 경로
  - satellite_id (TBC)
  - acquisition_start/end
  - footprint_wkt -- 공간 범위 WKT (TBC)
  - quality_run -- 품질 검증 실행 여부 (TBC)
```

---

## 정상 흐름 (OPS-01) CSC-07 관점

```
[위성 수신국] --EI-01--> sdpe.reception.events
                              |
                    CSC-07 수신 (07.01)
                    처리 프로파일 선택 (07.02)
                    job 생성 (DB)
                              |
                    07.04 -> sdpe.jobs.csc03 ---> CSC-03 (L0 처리)
                                                      |
                              sdpe.processing.events <-+  (COMPLETED)
                              |
                    CSC-07 수신 (07.05)
                    "L0 끝, 다음은 L1"
                              |
                    07.04 -> sdpe.jobs.csc04 ---> CSC-04 (L1 처리)
                                                      |
                              sdpe.processing.events <-+  (COMPLETED)
                              |
                    ... (L2, L3 반복) ...
                              |
                    마지막 단계 완료
                              |
                    07.05 -> sdpe.catalog.registration ---> CSC-08 (등록)
```

## 실패 흐름 (OPS-02) CSC-07 관점

```
CSC-04 실패 -> sdpe.processing.events (FAILED, retry_count=0)
                    |
          CSC-07 수신 (07.05)
          retry_count(0) < 3 -> 재시도
                    |
          07.04 -> sdpe.jobs.csc04 (retry_count=1)
                    |
          ... 3회 반복 실패 ...
                    |
          retry_count == 3 -> 최종 실패
          07.07 Alert Manager -> 운영자 알림
          job status = FAILED
                    |
          운영자가 원인 파악 후
          UI-01 POST /v1/processing/jobs -> 수동 재처리
          retry_count 초기화, 새 job으로 재시작
```

---

## CSC-07 관련 TBD/TBC 항목 (ICD 8절 기준)

CSC-07 구현에 직접 영향을 주는 미확정 사항들:

| 성숙도 | 항목 | 영향 | 사유 |
|---|---|---|---|
| TBC | satellite_id 형식 | 프로파일 선택 로직, 파일 경로 생성 | 위성팀 협의 필요 |
| TBC | mode/polarization 허용값 | 프로파일 선택 로직 | 위성팀 협의 필요 |
| TBC | SI-04 priority 기본값 | 작업 할당 우선순위 정책 | 내부 결정 대기 |
| TBD | SI-04 processing_params 구조 | 파라미터 오버라이드 설계 | FI 시그니처 확정 후 가능 |
| TBC | SI-05 등록 트리거 발행 CSU | 07.05에서 하는지 다른 CSU에서 하는지 | 내부 설계 결정 필요 |
| TBD | SI-03 error_code 체계 | 실패 처리 분기 로직 | 각 CSC 담당자 취합 필요 |
| TBC | target_product_types 허용값 | JOB_ASSIGNED 메시지 구성 | 내부 결정 대기 |
| TBC | 재시도 간격 (즉시 vs 지수 백오프) | 재시도 로직 구현 | 내부 결정 대기 |

---

## 요약: CSC-07 개발자가 만들어야 하는 것

1. **pgmq 큐 폴링 + 이벤트 핸들링** -- 수신 이벤트, 처리 완료/실패 이벤트
2. **작업 할당 메시지 발행** -- CSC별 전용 큐에 JOB_ASSIGNED 발행
3. **제품 등록 트리거 발행** -- CSC-08에 SI-05 메시지 발행
4. **처리 프로파일 관리** -- satellite/mode/polarization 기반 프로파일 선택
5. **DAG 생성** -- 전체 또는 부분 파이프라인 실행 순서 결정
6. **재시도 로직** -- 최대 3회 자동 재시도, 초과 시 Alert
7. **감사 로그** -- 모든 이벤트 이력 DB 기록 + 조회
8. **Alert 발행** -- 실패/지연/리소스 임계값 초과 시 운영자 알림
9. **성능 분석** -- job별 단계별 처리 시간 분석, SLA 검증
