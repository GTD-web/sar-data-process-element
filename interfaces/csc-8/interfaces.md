# CSC-08 인터페이스 타입 정의

> ICD v1.0 (2026-03-20) 기준. **ICD에서 "확정"으로 표기된 필드만** 타입을 정의합니다.
> TBC/TBD 필드는 외부 협의 또는 타 CSC의 결정에 의존하므로, 결정 주체와 함께 별도 표기합니다.

---

## 1. 공통 타입

ICD 4.2절에서 확정된 pgmq 메시지 공통 규칙을 타입으로 정의합니다.

```typescript
/** ICD 4.2 — pgmq 메시지 공통 필드 (확정) */
type UUID = string;       // UUID v4 (RFC 4122)
type ISO8601 = string;    // ISO 8601 UTC. 예: "2024-03-15T10:30:45.123Z"
type SchemaVersion = '1.0';

/** ICD 6.5 — 처리 레벨 (확정) */
type ProductLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

/** ICD 6.6 — 작업 대상 CSC (확정) */
type TargetCsc = 'CSC-03' | 'CSC-04' | 'CSC-05' | 'CSC-06';

/** ICD 6.5 — 이벤트 발행 CSC (확정) */
type SourceCsc = 'CSC-02' | 'CSC-03' | 'CSC-04' | 'CSC-05' | 'CSC-06';
```

---

## 2. CSC-08이 수신하는 메시지 (Consumer)

CSC-08은 아래 메시지의 **소비자**입니다. 스키마 결정 권한은 제공자 측에 있으며,
CSC-08은 ICD에서 합의된 확정 필드를 기준으로 파싱합니다.

### 2.1 SI-01 / EI-01 — 수신 이벤트 (`sdpe.reception.events`)

제공자: **CSC-02** (Raw Data Collector, DCS). 원본 이벤트는 위성 수신국(EI-01)에서 시작됩니다.

```typescript
/**
 * SI-01 / EI-01 수신 이벤트 (ICD 5.1.1, 6.1)
 * - CSC-02가 원시 데이터를 NAS에 저장한 후 발행합니다.
 * - CSC-08이 파이프라인을 시작하는 트리거입니다.
 * - 스키마 소유자: CSC-02 (SI-01) / 위성 수신국 (EI-01 원본)
 */
interface RawDataReceivedEvent {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  event_id: UUID;                      // 중복 수신 방지 키
  event_type: 'RAW_DATA_RECEIVED';
  file_path: string;                   // NAS 내 원시 파일 절대 경로
  file_size_bytes: number;             // 파일 크기 (바이트)
  checksum_sha256: string;             // SHA-256 체크섬 (CSC-02에서 검증 완료)
  received_at: ISO8601;                // 수신 완료 UTC 시각

  // ── 확정 (EI-01 원본 필드) ──
  acquisition_start: ISO8601;          // 촬영 시작 UTC
  acquisition_end: ISO8601;            // 촬영 종료 UTC
  raw_data_path: string;               // NAS 파일 절대 경로 (EI-01 원본)

  // ── TBC — 위성팀 협의 필요 ──
  satellite_id: string;                // 위성 식별자. 코드 체계 미확정
  scene_id: string;                    // 촬영 단위 고유 식별자
  mode: string;                        // 촬영 모드 (SM/SC/SL 등). 허용값 미확정
  polarization: string[];              // 편파 구성. 코드 체계 미확정
  center_frequency_hz: number;         // 레이더 중심 주파수 (Hz)
  prf_hz: number;                      // Pulse Repetition Frequency (Hz)

  // ── TBD — 수신국 협의 필요 ──
  metadata_path?: string | null;       // 부가 메타데이터 JSON 경로
}
```

### 2.2 SI-03 — 처리 완료/실패 이벤트 (`sdpe.processing.events`)

제공자: **CSC-02~06** (각 처리 컴포넌트). 오류 코드는 각 CSC가 정의합니다.

