# CSC-02 인터페이스 타입 정의

> ICD v1.0 (2026-03-20) 기준. **ICD에서 "확정"으로 표기된 필드만** 타입을 정의합니다.
> TBC/TBD 필드는 외부 협의 또는 타 CSC의 결정에 의존하므로, 결정 주체와 함께 별도 표기합니다.

---

## 1. 공통 타입

```typescript
/** ICD 4.2 — pgmq 메시지 공통 필드 (확정) */
type UUID = string;       // UUID v4 (RFC 4122)
type ISO8601 = string;    // ISO 8601 UTC. 예: "2024-03-15T10:30:45.123Z"
type SchemaVersion = '1.0';
```

---

## 2. CSC-02가 수신하는 데이터 (Consumer)

### 2.1 EI-01 — 위성 수신국 원시 데이터 수신

제공자: **위성 수신국** (외부 시스템)

```typescript
/**
 * EI-01 수신 이벤트 (ICD 5.1.1)
 * - 위성 수신국이 NAS에 원시 데이터를 배치한 후 pgmq 이벤트를 발송합니다.
 * - CSC-02는 이 이벤트를 수신하여 무결성 검증 → NAS 저장 → SI-01 발행을 수행합니다.
 * - 스키마 소유자: 위성 수신국 (외부)
 */
interface RawDataReceivedEvent {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  event_id: UUID;                      // 중복 수신 방지 키
  event_type: 'RAW_DATA_RECEIVED';
  acquisition_start: ISO8601;          // 촬영 시작 UTC
  acquisition_end: ISO8601;            // 촬영 종료 UTC
  raw_data_path: string;               // NAS 파일 절대 경로
  file_size_bytes: number;             // 파일 크기 (바이트)
  checksum_sha256: string;             // SHA-256 체크섬

  // ── TBC — 위성팀 협의 필요 ──
  satellite_id: string;                // 위성 식별자. 코드 체계 미확정
  mode: string;                        // 촬영 모드 (SM/SC/SL 등). 허용값 미확정
  polarization: string[];              // 편파 구성. 코드 체계 미확정
  center_frequency_hz: number;         // 레이더 중심 주파수 (Hz)
  prf_hz: number;                      // Pulse Repetition Frequency (Hz)

  // ── TBD — 수신국 협의 필요 ──
  metadata_path?: string | null;       // 부가 메타데이터 JSON 경로
}
```

---

## 3. CSC-02가 발행하는 메시지 (Provider)

### 3.1 SI-01 — 수신 이벤트 (`sdpe.reception.events`)

소비자: **CSC-08** (Pipeline Orchestrator)

```typescript
/**
 * SI-01 수신 이벤트 (ICD 6.1)
 * - CSC-02가 원시 데이터를 NAS에 저장한 후 발행합니다.
 * - CSC-08이 이 이벤트를 수신하여 파이프라인을 시작합니다.
 * - 스키마 소유자: CSC-02
 */
interface ReceptionEvent {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  event_type: 'RAW_DATA_RECEIVED';
  event_id: UUID;                      // 이벤트 고유 식별자
  file_path: string;                   // NAS 내 원시 파일 절대 경로
  file_size_bytes: number;             // 파일 크기 (바이트)
  checksum_sha256: string;             // SHA-256 체크섬 (CSU-02.02에서 검증 완료)
  received_at: ISO8601;                // 수신 완료 UTC 시각

  // ── TBC — 위성팀 협의 필요 ──
  satellite_id: string;                // 위성 식별자
  scene_id: string;                    // 촬영 단위 고유 식별자
}
```

### 3.2 SI-03 — 처리 완료/실패 이벤트 (`sdpe.processing.events`)

소비자: **CSC-08** (Pipeline Orchestrator)

```typescript
/**
 * SI-03 처리 이벤트 (ICD 6.5)
 * - CSC-02가 수신·검증·저장 완료/실패 시 발행합니다.
 * - source_csc = 'CSC-02'
 * - 스키마 소유자: CSC-02~06 + CSC-08 공동 합의
 */
interface ProcessingEvent {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  job_id: UUID;
  event_type: 'PROCESSING_COMPLETED' | 'PROCESSING_FAILED';
  source_csc: 'CSC-02';
  product_level: 'LEVEL_0';           // CSC-02는 항상 LEVEL_0
  timestamp: ISO8601;
  input_path: string;
  output_path: string | null;
  retry_count: number;

  // ── TBC ──
  output_product_type?: string;        // 'RAW'
  processing_duration_ms?: number;
  error_message?: string;

  // ── TBD ──
  error_code?: string;
}
```

---

## 4. 큐 설정

```typescript
/** 큐 설정 */
const QUEUE_CONFIG = {
  /** CSC-02가 수신하는 큐 */
  consume: {
    /** EI-01 수신국 이벤트 (큐명: sdpe.reception.events 또는 별도 큐) */
    // 수신국이 직접 pgmq에 발행하는지, 중간 브로커 경유인지: TBC
  },

  /** CSC-02가 발행하는 큐 */
  produce: {
    /** SI-01 수신 이벤트 */
    RECEPTION_EVENTS: 'sdpe.reception.events',
    /** SI-03 처리 완료/실패 이벤트 */
    PROCESSING_EVENTS: 'sdpe.processing.events',
  },
} as const;
```

---

## 5. 미확정 필드 결정 주체 정리

| 필드 | 인터페이스 | 결정 주체 | 사유 |
|------|-----------|-----------|------|
| `satellite_id` 형식 | EI-01, SI-01 | **위성팀** | 위성 식별 코드 체계를 위성팀이 관리 |
| `scene_id` 명명 규칙 | SI-01 | **위성팀 + CSC-02** | 촬영 단위 식별자 체계 |
| `mode` 허용값 | EI-01 | **위성팀** | 위성 탑재 소프트웨어(OBS) 팀이 모드 코드 확정 |
| `polarization` 허용값 | EI-01 | **위성팀** | 위성 하드웨어 지원 편파 조합에 종속 |
| `metadata_path` | EI-01 | **수신국** | 부가 메타데이터 제공 여부를 수신국이 결정 |
| NAS 저장 경로 규칙 | SI-01 | **위성팀 + CSC-01** | satellite_id 형식 확정 후 경로 규칙 설계 |
| 이벤트 발신 인증 방식 | EI-01 | **수신국 + 보안팀** | 수신국이 pgmq에 직접 발행하는지에 따라 결정 |
| `error_code` 체계 | SI-03 | **CSC-02 + 시스템** | 수신·검증 실패 유형 정의 필요 |
