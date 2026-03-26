# CSU-09.01 — Product API Handler

| 항목                | 내용                                                |
| ------------------- | --------------------------------------------------- |
| **CSU ID**          | CSU-09.01                                           |
| **소속 CSC**        | CSC-09 Data Service Subsystem (DSS)                 |
| **ICD 버전**        | v1.0 (2026-03-20)                                   |
| **관련 인터페이스** | UI-01, SI-06, CI-03                                 |
| **제공 엔드포인트** | `/v1/products`, `/v1/stac/*`, `/v1/processing/jobs` |

---

## 입력 타입

> **ICD 출처:** 5.2절 UI-01 API 엔드포인트 목록 테이블

```typescript
/**
 * GET /v1/products 요청 쿼리 파라미터.
 */
export interface ProductListQuery {
  /** 제품 레벨 필터. 예: "LEVEL_1"
   * ICD UI-01: "level — 주요 파라미터" / 성숙도: TBC
   * @status TBC — 응답 JSON 스키마 미확정 */
  level?: string;

  /** 위성 식별자 필터
   * ICD UI-01: "satellite_id — 주요 파라미터" / 성숙도: TBC */
  satellite_id?: string;

  /** 페이지 번호 (1부터 시작)
   * ICD UI-01: "page — 주요 파라미터" / 성숙도: TBC */
  page?: number;

  /** 페이지당 반환 건수
   * ICD UI-01: "limit — 주요 파라미터" / 성숙도: TBC */
  limit?: number;
}

/**
 * GET /v1/stac/search 요청 쿼리 파라미터.
 */
export interface StacSearchQuery {
  /** 공간 범위 (WGS84 bounding box: minLon,minLat,maxLon,maxLat)
   * ICD UI-01: "bbox — 주요 파라미터" / 성숙도: TBC */
  bbox?: string;

  /** 시간 범위 (ISO 8601 interval)
   * ICD UI-01: "datetime — 주요 파라미터" / 성숙도: TBC */
  datetime?: string;

  /** 조회할 Collection ID 목록 (콤마 구분)
   * ICD UI-01: "collections — 주요 파라미터" / 성숙도: TBC */
  collections?: string;

  /** 최대 반환 건수
   * ICD UI-01: "limit — 주요 파라미터" / 성숙도: TBC */
  limit?: number;
}

/**
 * POST /v1/processing/jobs 요청 바디.
 * 수동 재처리 또는 부분 재처리 트리거에 사용한다.
 */
export interface ProcessingJobRequest {
  /** 재처리 대상 job_id. 기존 job 재처리 시 필수.
   * ICD OPS-02 7단계: "특정 job_id 재처리 트리거" */
  job_id?: string;

  /** 처리 시작 레벨 (부분 재처리 시 지정)
   * ICD OPS-03 1단계: "target_level 파라미터로 시작 레벨 지정. 예: target_level = 'LEVEL_2'" */
  target_level?: 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';
}

/**
 * GET /v1/products/{id}/download-url 요청 파라미터.
 */
export interface DownloadUrlRequest {
  /** 다운로드 URL 만료 시간 (초). 기본값: TBD
   * ICD UI-01: "expires_in_sec — 기본값: TBD" / 성숙도: TBC
   * @status TBC — 만료 시간 정책 미확정 */
  expires_in_sec?: number;
}
```

---

## CSU 인터페이스

> **ICD 출처:** 5.2절 UI-01 API 엔드포인트 목록 테이블, 3.1절 OPS-01 9단계, 3.2절 OPS-02 7단계, 3.3절 OPS-03 1단계

