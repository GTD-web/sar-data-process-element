# CSC-06 인터페이스 타입 정의

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

## 2. CSC-06이 수신하는 메시지 (Consumer)

### 2.1 SI-04 — 작업 할당 (`sdpe.jobs.csc06`)

제공자: **CSC-08** (Pipeline Orchestrator)

```typescript
/**
 * SI-04 작업 할당 메시지 (ICD 6.6)
 * - Visibility Timeout: 1,800초 (30분) — 전체 예산 10%
 */
interface JobAssignedMessage {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  job_id: UUID;
  message_type: 'JOB_ASSIGNED';
  target_csc: 'CSC-06';
  timestamp: ISO8601;
  input_path: string;                  // Level-2 GeoTIFF/GeoJSON NAS 경로 (CI-02)
  processing_profile_id: UUID;
  target_product_level: 'LEVEL_3';

  // ── TBC ──
  priority: number;
  target_product_types: string[];      // 예: ['APP']
  deadline_utc?: ISO8601;
  trigger_source: string;
  start_level: string;
  is_retry_reset: boolean;

  // ── TBD ──
  processing_params?: Record<string, unknown>;
}
```

---

## 3. CSC-06이 발행하는 메시지 (Provider)

### 3.1 SI-03 — 처리 완료/실패 이벤트 (`sdpe.processing.events`)

소비자: **CSC-08** (Pipeline Orchestrator)

```typescript
/**
 * SI-03 처리 이벤트 (ICD 6.5)
 * - source_csc = 'CSC-06', product_level = 'LEVEL_3'
 */
interface ProcessingEvent {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  job_id: UUID;
  event_type: 'PROCESSING_COMPLETED' | 'PROCESSING_FAILED';
  source_csc: 'CSC-06';
  product_level: 'LEVEL_3';
  timestamp: ISO8601;
  input_path: string;
  output_path: string | null;          // Level-3 산출물 NAS 경로
  retry_count: number;

  // ── TBC ──
  output_product_type?: string;        // 'APP' (응용 제품)
  processing_duration_ms?: number;
  error_message?: string;

  // ── TBD ──
  error_code?: string;
}
```

---

## 4. CI-05 — Level-3 산출물

CSC-06이 NAS에 저장하는 Level-3 응용 제품입니다.
소비자: **CSC-07** (Product & Catalog Manager, CSC-08 파이프라인 경유)

```typescript
/**
 * CI-05 Level-3 산출물 (ICD 6.13)
 * - 응용 플러그인별 출력 포맷이 상이합니다.
 * - 플러그인 아키텍처 설계 미착수 (TBD)
 * - NAS 경로: /sdpe/products/{satellite_id}/L3/{application_type}/{파일명}
 *
 * 예상 응용 모듈 (TBD):
 * - 침수 탐지 (Flood Detection)
 * - 선박 탐지 (Ship Detection)
 * - 변화 분석 (Change Analysis)
 * - 유류 오염 (Oil Spill Detection)
 * - 작황 모니터링 (Crop Monitoring)
 * - 도심 분석 (Urban Analysis)
 */
```

---

## 5. FI-07 — run_application() 함수 인터페이스

CSC-06이 호출하는 응용 플러그인 함수입니다. **인터페이스 전체가 TBD 상태**입니다.

```python
# FI-07 run_application() (ICD 7.7) — TBD (설계 미착수)
# - 소속: CSC-06 / CSU-06.01 Application Specific Product
# - 구현 언어: Python (응용 모듈별 플러그인 방식)
# - 설계 방식: 플러그인 아키텍처. 공통 인터페이스 구현

# ※ 아래는 예상 구조이며 확정되지 않았습니다.

# @dataclass
# class ApplicationInput:
#     input_data: dict          # 응용별 입력 데이터
#     application_type: str     # 'FLOOD', 'SHIP', 'CHANGE', ...
#     params: dict              # 응용별 파라미터

# @dataclass
# class ApplicationOutput:
#     output_data: dict         # 응용별 출력 데이터
#     output_files: list[str]   # 생성된 파일 경로 목록

# def run_application(inp: ApplicationInput) -> ApplicationOutput: ...
```

---

## 6. 큐 설정

```typescript
const QUEUE_CONFIG = {
  consume: {
    JOBS: { queue: 'sdpe.jobs.csc06', visibilityTimeoutSec: 1_800 },
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
| FI-07 전체 인터페이스 | FI-07 | **알고리즘 팀 + CSC-06 담당자** | 플러그인 아키텍처 설계 미착수. 응용 모듈 목록 확정 선행 필요 |
| 응용 모듈 목록 | FI-07 | **시스템 전체** | 침수/산사태/선박/유류/작황/도심 후보 중 선정 |
| 플러그인 등록·동적 로딩 방식 | FI-07 | **CSC-06 담당자** | 아키텍처 설계 결정 |
| 모듈별 입력 데이터 요구 사항 | FI-07, CI-02 | **알고리즘 팀** | 각 응용 모듈이 필요로 하는 L2 산출물 종류 |
| 응용별 출력 포맷 | CI-05 | **알고리즘 팀 + CSC-07** | CSC-07 등록 로직에 영향 |
| NAS 저장 경로 규칙 | CI-05 | **위성팀 + CSC-01** | satellite_id 형식 확정 후 경로 규칙 설계 |
| CI-05 등록 트리거 경로 | CI-05, SI-05 | **CSC-06 + CSC-08** | SI-05 직접 발행 vs CSC-08 중계 방식 |
| `error_code` 체계 | SI-03 | **CSC-06 + 시스템** | L3 처리 실패 유형 정의 필요 |
| `processing_params` 구조 | SI-04 | **알고리즘 팀** | FI-07 시그니처 확정 후 결정 |

### 결정 순서 의존 관계

```
응용 모듈 목록 확정
  → 공통 인터페이스 (ApplicationInput/Output) 설계
  → 플러그인 등록 메커니즘 설계
  → 모듈별 입력 데이터 요구 사항 정의
  → 출력 포맷 확정
  → CI-05 산출물 규격 확정
```
