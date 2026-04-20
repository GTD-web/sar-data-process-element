# CSC-09 인터페이스 타입 정의

> ICD v1.0 (2026-03-20) 기준. **ICD에서 "확정"으로 표기된 필드만** 타입을 정의합니다.
> TBC/TBD 필드는 외부 협의 또는 타 CSC의 결정에 의존하므로, 결정 주체와 함께 별도 표기합니다.

---

## 1. 공통 타입

```typescript
/** ICD 4.2 — 공통 타입 (확정) */
type UUID = string;       // UUID v4 (RFC 4122)
type ISO8601 = string;    // ISO 8601 UTC. 예: "2024-03-15T10:30:45.123Z"
```

---

## 2. UI-01 — 사용자 서비스 제품 API

CSC-09이 **제공자**입니다. 소비자는 LIID(Lumir Information And Imagery Distribution)입니다.

### 2.1 API 설정 (확정)

```typescript
/** UI-01 API 설정 — 확정 (ICD 5.2) */
const API_CONFIG = {
  /** 전송 보안 */
  transport: 'HTTPS',       // TLS 1.3
  /** API 버전 경로 */
  basePath: '/v1',
  /** 응답 포맷 */
  contentType: 'application/json',
  /** 인증 방식 */
  auth: {
    type: 'JWT Bearer',
    algorithm: 'RS256',      // Authorization 헤더
  },
  /** 응답 속도 SLA (시스템 설계서 2.2) */
  sla: {
    metadataQueryMs: 2_000,  // 메타데이터 조회 95백분위
    downloadUrlMs: 1_000,    // 다운로드 URL 발급
    errorRateAlertPct: 5,    // API 오류율 Alert 임계값 (시스템 설계서 13.2)
  },
} as const;
```

### 2.2 엔드포인트별 인터페이스

ICD에서 엔드포인트 목록과 HTTP 메서드는 확정되었으나, 요청/응답 JSON 스키마는 대부분 TBC입니다.
현재 확정된 엔드포인트의 타입만 정의합니다.

```typescript
/**
 * GET /v1/products/{id}/status — 제품 처리 상태 조회 (확정)
 * - 유일하게 "확정" 성숙도인 엔드포인트
 */
interface ProductStatusResponse {
  // ── 확정 필드 (SI-06 sar_products 기반) ──
  id: UUID;
  product_level: string;               // 'LEVEL_0' ~ 'LEVEL_3'
  product_type: string;                // 'SLC', 'GRD', 'GEC', ...

  // ── TBD — CSC-07 + CSC-09 공동 설계 필요 ──
  status: string;                      // 'REGISTERED', 'PUBLISHED', ... 허용값 미확정
  // 추가 필드(처리 진행률, 예상 완료 시간 등): TBD
}

/**
 * POST /v1/processing/jobs — 수동 재처리 요청 (확정)
 * - OPS-05 수동 재처리 및 OPS-06 부분 재처리에서 사용
 * - CSC-09이 수신 후 SI-07로 CSC-08에 전달
 */
interface ProcessingJobRequest {
  // ── 확정 — ICD OPS-05, OPS-06에서 확인 ──
  job_id?: UUID;                       // 기존 job 재처리 시 (OPS-05)
  target_level?: string;               // 부분 재처리 시작 레벨 (OPS-06). 예: 'LEVEL_2'
}
```

### 2.3 TBC 엔드포인트 (스키마 미확정)

아래 엔드포인트는 경로와 메서드만 확정되었고, 요청/응답 JSON 스키마는 LIID 팀과 협의 후 확정됩니다.

