# CSC-04 인터페이스 타입 정의

> ICD v1.0 (2026-03-20) 기준. **ICD에서 "확정"으로 표기된 필드만** 타입을 정의합니다.
> TBC/TBD 필드는 외부 협의 또는 타 CSC의 결정에 의존하므로, 결정 주체와 함께 별도 표기합니다.

---

## 1. 공통 타입

```typescript
type UUID = string;
type ISO8601 = string;
type SchemaVersion = '1.0';
type ProductLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';
```

---

## 2. CSC-04가 수신하는 메시지 (Consumer)

### 2.1 SI-04 — 작업 할당 (`sdpe.jobs.csc04`)

제공자: **CSC-08** (Pipeline Orchestrator)

```typescript
/**
 * SI-04 작업 할당 메시지 (ICD 6.6)
 * - Visibility Timeout: 9,000초 (2.5시간) — 전체 예산 50%
 */
interface JobAssignedMessage {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  job_id: UUID;
  message_type: 'JOB_ASSIGNED';
  target_csc: 'CSC-04';
  timestamp: ISO8601;
  input_path: string;                  // Level-0 HDF5 NAS 경로 (CI-01)
  processing_profile_id: UUID;
  target_product_level: 'LEVEL_1';

  // ── TBC ──
  priority: number;
  target_product_types: string[];      // 예: ['SLC', 'GRD', 'GEC', 'MAP']
  deadline_utc?: ISO8601;
  trigger_source: string;
  start_level: string;
  is_retry_reset: boolean;

  // ── TBD ──
  processing_params?: Record<string, unknown>;
}
```

---

## 3. CSC-04가 발행하는 메시지 (Provider)

### 3.1 SI-03 — 처리 완료/실패 이벤트 (`sdpe.processing.events`)

소비자: **CSC-08** (Pipeline Orchestrator)

```typescript
/**
 * SI-03 처리 이벤트 (ICD 6.5)
 * - source_csc = 'CSC-04', product_level = 'LEVEL_1'
 */
interface ProcessingEvent {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  job_id: UUID;
  event_type: 'PROCESSING_COMPLETED' | 'PROCESSING_FAILED';
  source_csc: 'CSC-04';
  product_level: 'LEVEL_1';
  timestamp: ISO8601;
  input_path: string;
  output_path: string | null;          // GeoTIFF/COG NAS 경로. COMPLETED 시 필수
  retry_count: number;

  // ── TBC ──
  output_product_type?: string;        // 'SLC', 'GRD', 'GEC', 'MAP'
  processing_duration_ms?: number;
  error_message?: string;

  // ── TBD ──
  error_code?: string;
}
```

---

## 4. SI-02 — Level-1 산출물 포맷

CSC-04가 NAS에 저장하는 Level-1 GeoTIFF/COG 파일입니다.
소비자: **CSC-05** (Level-2 Processor, CSC-08 파이프라인 경유)

```typescript
/**
 * SI-02 Level-1 산출물 유형 (ICD 6.3)
 *
 * | 제품 타입 | 파일 포맷              | 데이터 타입  | 설명                                    |
 * |----------|------------------------|-------------|----------------------------------------|
 * | SLC      | GeoTIFF / HDF5         | complex64   | Single Look Complex. 위상 정보 보존     |
 * | GRD      | Cloud Optimized GeoTIFF | float32     | Ground Range Detected. 방사 보정 적용   |
 * | GEC      | Cloud Optimized GeoTIFF | float32     | 기하 지형 보정 완료. DEM 연동 필수      |
 * | MAP      | Cloud Optimized GeoTIFF | float32     | 지도 투영 완료. 지리 좌표 포함          |
 *
 * NAS 경로: /sdpe/products/{satellite_id}/L1/{product_type}/{파일명}
 */
```

---

## 5. EI-02 — DEM 데이터 (입력)

CSC-04가 GEC/MAP 처리 시 사용하는 DEM 데이터입니다.