| 메서드 / 엔드포인트                  | ICD 근거 문장                                                                                                                             | 결론                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `GET /v1/products`                   | UI-01: "GET /v1/products — 제품 목록 조회 (페이징, 필터)" / 성숙도: TBC                                                                   | DB 조회 후 JSON 목록 반환                        |
| `GET /v1/products/{id}`              | UI-01: "GET /v1/products/{id} — 단건 제품 메타데이터 상세 조회" / 성숙도: TBC                                                             | 단건 제품 메타데이터 반환. OPS-03 최신 버전 반환 |
| `GET /v1/products/{id}/status`       | UI-01: "GET /v1/products/{id}/status — 제품 처리 상태 조회" / 성숙도: 확정                                                                | 처리 상태(job status) 반환                       |
| `GET /v1/stac/collections`           | UI-01: "GET /v1/stac/collections — STAC Collection 목록" / 성숙도: TBC                                                                    | stac_collections 테이블 조회 후 반환             |
| `GET /v1/stac/search`                | UI-01: "GET /v1/stac/search — 공간·시간 기반 제품 검색" / 성숙도: TBC                                                                     | bbox/datetime 조건 기반 공간 검색                |
| `POST /v1/stac/search`               | UI-01: "POST /v1/stac/search — 복합 조건 검색 (POST Body)" / 성숙도: TBD                                                                  | GeoJSON geometry 기반 복합 검색 (스키마 TBD)     |
| `GET /v1/products/{id}/download-url` | UI-01: "GET /v1/products/{id}/download-url — 만료 시간 포함 다운로드 URL 발급" / 성숙도: TBC                                              | 서명된 만료 URL 생성 후 반환. 응답 1초 이내 SLA  |
| `GET /v1/products/{id}/thumbnail`    | UI-01: "GET /v1/products/{id}/thumbnail — Quick-look 미리보기 이미지" / 성숙도: TBC                                                       | 미리보기 이미지 반환. format: png\|jpg           |
| `POST /v1/processing/jobs`           | OPS-02 7단계: "운영자가 CSC-09 API를 통해 특정 job_id 재처리 트리거. CSC-07이 신규 job 생성 후 CSC-04에 작업 재할당 (retry_count 초기화)" | 수동/부분 재처리 트리거. CSC-07에 위임           |