```typescript
/**
 * SI-03 처리 이벤트 (ICD 6.5)
 * - CSC-02~06이 발행하고, CSC-08이 수신합니다.
 * - CSC-08은 이 이벤트를 기반으로 다음 단계 할당 / 재시도 / Alert을 결정합니다.
 * - 스키마 소유자: CSC-02~06 (제공자) + CSC-08 (소비자) 공동 합의
 */
interface ProcessingEvent {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  job_id: UUID;                        // CSC-08이 부여한 작업 식별자
  event_type: 'PROCESSING_COMPLETED' | 'PROCESSING_FAILED';
  source_csc: SourceCsc;               // 이벤트 발행 CSC
  product_level: ProductLevel;         // 처리 완료 레벨
  timestamp: ISO8601;                  // 이벤트 발생 UTC
  input_path: string;                  // 입력 파일 NAS 경로
  output_path: string | null;          // 결과 NAS 경로. COMPLETED 시 필수, FAILED 시 null
  retry_count: number;                 // 재시도 횟수 (0~3). 최대값 = 3 (시스템 설계서 2.2)

  // ── TBC — 내부 결정 대기 (산출물 유형 코드 확정 필요) ──
  output_product_type?: string;        // 산출물 유형. COMPLETED 시 필수
  processing_duration_ms?: number;     // 처리 소요 시간 (ms)
  error_message?: string;              // 실패 시 사람이 읽을 수 있는 오류 메시지

  // ── TBD — 각 CSC 담당자 취합 필요 ──
  error_code?: string;                 // 실패 시 오류 코드. 코드 체계 미설계
}
```

### 2.3 SI-07 — 재처리 요청 (CSC-09 → CSC-08)

제공자: **CSC-09** (Data API Provider)

```typescript
/**
 * SI-07 재처리 요청 (ICD 6.9)
 * - CSC-09이 운영자/LIID의 수동 재처리 요청을 받아 CSC-08에 전달합니다.
 * - 전달 매체: 내부 REST API 또는 pgmq 직접 발행. 방식: TBC
 * - 인터페이스 전체가 TBC 상태
 */
interface ReprocessingRequest {
  // ── TBC — CSC-08 + CSC-09 협의 필요 ──
  job_id?: UUID;                       // 기존 job 재처리 시
  scene_id?: string;                   // scene 기반 재처리 시
  target_level: string;                // 처리 시작 레벨. 예: 'LEVEL_2'
  priority?: number;                   // 우선순위
}
```

### 2.4 SI-08 — 등록 완료 통보 (CSC-07 → CSC-08)

제공자: **CSC-07** (Product & Catalog Manager)

```typescript
/**
 * SI-08 등록 완료 통보 (ICD 6.10)
 * - CSC-07이 등록 완료/실패 시 CSC-08에 통보합니다.
 * - 이 인터페이스가 없으면 CSC-08은 파이프라인 전체 완료 여부를 판단할 수 없습니다.
 * - 인터페이스 전체가 TBD 상태
 * - 선행 의존: sar_products 전체 스키마 확정 (SI-06) 이후 설계 착수 가능
 */
interface CatalogRegistrationResult {
  // ── TBD — 전체 스키마 미설계 ──
  // 예상 필드 (확정 아님, 설계 참고용):
  // schema_version: SchemaVersion;
  // job_id: UUID;
  // event_type: 'CATALOG_REGISTERED' | 'CATALOG_FAILED';
  // product_id: UUID;
  // timestamp: ISO8601;
  // error_message?: string;
}
```

---

## 3. CSC-08이 발행하는 메시지 (Provider)

CSC-08은 아래 메시지의 **제공자**입니다. 확정 필드의 스키마는 CSC-08이 정의 권한을 가집니다.
단, TBC/TBD 필드는 소비자(CSC-03~06, CSC-07) 및 외부 협의 결과에 따라 결정됩니다.

### 3.1 SI-04 — 작업 할당 메시지 (`sdpe.jobs.csc{XX}`)

소비자: **CSC-03~06** (각 처리 컴포넌트)