```typescript
/**
 * EI-02 DEM 데이터 (ICD 5.4)
 * - NAS 사전 배치 방식. 실시간 다운로드 아님.
 * - 포맷: GeoTIFF (1°×1° 타일) 또는 DTED Level-2
 * - 좌표계: EPSG:4326 (WGS84)
 * - 해상도: SRTM1 약 30m / DTED-2 약 30m
 * - DEM 소스 선정: TBC (SRTM1 vs DTED-2 vs 고해상도 상용)
 */
```

---

## 6. FI-02/03/04 — 알고리즘 함수 인터페이스

CSC-04가 호출하는 알고리즘 함수입니다. 구현은 알고리즘 팀 담당입니다.

```python
# FI-02 compress_range() (ICD 7.2)
@dataclass
class RangeCompressionInput:
    raw_signal: NDArray[np.complex64]    # shape: (n_azimuth, n_range)
    chirp_rate_hz_per_s: float
    sampling_rate_hz: float
    center_frequency_hz: float

@dataclass
class RangeCompressionOutput:
    compressed_signal: NDArray[np.complex64]  # shape: (n_azimuth, n_range)
    range_resolution_m: float

def compress_range(inp: RangeCompressionInput) -> RangeCompressionOutput: ...


# FI-03 compress_azimuth_rda() (ICD 7.3)
@dataclass
class AzimuthCompressionInput:
    range_compressed: NDArray[np.complex64]  # shape: (n_azimuth, n_range)
    prf_hz: float
    velocity_ms: float
    wavelength_m: float
    squint_angle_rad: float
    doppler_centroid_hz: float
    # 추가 파라미터: TBD (궤도 데이터 연동 방식)

def compress_azimuth_rda(inp: AzimuthCompressionInput) -> NDArray[np.complex64]: ...
# 반환: SLC 복소 영상, shape: (n_azimuth, n_range)


# FI-04 compress_azimuth_bpa() (ICD 7.4) — TBC
# Spotlight 모드 전용. C++ 우선 구현.
def compress_azimuth_bpa(inp: AzimuthCompressionInput) -> NDArray[np.complex64]: ...
# AzimuthCompressionInput 재사용 또는 BPA 전용 Input: TBC
```

---

## 7. 큐 설정

```typescript
const QUEUE_CONFIG = {
  consume: {
    JOBS: { queue: 'sdpe.jobs.csc04', visibilityTimeoutSec: 9_000 },
  },
  produce: {
    PROCESSING_EVENTS: 'sdpe.processing.events',
  },
} as const;
```

---

## 8. 미확정 필드 결정 주체 정리

| 필드 | 인터페이스 | 결정 주체 | 사유 |
|------|-----------|-----------|------|
| NAS 저장 경로 규칙 | SI-02 | **위성팀 + CSC-01** | satellite_id 형식 확정 후 경로 규칙 설계 |
| C++ 포팅 여부 (FI-02/03) | FI-02, FI-03 | **성능 측정 후** | Python 500GB 처리 시간 측정 필요. 9,000초 초과 시 포팅 |
| BPA Input dataclass | FI-04 | **알고리즘 팀** | RDA 구현 완료 후 BPA 전용 파라미터 필요 여부 판단 |
| GPU 가속 적용 여부 | FI-04 | **성능 측정 후** | BPA 연산량 분석 후 결정 |
| DEM 소스 선정 | EI-02 | **알고리즘 팀 + 운영팀** | 정확도 요건과 라이선스 비용 트레이드오프 |
| COG 타일 크기·오버뷰 | SI-02 | **CSC-04 + CSC-09** | GeoServer 서빙 성능에 영향 |
| 편파 다채널 처리 방식 | SI-02 | **CSC-04 + CSC-05** | 소비자 CSC-05 입력 요건에 따라 결정 |
| `error_code` 체계 | SI-03 | **CSC-04 + 시스템** | L1 처리 실패 유형 정의 필요 |
| `processing_params` 구조 | SI-04 | **알고리즘 팀** | FI-02~04 시그니처 확정 후 결정 |
| GeoTIFF 내부 메타데이터 | SI-02 | **CSC-04 + CSC-07** | GDAL 어트리뷰트 목록 확정 필요 |