```typescript
/**
 * 아래 인터페이스는 placeholder입니다.
 * LIID 팀 요구사항 확정 후 실제 스키마로 대체됩니다.
 */

// GET /v1/products — TBC
interface ProductListRequest {
  level?: string;                      // 필터: 처리 레벨
  satellite_id?: string;               // 필터: 위성 식별자
  page?: number;
  limit?: number;
}
// 응답 스키마: TBC (페이징 구조, 반환 필드 목록)

// GET /v1/products/{id} — TBC
// 응답 스키마: TBC (상세 메타데이터 필드 전체)

// GET /v1/stac/collections — TBC
// 응답 스키마: TBC (STAC Collection 구조)

// GET /v1/stac/search — TBC
interface StacSearchRequest {
  bbox?: [number, number, number, number]; // [west, south, east, north]
  datetime?: string;                   // ISO8601 구간. 예: "2024-01-01/2024-12-31"
  collections?: string[];
  limit?: number;
}
// 응답 스키마: TBC (STAC Item 구조)

// POST /v1/stac/search — TBD
// 요청 바디: TBD (GeoJSON geometry, CQL2 filter 지원 범위 미확정)

// GET /v1/products/{id}/download-url — TBC
interface DownloadUrlResponse {
  url: string;                         // 서명된 다운로드 URL
  expires_at: ISO8601;                 // 만료 시각
}
// expires_in_sec 기본값: TBD

// GET /v1/products/{id}/thumbnail — TBC
// format 기본값: TBD (png | jpg)
```

---

## 3. UI-02 — OGC 지도 웹서비스 설정 (확정)

```typescript
/** UI-02 OGC 서비스 설정 — 확정 (ICD 5.3) */
const OGC_CONFIG = {
  transport: 'HTTPS',        // TLS 1.3
  standards: {
    wms: '1.3.0',            // Web Map Service
    wcs: '2.0',              // Web Coverage Service
    wmts: '1.0.0',           // Web Map Tile Service
  },
  defaultCrs: 'EPSG:4326',  // WGS84
  imageFormats: ['PNG', 'GeoTIFF'] as const,

  // ── TBC ──
  // additionalCrs: string[]   — 추가 EPSG 코드 (LIID·지도 클라이언트 요구사항에 따라)
  // auth: { ... }             — WMS/WMTS: API Key, WCS: JWT. 최종 방식 미확정
  // tileCache: { ... }        — WMTS 타일 캐시 전략 미설계
} as const;
```

---

## 4. UI-03 — 운영자 콘솔 설정 (확정)

```typescript
/** UI-03 운영자 콘솔 설정 — 확정 (ICD 5.3) */
const CONSOLE_CONFIG = {
  /** 인증 */
  auth: {
    type: 'JWT Bearer',
    storage: 'Electron safeStorage API',  // OS 키체인 암호화
  },
  /** 배포 */
  distribution: '사내 공유 드라이브',       // 인터넷 배포 금지
  autoUpdate: 'electron-updater',          // 내부 자동 갱신

  // ── TBC ──
  // offlineScope: string[]    — 오프라인 부분 동작 범위 미확정
  // rbacRoles: string[]       — 운영자 RBAC 역할 권한 범위 미확정
} as const;
```

---

## 5. SI-06 — 카탈로그 데이터 조회 (읽기 전용)

CSC-09이 CSC-07이 등록한 데이터를 읽기 전용으로 조회합니다. 스키마 소유자는 CSC-07입니다.

```typescript
/**
 * SI-06 sar_products 읽기 인터페이스 (ICD 6.8)
 * - CSC-09은 SELECT만 허용. INSERT/UPDATE/DELETE 불가.
 * - CSC-01 DB Interface(CI-03) 경유
 * - 스키마 소유자: CSC-07
 */
interface SarProductReadonly {
  // ── 확정 필드 (CSC-09이 조회 가능한 컬럼) ──
  id: UUID;
  satellite_id: string;
  product_level: string;
  product_type: string;
  acquisition_start: Date;
  acquisition_end: Date;
  footprint: string;                   // PostGIS GEOMETRY → WKT/GeoJSON 변환
  file_path: string;
  created_at: Date;

  // ── TBD — CSC-07 상세 설계 시 확정 ──
  quality_passed?: boolean;
  status: string;                      // 허용값 미확정
}

/**
 * 공간 쿼리 예시 (확정: PostGIS GIST 인덱스 사용)
 *
 * SELECT * FROM sar_products
 * WHERE ST_Intersects(footprint, ST_MakeEnvelope(west, south, east, north, 4326))
 *   AND acquisition_start >= '2024-01-01'
 *   AND acquisition_end <= '2024-12-31'
 * ORDER BY created_at DESC
 * LIMIT 20;
 */
```

---

## 6. SI-07 — 재처리 요청 전달 (CSC-09 → CSC-08)

CSC-09이 **제공자**입니다. 운영자/LIID의 수동 재처리 요청을 CSC-08에 전달합니다.