```typescript
/**
 * SI-04 작업 할당 메시지 (ICD 6.6)
 * - CSC-08이 CSC별 전용 큐에 발행합니다.
 * - 스키마 소유자: CSC-08
 */
interface JobAssignedMessage {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  job_id: UUID;                        // 작업 고유 식별자
  message_type: 'JOB_ASSIGNED';
  target_csc: TargetCsc;               // 작업 대상 CSC
  timestamp: ISO8601;                  // 작업 할당 UTC
  input_path: string;                  // 입력 파일 NAS 경로
  processing_profile_id: UUID;         // 처리 프로파일 ID
  target_product_level: ProductLevel;  // 목표 처리 레벨

  // ── TBC — 소비자(CSC-03~06)와 협의 필요 ──
  priority: number;                    // 1(최고)~10(최저). 기본값 미확정
  target_product_types: string[];      // 생성 산출물 유형 목록. 허용값 미확정
  deadline_utc?: ISO8601;              // 처리 완료 기한
  trigger_source: string;              // PIPELINE_AUTO / MANUAL_REQUEST / PARTIAL_REPROCESS
  start_level: string;                 // 처리 시작 레벨. 정상: LEVEL_0, 부분 재처리: target_level
  is_retry_reset: boolean;             // retry_count 초기화 여부

  // ── TBD — FI 시그니처 확정 후 결정 가능 ──
  processing_params?: Record<string, unknown>; // 파라미터 오버라이드. 구조 미설계
}
```

### 3.2 SI-05 — 제품 등록 트리거 (`sdpe.catalog.registration`)

소비자: **CSC-07** (Product & Catalog Manager)

```typescript
/**
 * SI-05 제품 등록 트리거 (ICD 6.7)
 * - Level-1 이상 제품 처리 완료 시 CSC-08이 발행합니다. Level-0은 미발행.
 * - 스키마 소유자: CSC-08 + CSC-07 공동 합의
 * - SI-05 인터페이스 자체가 TBC 상태 (ICD 2.3)
 */
interface CatalogRegistrationMessage {
  // ── 확정 필드 ──
  job_id: UUID;                        // 원본 처리 작업 ID (SI-04와 연결)
  product_level: 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3'; // Level-0 제외
  product_path: string;                // NAS 제품 파일 경로
  acquisition_start: ISO8601;          // 촬영 시작 UTC
  acquisition_end: ISO8601;            // 촬영 종료 UTC

  // ── TBC — CSC-07과 협의 필요 ──
  schema_version: SchemaVersion;
  registration_id: UUID;               // 등록 요청 고유 ID
  product_type: string;                // 산출물 유형 (GRD, SLC 등)
  satellite_id: string;                // 위성 식별자
  footprint_wkt: string;               // WKT POLYGON 형식
  quality_run: boolean;                // 품질 검증 실행 여부
}
```

---

## 4. 큐 설정 (확정)

ICD 6.6절에서 확정된 큐 이름과 Visibility Timeout 값입니다.
VT는 시스템 설계서 2.2 '500GB / 4시간(14,400초)' 요건에서 역산한 값입니다.

```typescript
/** 큐 설정 — 확정 (ICD 6.6) */
const QUEUE_CONFIG = {
  /** CSC-08이 수신하는 큐 */
  consume: {
    /** SI-01 수신 이벤트 */
    RECEPTION_EVENTS: 'sdpe.reception.events',
    /** SI-03 처리 완료/실패 이벤트 */
    PROCESSING_EVENTS: 'sdpe.processing.events',
    /** SI-07 재처리 요청 (전달 매체 TBC) */
    // REPROCESSING: TBC
    /** SI-08 등록 완료 통보 (큐명 TBD) */
    // CATALOG_RESULT: TBD
  },

  /** CSC-08이 발행하는 큐 */
  produce: {
    /** SI-04 작업 할당 — CSC별 전용 큐 */
    JOBS_CSC03: { queue: 'sdpe.jobs.csc03', visibilityTimeoutSec: 3_600 },  // 1시간 (20%)
    JOBS_CSC04: { queue: 'sdpe.jobs.csc04', visibilityTimeoutSec: 9_000 },  // 2.5시간 (50%)
    JOBS_CSC05: { queue: 'sdpe.jobs.csc05', visibilityTimeoutSec: 2_700 },  // 45분 (15%)
    JOBS_CSC06: { queue: 'sdpe.jobs.csc06', visibilityTimeoutSec: 1_800 },  // 30분 (10%)

    /** SI-05 제품 등록 트리거 (큐명 TBC) */
    CATALOG_REGISTRATION: 'sdpe.catalog.registration',
  },
} as const;
```

---

## 5. 재시도 정책 상수 (확정)

ICD 3.5절 및 시스템 설계서 2.2에서 확정된 값입니다.

