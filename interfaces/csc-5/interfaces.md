# CSC-05 인터페이스 타입 정의

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

## 2. CSC-05가 수신하는 메시지 (Consumer)

### 2.1 SI-04 — 작업 할당 (`sdpe.jobs.csc05`)

제공자: **CSC-08** (Pipeline Orchestrator)

```typescript
/**
 * SI-04 작업 할당 메시지 (ICD 6.6)
 * - Visibility Timeout: 2,700초 (45분) — 전체 예산 15%
 */
interface JobAssignedMessage {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  job_id: UUID;
  message_type: 'JOB_ASSIGNED';
  target_csc: 'CSC-05';
  timestamp: ISO8601;
  input_path: string;                  // Level-1 GeoTIFF NAS 경로 (SI-02)
  processing_profile_id: UUID;
  target_product_level: 'LEVEL_2';

  // ── TBC ──
  priority: number;
  target_product_types: string[];      // 예: ['MSK', 'OBJ', 'CHG']
  deadline_utc?: ISO8601;
  trigger_source: string;
  start_level: string;
  is_retry_reset: boolean;

  // ── TBD ──
  processing_params?: Record<string, unknown>;
}
```

---

## 3. CSC-05가 발행하는 메시지 (Provider)

### 3.1 SI-03 — 처리 완료/실패 이벤트 (`sdpe.processing.events`)

소비자: **CSC-08** (Pipeline Orchestrator)

```typescript
/**
 * SI-03 처리 이벤트 (ICD 6.5)
 * - source_csc = 'CSC-05', product_level = 'LEVEL_2'
 */
interface ProcessingEvent {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  job_id: UUID;
  event_type: 'PROCESSING_COMPLETED' | 'PROCESSING_FAILED';
  source_csc: 'CSC-05';
  product_level: 'LEVEL_2';
  timestamp: ISO8601;
  input_path: string;
  output_path: string | null;          // GeoTIFF/GeoJSON NAS 경로
  retry_count: number;

  // ── TBC ──
  output_product_type?: string;        // 'MSK', 'OBJ', 'CHG'
  processing_duration_ms?: number;
  error_message?: string;

  // ── TBD ──
  error_code?: string;
}
```

---

## 4. CI-02 — Level-2 산출물 포맷

CSC-05가 NAS에 저장하는 Level-2 산출물입니다.
소비자: **CSC-06** (Level-3 Processor, CSC-08 파이프라인 경유)

```typescript
/**
 * CI-02 Level-2 산출물 유형 (ICD 6.4)
 *
 * | 산출물          | 포맷             | 데이터 타입         | 설명                                     |
 * |----------------|------------------|--------------------|-----------------------------------------|
 * | 입사각 지도     | GeoTIFF          | float32            | 픽셀 단위 Local Incidence Angle (라디안)  |
 * | 그림자 마스크   | GeoTIFF          | uint8 (0/1)        | 레이더 그림자 영역 이진 마스크            |
 * | 레이오버 마스크 | GeoTIFF          | uint8 (0/1)        | 레이오버 왜곡 영역 이진 마스크            |
 * | 객체 탐지 결과  | GeoJSON          | Feature Collection | 탐지 객체 위치, 신뢰도, 크기 추정치 포함  |
 * | 변화 탐지 결과  | GeoTIFF + GeoJSON | uint8 + Feature   | 변화 영역 래스터 마스크 + 변화 폴리곤     |
 *
 * NAS 경로: /sdpe/products/{satellite_id}/L2/{product_type}/{파일명}
 */
```

---

## 5. FI-05/06 — 알고리즘 함수 인터페이스

CSC-05가 호출하는 알고리즘 함수입니다. 구현은 알고리즘 팀 담당입니다.

```python
# FI-05 detect_objects_cfar() (ICD 7.5) — TBC
@dataclass
class DetectionInput:
    intensity_image: NDArray[np.float32]   # shape: (height, width)
    cfar_window_size: int
    cfar_guard_size: int
    false_alarm_rate: float                # 예: 1e-6
    min_object_area_px: int

@dataclass
class DetectedObject:
    centroid_x: float                      # 탐지 중심 X (픽셀)
    centroid_y: float                      # 탐지 중심 Y (픽셀)
    bbox: tuple[int, int, int, int]        # (x_min, y_min, x_max, y_max)
    confidence: float                      # 0.0 ~ 1.0
    estimated_area_px: int
    # object_class: str  — 분류 지원 여부: TBD

def detect_objects_cfar(inp: DetectionInput) -> list[DetectedObject]: ...


# FI-06 detect_changes() (ICD 7.6) — TBC
@dataclass
class ChangeDetectionInput:
    image_before: NDArray[np.float32]     # shape: (height, width)
    image_after:  NDArray[np.float32]     # shape: (height, width)
    # 두 영상은 Co-registration 완료 상태 (CSU-05.05 선행 처리 필수)
    threshold_sigma: float                # 변화 판정 임계값. 기본값: TBC
    min_change_area_px: int

@dataclass
class ChangeDetectionOutput:
    change_mask: NDArray[np.uint8]        # shape: (height, width). 1=변화
    change_ratio: float                   # 0.0 ~ 1.0
    n_change_regions: int

def detect_changes(inp: ChangeDetectionInput) -> ChangeDetectionOutput: ...
```

---

## 6. 큐 설정

```typescript
const QUEUE_CONFIG = {
  consume: {
    JOBS: { queue: 'sdpe.jobs.csc05', visibilityTimeoutSec: 2_700 },
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
| NAS 저장 경로 규칙 | CI-02 | **위성팀 + CSC-01** | satellite_id 형식 확정 후 경로 규칙 설계 |
| `object_class` 분류 지원 | FI-05 | **내부 결정** | 딥러닝 모델 도입 여부에 따라 DetectedObject 스키마 변경 |
| `threshold_sigma` 기본값 | FI-06 | **알고리즘 팀** | 실제 SAR 데이터 실험 후 권고값 제시 예정 |
| 객체 탐지 GeoJSON 스키마 | CI-02 | **CSC-05 + CSC-07** | 신뢰도, 분류 코드, Feature 속성 완전 정의 필요 |
| 변화 탐지 임계값 설정 방식 | FI-06 | **알고리즘 팀** | 적응형 임계값 vs 고정 임계값 |
| L2→L3 선택적 전달 조건 | CI-02 | **CSC-05 + CSC-06** | 어떤 L2 산출물이 L3에 필요한지 확정 |
| `error_code` 체계 | SI-03 | **CSC-05 + 시스템** | L2 처리 실패 유형 정의 필요 |
| `processing_params` 구조 | SI-04 | **알고리즘 팀** | FI-05/06 시그니처 확정 후 결정 |