```typescript
export interface IProductApiHandler {
  /**
   * 페이징 및 필터 조건으로 제품 목록을 반환한다.
   * sar_products 테이블을 SI-06(읽기 전용)으로 조회한다.
   * 응답 시간 2초 이내 SLA (시스템 설계서 2.2 요건).
   *
   * ICD 근거: UI-01 — "GET /v1/products — 제품 목록 조회 (페이징, 필터)"
   *   응답 SLA — "메타데이터 조회 2초 이내 (95 백분위)"
   *
   * @throws UnauthorizedError  JWT 인증 실패
   * @throws DbError            DB 조회 실패
   */
  listProducts(query: ProductListQuery, authToken: string): Promise<unknown>; // 응답 스키마: TBC

  /**
   * 단건 제품 메타데이터를 반환한다. OPS-03 재처리의 경우 최신 버전을 반환한다.
   * 응답 시간 2초 이내 SLA.
   *
   * ICD 근거:
   *   - UI-01 — "GET /v1/products/{id} — 단건 제품 메타데이터 상세 조회"
   *   - OPS-03 4단계 — "User Service가 GET /v1/products/{id} 조회 시 최신 버전 반환"
   *
   * @throws NotFoundError       해당 id 제품 없음
   * @throws UnauthorizedError   JWT 인증 실패
   * @throws DbError             DB 조회 실패
   */
  getProduct(productId: string, authToken: string): Promise<unknown>; // 응답 스키마: TBC

  /**
   * 제품의 처리 상태를 반환한다.
   * job 레코드에서 현재 status를 조회하여 응답한다.
   *
   * ICD 근거: UI-01 — "GET /v1/products/{id}/status — 제품 처리 상태 조회" / 성숙도: 확정
   *
   * @throws NotFoundError       해당 id 제품/job 없음
   * @throws UnauthorizedError   JWT 인증 실패
   */
  getProductStatus(productId: string, authToken: string): Promise<{ status: string }>;

  /**
   * STAC Collection 목록을 반환한다.
   *
   * ICD 근거: UI-01 — "GET /v1/stac/collections — STAC Collection 목록"
   */
  listStacCollections(authToken: string): Promise<unknown>; // 응답 스키마: TBC

  /**
   * bbox/datetime 조건으로 STAC Item을 공간·시간 기반 검색한다.
   * PostGIS 공간 쿼리를 사용하여 sar_products.footprint와 교차하는 제품을 반환한다.
   *
   * ICD 근거: UI-01 — "GET /v1/stac/search — 공간·시간 기반 제품 검색"
   */
  searchStac(query: StacSearchQuery, authToken: string): Promise<unknown>; // 응답 스키마: TBC

  /**
   * GeoJSON geometry 기반 복합 조건 검색을 수행한다. 스키마 TBD.
   *
   * ICD 근거: UI-01 — "POST /v1/stac/search — 복합 조건 검색 (POST Body)" / 성숙도: TBD
   * @status TBD — 요청 바디 스키마 미확정
   */
  searchStacPost(body: unknown, authToken: string): Promise<unknown>; // 요청/응답 스키마: TBD

  /**
   * 만료 시간이 포함된 서명된 다운로드 URL을 발급한다.
   * 응답 시간 1초 이내 SLA (시스템 설계서 2.2 요건).
   *
   * ICD 근거: UI-01 — "GET /v1/products/{id}/download-url — 만료 시간 포함 다운로드 URL 발급"
   *   응답 SLA — "파일 다운로드 URL 발급: 1초 이내"
   *
   * @throws NotFoundError       해당 id 제품 없음
   * @throws UnauthorizedError   JWT 인증 실패
   */
  getDownloadUrl(
    productId: string,
    request: DownloadUrlRequest,
    authToken: string,
  ): Promise<{ url: string; expires_at: string }>;

  /**
   * 제품 Quick-look 미리보기 이미지를 반환한다.
   *
   * ICD 근거: UI-01 — "GET /v1/products/{id}/thumbnail — Quick-look 미리보기 이미지"
   *   format: png|jpg (기본값: TBD)
   *
   * @throws NotFoundError  해당 id 제품 없음 또는 썸네일 미생성
   */
  getThumbnail(productId: string, format: 'png' | 'jpg', authToken: string): Promise<Buffer>;

  /**
   * 수동 재처리 또는 부분 재처리를 CSC-07에 위임한다.
   * retry_count를 초기화하고 신규 job으로 처리한다.
   *
   * ICD 근거:
   *   - OPS-02 7단계 — "운영자가 CSC-09 API를 통해 특정 job_id 재처리 트리거.
   *     CSC-07이 신규 job 생성 후 CSC-04에 작업 재할당 (retry_count 초기화)"
   *   - OPS-03 1단계 — "target_level 파라미터로 시작 레벨 지정"
   *   - 3.2절 재시도 정책 — "수동 재처리 API: UI-01 POST /v1/processing/jobs. retry_count 초기화 후 신규 job으로 처리"
   *
   * @throws NotFoundError     job_id에 해당하는 job 없음
   * @throws UnauthorizedError JWT 인증 실패
   */
  triggerReprocessing(request: ProcessingJobRequest, authToken: string): Promise<{ new_job_id: string }>;
}
```

---

## 예외 타입

> **ICD 출처:** 5.2절 UI-01

| 예외                | ICD 근거 문장                                                                         | 결론                           |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| `UnauthorizedError` | UI-01: "JWT Bearer 토큰 (RS256 알고리즘). Authorization 헤더 사용" (인증 실패 가능성) | JWT 검증 실패 시 HTTP 401      |
| `NotFoundError`     | UI-01: "GET /v1/products/{id}" (미존재 id 요청 가능성)                                | 미존재 리소스 요청 시 HTTP 404 |
| `DbError`           | UI-01 SLA: "메타데이터 조회 2초 이내 (95 백분위)" (DB 조회 실패 가능성)               | DB 조회 실패 시 예외           |