```typescript
/** 재시도 정책 — 확정 (ICD 3.5, 시스템 설계서 2.2) */
const RETRY_POLICY = {
  /** 최대 자동 재시도 횟수. 시스템 설계서 2.2 '자동 재시도 3회' */
  MAX_RETRY_COUNT: 3,

  /** retry_count == MAX_RETRY_COUNT 도달 시 Alert 발행 */
  ALERT_ON_MAX_RETRY: true,
} as const;

// ── TBC — 내부 결정 대기 ──
// - 재시도 간격: 즉시 재시도 vs 지수 백오프
// - DLQ 정책: 메시지 보존 기간, Dead Letter Queue 처리 방식
```

---

## 6. 미확정 필드 결정 주체 정리

이 문서에서 TBC/TBD로 남긴 필드가 누구의 결정을 기다리는지 정리합니다.

| 필드 | 인터페이스 | 결정 주체 | 사유 |
|------|-----------|-----------|------|
| `satellite_id` 형식 | EI-01, SI-01, SI-05 | **위성팀** | 위성 식별 코드 체계를 위성팀이 관리 |
| `scene_id` 명명 규칙 | SI-01 | **위성팀 + CSC-02** | 촬영 단위 식별자 체계 |
| `mode` 허용값 | EI-01 | **위성팀** | 위성 탑재 소프트웨어(OBS) 팀이 모드 코드 확정 |
| `polarization` 허용값 | EI-01 | **위성팀** | 위성 하드웨어 지원 편파 조합에 종속 |
| `center_frequency_hz` | EI-01 | **위성팀** | 위성 탑재 SAR 센서 하드웨어 규격 |
| `prf_hz` | EI-01 | **위성팀** | 위성 탑재 SAR 센서 하드웨어 규격 |
| `metadata_path` | EI-01 | **수신국** | 부가 메타데이터 제공 여부를 수신국이 결정 |
| `error_code` 체계 | SI-03 | **CSC-02~06 각 담당자** | 각 CSC에서 발생 가능한 오류 유형을 취합해야 함 |
| `error_message` | SI-03 | **CSC-02~06 각 담당자** | 오류 코드 체계와 연동 |
| `output_product_type` | SI-03 | **CSC-02~06 + 시스템** | 산출물 유형 코드 전체 목록 (파일명 규칙과 일관성) |
| `processing_duration_ms` | SI-03 | **CSC-02~06** | 각 CSC가 처리 시간을 측정하여 보고 |
| `priority` 기본값 | SI-04 | **시스템 전체** | 운영 정책에 따라 결정 |
| `target_product_types` | SI-04 | **CSC-03~06** | 각 CSC가 생성 가능한 산출물 유형을 정의해야 함 |
| `processing_params` | SI-04 | **알고리즘 팀 (FI)** | FI-02~06 함수 시그니처 확정 후 파라미터 구조 결정 |
| `deadline_utc` | SI-04 | **시스템 전체** | SLA 정책에 따라 결정 |
| `trigger_source` 허용값 | SI-04 | **CSC-08 + CSC-09** | 작업 할당 출처 코드 전체 목록 |
| `start_level` 기본값 | SI-04 | **CSC-08** | 정상/부분 재처리 시 허용값 |
| SI-05 TBC 필드 전체 | SI-05 | **CSC-08 + CSC-07** | SI-05 인터페이스 자체가 TBC |
| SI-07 전달 매체·스키마 | SI-07 | **CSC-08 + CSC-09** | REST vs pgmq 방식 결정 필요 |
| SI-08 전체 스키마 | SI-08 | **CSC-07 + CSC-08** | sar_products 스키마 확정 선행 필요 |

### 결정 순서 의존 관계

```
위성팀 확정 (satellite_id, mode, polarization)
  → EI-01/SI-01 TBC 필드 해소
  → 파일명 규칙 SATELLITE_ID / MODE / POL 코드 확정

각 CSC 담당자 취합 (error_code, output_product_type)
  → SI-03 TBC/TBD 필드 해소
  → SI-04 target_product_types 허용값 확정

알고리즘 팀 FI 시그니처 확정
  → SI-04 processing_params 구조 확정

CSC-08 + CSC-07 합의
  → SI-05 TBC 필드 전체 해소

sar_products 스키마 확정 (CSC-07 + CSC-09)
  → SI-08 전체 설계 착수 가능
```
