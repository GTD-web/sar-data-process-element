# CSU-09.02 — STAC API Controller

| 항목                | 내용                           |
| ------------------- | ------------------------------ |
| **CSU ID**          | CSU-09.02                      |
| **소속 CSC**        | CSC-09 Data API Provider (DSS) |
| **ICD 버전**        | v1.0 (2026-03-20)              |
| **관련 인터페이스** | UI-01, SI-06, CI-03            |

---

## 타입 정의

```typescript
/** GET /v1/stac/search 쿼리 파라미터 */
export interface StacSearchQuery {
  /**
   * 공간 범위 필터 (minLon, minLat, maxLon, maxLat)
   * @status TBC
   */
  bbox?: [number, number, number, number];

  /**
   * 시간 범위 필터 (ISO 8601 interval)
   * @status TBC
   */
  datetime?: string;

  /**
   * 대상 Collection 목록
   * @status TBC
   */
  collections?: string[];

  /** 반환 항목 수 상한. 기본값: TBD */
  limit?: number;
}

/**
 * POST /v1/stac/search 요청 바디
 * @status TBD — 전체 스키마 미확정
 */
export interface StacSearchBody {
  /**
   * GeoJSON geometry 기반 공간 필터
   * @status TBD
   */
  geometry?: unknown;

  /**
   * 시간 범위 필터
   * @status TBD
   */
  datetime?: string;

  /**
   * CQL2 기반 추가 필터
   * @status TBD
   */
  filter?: unknown;
}

/**
 * STAC Item Collection 응답
 * @status TBC — 전체 구조 미확정
 */
export interface StacItemCollection {
  type: 'FeatureCollection';
  features: StacItem[];

  /**
   * 페이지네이션 링크
   * @status TBC
   */
  links?: unknown[];
}

/**
 * STAC Item
 * @status TBD — 매핑 구조 미확정
 */
export interface StacItem {
  type: 'Feature';
  id: string;
  [key: string]: unknown;
}

/**
 * STAC Collection
 * @status TBC — 전체 구조 미확정
 */
export interface StacCollection {
  type: 'Collection';
  id: string;
  [key: string]: unknown;
}
```

---

## CSU 인터페이스

```typescript
export interface IStacApiController {
  /**
   * GET /v1/stac/collections
   * STAC Collection 목록을 반환한다.
   *
   * @status TBC — 응답 스키마 미확정
   */
  listCollections(): Promise<StacCollection[]>;

  /**
   * GET /v1/stac/search
   * 공간·시간 기반 제품을 검색한다.
   *
   * @status TBC — 요청/응답 스키마 미확정
   */
  searchGet(query: StacSearchQuery): Promise<StacItemCollection>;

  /**
   * POST /v1/stac/search
   * GeoJSON geometry 기반 복합 조건 검색을 수행한다.
   *
   * @status TBD — 요청 바디 스키마 미확정
   */
  searchPost(body: StacSearchBody): Promise<StacItemCollection>;
}
```

---

## 의존 관계

| 의존 대상                  | 호출 목적                                   | 정의 위치 |
| -------------------------- | ------------------------------------------- | --------- |
| **CSU-01.01** DB Interface | stac_items, stac_collections 읽기 전용 조회 | CI-03     |

---

## 미확정 항목

| 우선순위 | 항목                                  | 상태 | 해결 조건                     |
| -------- | ------------------------------------- | ---- | ----------------------------- |
| P2       | STAC Collection 목록 및 구조          | TBC  | User Service 요구사항 확정 후 |
| P2       | GET /v1/stac/search 응답 스키마       | TBC  | User Service 요구사항 확정 후 |
| P2       | POST /v1/stac/search 요청 바디 스키마 | TBD  | User Service 요구사항 확정 후 |
| P2       | CQL2 filter 지원 범위                 | TBD  | User Service 요구사항 확정 후 |
| P2       | 페이지네이션 방식 (offset vs cursor)  | TBC  | 팀 내부 결정                  |

---

## 관련 문서

- **UI-01** — STAC 엔드포인트 목록 원천 정의 (ICD)
- **SI-06** — stac_items, stac_collections 테이블 스키마 (ICD)
- **CI-03** — CSU-01.01 사용 (ICD)
