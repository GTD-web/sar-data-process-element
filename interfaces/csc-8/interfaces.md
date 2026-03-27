# CSC-08 인터페이스 타입 정의

> ICD v1.0 (2026-03-20) 기준. **ICD에서 "확정"으로 표기된 필드만** 타입을 정의합니다.
> TBC/TBD 필드는 외부 협의 또는 타 CSC의 결정에 의존하므로, 결정 주체와 함께 별도 표기합니다.

---

## 1. 공통 타입

```typescript
/** ICD 4.2 — pgmq 메시지 공통 필드 (확정) */
type UUID = string;       // UUID v4 (RFC 4122)
type ISO8601 = string;    // ISO 8601 UTC. 예: "2024-03-15T10:30:45.123Z"
type SchemaVersion = '1.0';

/** ICD 6.4 — 처리 레벨 (확정) */
type ProductLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';
```

---

## 2. CSC-08이 수신하는 메시지 (Consumer)

### 2.1 SI-05 — 제품 등록 트리거 (`sdpe.catalog.registration`)

제공자: **CSC-07** (Pipeline Orchestrator). SI-05 인터페이스 자체가 ICD에서 TBC 상태입니다.

```typescript
/**
 * SI-05 제품 등록 트리거 (ICD 6.6)
 * - CSC-07이 Level-1 이상 제품 처리 완료 시 발행합니다.
 * - 스키마 소유자: CSC-07 + CSC-08 공동 합의
 * - 인터페이스 전체가 TBC 상태 (ICD 2.3)
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

## 3. CSC-08이 제공하는 데이터 (Provider)

### 3.1 SI-06 — 카탈로그 데이터 (PostgreSQL/PostGIS)

소비자: **CSC-09** (Data API Provider, 읽기 전용)

CSC-08은 PostgreSQL에 쓰기 권한을 가지며, CSC-09은 읽기 전용(SELECT)으로만 접근합니다.
모든 DB 접근은 CSC-01 DB Interface(CI-03)를 경유합니다.

```typescript
/**
 * SI-06 sar_products 테이블 스켈레톤 (ICD 6.7)
 * - 핵심 컬럼만 확정. 전체 스키마는 TBD.
 * - 스키마 소유자: CSC-08 (쓰기) + CSC-09 (읽기) 공동 합의
 */
interface SarProduct {
  // ── 확정 필드 ──
  id: UUID;                            // PRIMARY KEY
  satellite_id: string;
  product_level: string;               // 'LEVEL_0' ~ 'LEVEL_3'
  product_type: string;                // 'SLC', 'GRD', 'GEC', ...
  acquisition_start: Date;             // TIMESTAMPTZ
  acquisition_end: Date;               // TIMESTAMPTZ
  footprint: string;                   // GEOMETRY(POLYGON, 4326) — PostGIS WKT
  file_path: string;
  created_at: Date;                    // DEFAULT now()

  // ── TBD — CSC-08 상세 설계 시 확정 ──
  quality_passed?: boolean;
  status: string;                      // 'REGISTERED', 'PUBLISHED', ... 허용값 미확정
}

/**
 * 공간 인덱스 (확정)
 * CREATE INDEX idx_sar_products_footprint ON sar_products USING GIST(footprint);
 */
```

---

## 4. 큐 설정

```typescript
/** 큐 설정 */
const QUEUE_CONFIG = {
  /** CSC-08이 수신하는 큐 */
  consume: {
    /** SI-05 제품 등록 트리거 (큐명 TBC) */
    CATALOG_REGISTRATION: 'sdpe.catalog.registration',
  },
} as const;
```

---

## 5. 미확정 필드 결정 주체 정리

| 필드 | 인터페이스 | 결정 주체 | 사유 |
|------|-----------|-----------|------|
| SI-05 TBC 필드 전체 | SI-05 | **CSC-07 + CSC-08 공동** | SI-05 인터페이스 자체가 TBC. 양측 합의 필요 |
| `satellite_id` 형식 | SI-05, SI-06 | **위성팀** | 위성 식별 코드 체계를 위성팀이 관리 |
| `product_type` 허용값 | SI-05, SI-06 | **CSC-02~06 + 시스템** | 산출물 유형 전체 코드 목록. 파일명 규칙과 일관성 |
| `footprint_wkt` 정밀도 | SI-05 | **CSC-07 + CSC-08** | 공간 범위 정밀도 및 좌표계 합의 |
| `quality_run` 조건 | SI-05 | **CSC-07 + CSC-08** | 품질 검증 자동 실행 조건 합의 |
| `status` 허용값 | SI-06 | **CSC-08 + CSC-09 공동** | 제품 수명주기 상태 코드. CSC-09 조회 조건에 영향 |
| `quality_passed` | SI-06 | **CSC-08** | 품질 검증 기준 및 판정 로직은 CSC-08이 설계하되, 기준값은 시스템 전체 합의 |
| 전체 테이블 스키마 | SI-06 | **CSC-08 + CSC-09 공동** | STAC Item 매핑, 추가 컬럼, 인덱스 전략 등 |
| STAC 매핑 구조 | SI-06 | **CSC-08 + CSC-09** | STAC 표준(stac_items, stac_collections) 테이블 설계 |
| 등록 실패 재시도 정책 | SI-05 | **CSC-07 + CSC-08** | 등록 실패 시 재시도 또는 Alert 정책 |
| 쿼리 성능 요건 | SI-06 | **CSC-09** | CSC-09 조회 패턴(검색 조건, 페이징) 확정 후 인덱스 전략 결정 |

### 결정 순서 의존 관계

```
CSC-07 + CSC-08 합의
  → SI-05 TBC 필드 전체 해소
  → 등록 실패 재시도 정책 확정

CSC-08 + CSC-09 합의
  → sar_products 전체 스키마 확정
  → status 허용값 확정
  → STAC 매핑 구조 확정
  → 인덱스 전략 확정

위성팀 확정 (satellite_id)
  → SI-05, SI-06의 satellite_id 형식 해소

CSC-02~06 산출물 유형 확정
  → product_type 허용값 해소
```