```typescript
/**
 * SI-07 재처리 요청 전달 (ICD 6.9)
 * - CSC-09이 UI-01의 POST /v1/processing/jobs를 받아 CSC-08에 전달합니다.
 * - 전달 매체: 내부 REST API 호출 또는 pgmq 직접 발행. 방식: TBC
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

---

## 7. CI-04 — Redis 캐시 조회

```typescript
/**
 * CI-04 Redis 캐시 (ICD 6.12)
 * - 메타데이터 조회 응답 속도 보장 (2초 이내 SLA)
 * - 캐시 미스 시 SI-06 경유 PostgreSQL 조회
 */
const REDIS_CONFIG = {
  protocol: 'TCP',
  defaultPort: 6379,

  // ── TBC ──
  // ttl: { metadata: number, stac: number }  — TTL 정책 미확정
  // invalidation: 'event' | 'ttl-only'       — 캐시 무효화 방식 미확정
  // strategy: 'cache-aside' | 'write-through' — 캐시 전략 미결정
} as const;
```

---

## 8. 미확정 필드 결정 주체 정리

| 필드 | 인터페이스 | 결정 주체 | 사유 |
|------|-----------|-----------|------|
| 전체 API JSON 스키마 | UI-01 | **LIID 팀** | 소비자가 필요로 하는 응답 구조를 협의해야 함 |
| Rate Limiting 수치 | UI-01 | **시스템 / 인프라팀** | 동시 사용자 수, 서버 용량 분석 선행 필요 |
| HTTP 오류 코드 전체 정의 | UI-01 | **시스템 전체** | SDPE 통합 오류 코드 체계와 연동 |
| POST /stac/search 스키마 | UI-01 | **LIID 팀** | STAC CQL2 filter 지원 범위 결정 필요 |
| 다운로드 URL 만료 정책 | UI-01 | **보안 / 운영팀** | 보안 정책에 따라 결정 |
| 추가 EPSG 코드 | UI-02 | **LIID / 지도 클라이언트** | 소비자 요구사항에 따라 결정 |
| OGC 인증 방식 | UI-02 | **보안 / 운영팀** | 보안 정책에 따라 결정 |
| 레이어 목록 및 SLD 스타일 | UI-02 | **CSC-07 + CSC-09** | 제품 유형별 시각화 요건 확정 필요 |
| WMTS 타일 캐시 전략 | UI-02 | **CSC-09 / 인프라팀** | 성능 요건에 따라 설계 |
| DB 전체 테이블 스키마 | SI-06 | **CSC-07** | CSC-07이 스키마 소유자. 확정 후 CSC-09 조회 로직 설계 |
| `status` 허용값 | SI-06 | **CSC-07 + CSC-09 공동** | 조회 필터 조건에 영향 |
| STAC 테이블 구조 | SI-06 | **CSC-07 + CSC-09 공동** | stac_items, stac_collections 매핑 |
| SI-07 전달 매체·스키마 | SI-07 | **CSC-08 + CSC-09** | REST vs pgmq 방식 결정 필요 |
| Redis TTL 정책 | CI-04 | **CSC-09** | 메타데이터 신선도 요건에 따라 결정 |
| 캐시 무효화 방식 | CI-04 | **CSC-07 + CSC-09** | CSC-07 등록/갱신 시 무효화 트리거 |
| 오프라인 동작 범위 | UI-03 | **운영팀** | Electron 앱 부분 동작 범위 |

### 결정 순서 의존 관계

```
LIID 팀 요구사항 확정
  → UI-01 전체 JSON 스키마 해소
  → Rate Limiting 정책 산정 가능
  → POST /stac/search 필터 범위 해소
  → 추가 EPSG 코드 해소

CSC-07 상세 설계 완료
  → SI-06 전체 DB 스키마 해소
  → CSC-09 조회 로직 설계 착수 가능
  → status 허용값 해소
  → STAC 테이블 구조 해소
  → CI-04 캐시 무효화 트리거 확정

CSC-08 + CSC-09 합의
  → SI-07 전달 매체·스키마 확정

보안 / 운영 정책 확정
  → 다운로드 URL 만료 정책 해소
  → OGC 인증 방식 해소
```