```typescript
export class UnauthorizedError extends Error {} // JWT 인증 실패 → HTTP 401
export class NotFoundError extends Error {} // 미존재 리소스 → HTTP 404
export class DbError extends Error {} // DB 조회 실패
```

---

## 의존 관계

> **ICD 출처:** 3.1절 OPS-01 9단계, 3.2절 OPS-02 7단계, 3.3절 OPS-03 4단계

| 의존 대상                      | 호출 목적                                | ICD 근거 문장                                                     | 결론                          | 정의 위치       |
| ------------------------------ | ---------------------------------------- | ----------------------------------------------------------------- | ----------------------------- | --------------- |
| **CSU-01.01** DB Interface     | sar_products / stac_items 읽기 전용 조회 | SI-06: "CSC-09은 읽기 전용 (SELECT만 허용). 쓰기는 CSC-08 전용"   | DB 접근은 CI-03 경유          | CI-03           |
| **CSU-01.02** Geo Data Manager | bbox/GeoJSON → PostGIS 공간 쿼리 변환    | UI-01: "GET /v1/stac/search — bbox, datetime, collections, limit" | 지리 데이터 변환은 CI-03 경유 | CI-03           |
| **CSC-07** (CSU-07.01 경로)    | 재처리 job 생성 및 작업 할당 위임        | OPS-02 7단계: "CSC-07이 신규 job 생성 후 CSC-04에 작업 재할당"    | 재처리 위임                   | CSC-07 내부 API |

---

## 미확정 항목

> **ICD 출처:** 5.2절 UI-01 미결 항목, 8.2절

| 우선순위 | 항목                                  | 상태 | ICD 근거 문장                                                                              | 결론                                            | 해결 조건         |
| -------- | ------------------------------------- | ---- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- | ----------------- |
| P2       | 전체 API JSON 응답 스키마             | TBC  | 8.2절: "User Service 팀이 필요로 하는 응답 필드 구조를 협의해야 함"                        | 스키마 확정 전 listProducts() 등 응답 구현 불가 | User Service 협의 |
| P2       | HTTP 오류 코드 및 내부 오류 코드      | TBC  | UI-01 미결: "HTTP 상태 코드 및 내부 오류 코드 전체 정의"                                   | 오류 코드 확정 전 일관된 오류 응답 구현 불가    | 팀 내부 결정      |
| P2       | Rate Limiting 수치                    | TBC  | 8.2절: "예상 동시 사용자 수 및 서버 용량 분석이 선행되어야 적정 제한값 산정 가능"          | 수치 확정 전 Rate Limiting 미들웨어 설정 불가   | 팀 내부 결정      |
| P2       | 다운로드 URL 만료 시간 정책           | TBC  | UI-01 미결: "다운로드 URL 만료 시간 정책 확정"                                             | 정책 확정 전 expires_in_sec 기본값 설정 불가    | 팀 내부 결정      |
| P2       | 썸네일 format 기본값                  | TBC  | UI-01: "format: png\|jpg (기본값: TBD)" / 성숙도: TBC                                      | 기본값 확정 전 getThumbnail() 기본 포맷 미결    | 팀 내부 결정      |
| P3       | POST /v1/stac/search 요청 바디 스키마 | TBD  | 8.2절: "STAC API filter 확장(CQL2) 지원 범위를 User Service 요구사항 기반으로 결정해야 함" | 스키마 확정 전 searchStacPost() 구현 불가       | User Service 협의 |

---

## 관련 문서

- **UI-01** — 엔드포인트 목록, 인증 방식, SLA 정의 (ICD 5.2절)
- **SI-06** — sar_products, stac_items 읽기 전용 조회 (ICD 6.7절)
- **CI-03** — CSU-01.01 DB Interface, CSU-01.02 Geo Data Manager 사용 (ICD 6.8절)
