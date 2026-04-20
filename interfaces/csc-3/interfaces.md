# CSC-03 인터페이스 타입 정의

> ICD v1.0 (2026-03-20) 기준. **ICD에서 "확정"으로 표기된 필드만** 타입을 정의합니다.
> TBC/TBD 필드는 외부 협의 또는 타 CSC의 결정에 의존하므로, 결정 주체와 함께 별도 표기합니다.

---

## 1. 공통 타입

```typescript
/** ICD 4.2 — pgmq 메시지 공통 필드 (확정) */
type UUID = string;
type ISO8601 = string;
type SchemaVersion = '1.0';
type ProductLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';
```

---

## 2. CSC-03이 수신하는 메시지 (Consumer)

### 2.1 SI-04 — 작업 할당 (`sdpe.jobs.csc03`)

제공자: **CSC-08** (Pipeline Orchestrator)

```typescript
/**
 * SI-04 작업 할당 메시지 (ICD 6.6)
 * - CSC-08이 L0 처리 작업을 할당합니다.
 * - Visibility Timeout: 3,600초 (1시간)
 */
interface JobAssignedMessage {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  job_id: UUID;
  message_type: 'JOB_ASSIGNED';
  target_csc: 'CSC-03';
  timestamp: ISO8601;
  input_path: string;                  // 원시 데이터 NAS 경로
  processing_profile_id: UUID;
  target_product_level: 'LEVEL_0';

  // ── TBC ──
  priority: number;
  target_product_types: string[];
  deadline_utc?: ISO8601;
  trigger_source: string;
  start_level: string;
  is_retry_reset: boolean;

  // ── TBD ──
  processing_params?: Record<string, unknown>;
}
```

---

## 3. CSC-03이 발행하는 메시지 (Provider)

### 3.1 SI-03 — 처리 완료/실패 이벤트 (`sdpe.processing.events`)

소비자: **CSC-08** (Pipeline Orchestrator)

```typescript
/**
 * SI-03 처리 이벤트 (ICD 6.5)
 * - source_csc = 'CSC-03', product_level = 'LEVEL_0'
 */
interface ProcessingEvent {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  job_id: UUID;
  event_type: 'PROCESSING_COMPLETED' | 'PROCESSING_FAILED';
  source_csc: 'CSC-03';
  product_level: 'LEVEL_0';
  timestamp: ISO8601;
  input_path: string;
  output_path: string | null;          // HDF5 NAS 경로. COMPLETED 시 필수
  retry_count: number;

  // ── TBC ──
  output_product_type?: string;        // 'RAW' (Level-0 HDF5)
  processing_duration_ms?: number;
  error_message?: string;

  // ── TBD ──
  error_code?: string;
}
```

---

## 4. CI-01 — Level-0 HDF5 산출물

CSC-03이 NAS에 저장하는 Level-0 HDF5 파일 스키마입니다.
소비자: **CSC-04** (Level-1 Processor, CSC-08 파이프라인 경유)

```typescript
/**
 * CI-01 Level-0 HDF5 파일 구조 (ICD 6.3)
 *
 * /                       (루트)
 * ├── /raw/rawdata         Dataset (Nr, Np) complex  — 원시 에코 행렬
 * ├── /state/state_table   Compound Dataset (Np,)    — 펄스별 상태 레코드
 * ├── /beam                Group — 빔 메타데이터 (앙각, 방위각, 빔폭, 이득)
 * └── /meta                Group — 장면·궤도·파형·수집 메타데이터
 *
 * 필수 어트리뷰트:
 *   /beam: el_angle_deg, az_angle_deg, beamwidth_el_deg, beamwidth_az_deg, amplitude_dBi
 *   /meta: look_side, incidence_deg, off_nadir_deg, scene_center_ecef,
 *          roi_az_m, roi_range_m, 4 corner coordinates,
 *          orbital elements (a_m, e, i_deg, raan_deg, argp_deg, nu_deg),
 *          waveform params (FC, BW, FS, PRF, PRI, SWST, SWL, taup, rank, ...)
 *
 * 상세 필드 목록은 ICD 6.3절 참조.
 */
```

---

## 5. FI-01 — baq_decompress() 함수 인터페이스

CSC-03이 호출하는 알고리즘 함수입니다. 구현은 알고리즘 팀 담당입니다.

```python
# FI-01 baq_decompress() (ICD 7.1)
# - 소속: CSC-03 / CSU-03.02 BAQ De-compression
# - 구현 언어: Python (기본). C++ 포팅 고려

@dataclass
class BaqDecompressInput:
    compressed_bytes: NDArray[np.uint8]  # shape: (n_blocks, block_size_bytes)
    bits_per_sample: int                 # BAQ 압축 비트 수. 허용값: TBD
    block_size: int                      # 블록당 샘플 수
    scale_factors: NDArray[np.float32]   # shape: (n_blocks,)

@dataclass
class BaqDecompressOutput:
    iq_signal: NDArray[np.complex64]     # shape: (n_samples_total,)

def baq_decompress(inp: BaqDecompressInput) -> BaqDecompressOutput: ...
# AlgorithmError: inp 형태 오류, 허용되지 않는 bits_per_sample
```

---

## 6. 큐 설정

```typescript
const QUEUE_CONFIG = {
  consume: {
    JOBS: { queue: 'sdpe.jobs.csc03', visibilityTimeoutSec: 3_600 },
  },
  produce: {
    PROCESSING_EVENTS: 'sdpe.processing.events',
  },
} as const;
```

---

## 7. 미확정 필드 결정 주체 정리

| 필드 | 인터페이스 | 결정 주체 | 사유 |
|------|-----------|-----------|------|
| NAS 저장 경로 규칙 | CI-01 | **위성팀 + CSC-01** | satellite_id 형식 확정 후 경로 규칙 설계 |
| `bits_per_sample` 허용값 | FI-01 | **위성 OBS 팀** | 위성 탑재 SAR 센서의 BAQ 압축 비트 수에 종속 |
| `block_size` 허용 범위 | FI-01 | **위성 OBS 팀** | 센서 규격에 종속 |
| C++ 포팅 여부 | FI-01 | **성능 측정 후** | Python 프로토타입 처리 시간 측정 필요 |
| `error_code` 체계 | SI-03 | **CSC-03 + 시스템** | L0 처리 실패 유형 정의 필요 |
| `processing_params` 구조 | SI-04 | **알고리즘 팀** | FI-01 시그니처 확정 후 결정 |
| `/state/state_table` 상세 구조 | CI-01 (HDF5) | **위성 OBS 팀** | 궤도 벡터·자세 데이터 포맷이 위성 규격에 종속 |
