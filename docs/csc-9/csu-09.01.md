# CSU-09.01 — Product API Controller

| 항목                | 내용                           |
| ------------------- | ------------------------------ |
| **CSU ID**          | CSU-09.01                      |
| **소속 CSC**        | CSC-09 Data API Provider (DSS) |
| **ICD 버전**        | v1.0 (2026-03-20)              |
| **관련 인터페이스** | UI-01, SI-06, CI-03            |

---

## 타입 정의

```typescript
export type ProductLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

/**
 * 제품 상태
 * @status TBD — 허용값 전체 목록 미확정
 */
export type ProductStatus = string;

/** GET /v1/products 쿼리 파라미터 */
export interface ProductListQuery {
  /**
   * 처리 레벨 필터
   * @status TBC
   */
  level?: ProductLevel;

  /**
   * 위성 식별자 필터
   * @status TBC — 형식 미확정
   */
  satellite_id?: string;

  /** 페이지 번호. 기본값: TBD */
  page?: number;

  /** 페이지당 항목 수. 기본값: TBD */
  limit?: number;
}

/**
 * 제품 메타데이터 응답
 * @status TBC — 전체 필드 목록 미확정
 */
export interface ProductResponse {
  /** 제품 고유 식별자 (UUID v4) */
  id: string;

  satellite_id: string;
  product_level: ProductLevel;
  product_type: string;
  acquisition_start: string;
  acquisition_end: string;

  /**
   * 제품 공간 범위 (GeoJSON Polygon)
   * @status TBC
   */
  footprint: GeoJsonPolygon;

  quality_passed: boolean;
  status: ProductStatus;
  created_at: string;
}

export interface ProductListResponse {
  items: ProductResponse[];

  /**
   * 페이지네이션 메타
   * @status TBC — 구조 미확정
   */
  pagination: unknown;
}

/** GET /v1/products/{id}/status 응답 */
export interface ProductStatusResponse {
  id: string;
  status: ProductStatus;
}

/** GET /v1/products/{id}/download-url 응답 */
export interface DownloadUrlResponse {
  url: string;

  /**
   * URL 만료 시각 (ISO 8601)
   * @status TBC — 만료 시간 정책 미확정
   */
  expires_at: string;
}

/** GET /v1/products/{id}/thumbnail 쿼리 파라미터 */
export interface ThumbnailQuery {
  /**
   * 이미지 포맷
   * @status TBC — 기본값 미확정
   */
  format?: 'png' | 'jpg';
}

/**
 * GeoJSON Polygon
 * @status TBC
 */
export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}
```

---

## CSU 인터페이스

```typescript
export interface IProductApiController {
  /**
   * GET /v1/products
   * 제품 목록을 조회한다. 응답 시간 2초 이내 (95 백분위).
   *
   * @status TBC — 요청/응답 JSON 스키마 미확정
   */
  listProducts(query: ProductListQuery): Promise<ProductListResponse>;

  /**
   * GET /v1/products/{id}
   * 단건 제품 메타데이터를 조회한다.
   *
   * @throws NotFoundError  제품 없음
   * @status TBC — 요청/응답 JSON 스키마 미확정
   */
  getProduct(id: string): Promise<ProductResponse>;

  /**
   * GET /v1/products/{id}/status
   * 제품 처리 상태를 조회한다.
   *
   * @throws NotFoundError  제품 없음
   */
  getProductStatus(id: string): Promise<ProductStatusResponse>;

  /**
   * GET /v1/products/{id}/download-url
   * 만료 시간이 포함된 NAS 다운로드 URL을 발급한다. 응답 시간 1초 이내.
   *
   * @throws NotFoundError  제품 없음
   * @status TBC — 만료 시간 정책 미확정
   */
  getDownloadUrl(id: string): Promise<DownloadUrlResponse>;

  /**
   * GET /v1/products/{id}/thumbnail
   * Quick-look 미리보기 이미지를 반환한다.
   *
   * @throws NotFoundError  제품 없음
   * @status TBC — 포맷 기본값 미확정
   */
  getThumbnail(id: string, query: ThumbnailQuery): Promise<Buffer>;

  /**
   * POST /v1/processing/jobs
   * 수동 재처리를 요청한다. retry_count를 초기화하고 신규 job을 생성한다.
   *
   * @throws NotFoundError  대상 제품 없음
   */
  requestReprocessing(jobId: string, targetLevel?: ProductLevel): Promise<void>;
}
```

---

## 예외 타입

```typescript
export class NotFoundError extends Error {} // 제품 없음
```

---

## 의존 관계

| 의존 대상                  | 호출 목적                           | 정의 위치 |
| -------------------------- | ----------------------------------- | --------- |
| **CSU-01.01** DB Interface | sar_products 읽기 전용 조회         | CI-03     |
| **CSU-01.03** NAS Manager  | 다운로드 URL 생성, 썸네일 파일 읽기 | CI-03     |

---

## 미확정 항목

| 우선순위 | 항목                                | 상태 | 해결 조건                     |
| -------- | ----------------------------------- | ---- | ----------------------------- |
| P2       | 각 엔드포인트 요청/응답 JSON 스키마 | TBC  | User Service 요구사항 확정 후 |
| P2       | HTTP 상태 코드 및 내부 오류 코드    | TBD  | 팀 내부 결정                  |
| P2       | 페이지네이션 구조                   | TBC  | User Service 요구사항 확정 후 |
| P2       | 다운로드 URL 만료 시간 정책         | TBC  | 팀 내부 결정                  |
| P2       | 썸네일 포맷 기본값                  | TBC  | 팀 내부 결정                  |
| P2       | Rate Limiting 정책 및 수치          | TBC  | 서버 용량 분석 후             |

---

## 관련 문서

- **UI-01** — 엔드포인트 목록, 인증 방식, SLA 원천 정의 (ICD)
- **SI-06** — 조회 대상 DB 스키마 (ICD)
- **CI-03** — CSU-01.01, CSU-01.03 사용 (ICD)
