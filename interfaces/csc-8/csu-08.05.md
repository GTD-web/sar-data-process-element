# CSU-08.05 — Product Lifecycle Manager

| 항목                | 내용                                   |
| ------------------- | -------------------------------------- |
| **CSU ID**          | CSU-08.05                              |
| **소속 CSC**        | CSC-08 Product & Catalog Manager (PPS) |
| **ICD 버전**        | v1.0 (2026-03-20)                      |
| **관련 인터페이스** | SI-05, SI-06, CI-03                    |

---

## 입력 타입

> **ICD 출처:** 3.3절 OPS-03 3~4단계, 6.7절 SI-06

```typescript
/**
 * 제품 버전 등록 요청.
 * OPS-03 재처리 시 기존 제품을 아카이빙하고 신규 버전을 등록한다.
 */
export interface ProductVersionRequest {
  /** 재처리 대상 원본 제품 ID (기존 버전). 신규 등록이면 null
   * ICD OPS-03 3단계: "CSC-08이 기존 제품 버전 관리 후 신규 버전 등록" */
  existing_product_id: string | null;

  /** 신규 버전으로 등록할 제품 정보 */
  new_product: {
    /** NAS 제품 파일 경로
     * ICD SI-06: "file_path TEXT NOT NULL" */
    file_path: string;

    /** 위성 식별자 */
    satellite_id: string;

    /** 제품 레벨 */
    product_level: string;

    /** 산출물 유형 */
    product_type: string;

    /** 촬영 시작 UTC 시각 */
    acquisition_start: string;

    /** 촬영 종료 UTC 시각 */
    acquisition_end: string;

    /** 공간 범위 WKT POLYGON */
    footprint_wkt: string;

    /** 품질 검증 통과 여부 */
    quality_passed: boolean;
  };
}

/**
 * 제품 버전 등록 결과.
 */
export interface ProductVersionResult {
  /** 신규 버전 제품 ID (UUID v4) */
  new_product_id: string;

  /** 아카이빙된 기존 버전 제품 ID. 신규 등록이면 null */
  archived_product_id: string | null;

  /** 현재 활성 버전 상태
   * ICD SI-06: "status VARCHAR NOT NULL — 'REGISTERED', 'PUBLISHED', ..." */
  status: string;
}
```

---

## CSU 인터페이스

> **ICD 출처:** 3.3절 OPS-03 3~4단계

| 메서드                 | ICD 근거 문장                                                                                        | 결론                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `registerNewVersion()` | OPS-03 3단계: "CSC-08이 기존 제품 버전 관리 후 신규 버전 등록 (CSC-08.05 Product Lifecycle Manager)" | 기존 버전 아카이빙 후 신규 버전을 PUBLISHED 상태로 등록                   |
| `archiveProduct()`     | OPS-03 4단계: "이전 버전은 아카이빙 상태로 유지"                                                     | 특정 제품을 아카이빙 상태로 변경 (내부 유틸리티)                          |
| `getLatestVersion()`   | OPS-03 4단계: "User Service가 GET /v1/products/{id} 조회 시 최신 버전 반환"                          | 동일 촬영(satellite_id, acquisition_start, product_type)의 최신 버전 반환 |

```typescript
export interface IProductLifecycleManager {
  /**
   * 신규 버전 제품을 등록하고, 기존 버전이 있으면 아카이빙 상태로 변경한다.
   * existing_product_id가 null이면 최초 등록으로 처리한다.
   *
   * 처리 순서:
   *   1. existing_product_id가 non-null이면 → archiveProduct() 호출
   *   2. sar_products 테이블에 신규 버전 레코드 INSERT. status = 'PUBLISHED'
   *
   * ICD 근거:
   *   - OPS-03 3단계 — "CSC-08이 기존 제품 버전 관리 후 신규 버전 등록
   *     (CSC-08.05 Product Lifecycle Manager)"
   *   - OPS-03 4단계 — "신규 버전 제품 STAC 등록 완료. ... 이전 버전은 아카이빙 상태로 유지"
   *   - SI-06 — "status VARCHAR NOT NULL — 'REGISTERED', 'PUBLISHED', ..."
   *
   * @throws ProductNotFoundError  existing_product_id에 해당하는 제품 없음
   * @throws DbError               DB 갱신 실패
   */
  registerNewVersion(request: ProductVersionRequest): Promise<ProductVersionResult>;

  /**
   * 특정 제품을 아카이빙 상태로 변경한다.
   * sar_products.status를 'ARCHIVED'로 갱신한다.
   *
   * ICD 근거: OPS-03 4단계 — "이전 버전은 아카이빙 상태로 유지"
   *
   * @throws ProductNotFoundError  productId에 해당하는 제품 없음
   * @throws DbError               DB 갱신 실패
   */
  archiveProduct(productId: string): Promise<void>;

  /**
   * 동일 촬영 조건(satellite_id, acquisition_start, product_type)의 최신 PUBLISHED 버전을 반환한다.
   * CSU-09.01 Product API Handler가 GET /v1/products/{id} 응답 시 최신 버전을 반환하기 위해 사용한다.
   *
   * ICD 근거: OPS-03 4단계 — "User Service가 GET /v1/products/{id} 조회 시 최신 버전 반환"
   *
   * @returns 제품 ID (UUID v4) 또는 null (해당 버전 없음)
   * @throws DbError  DB 조회 실패
   */
  getLatestVersion(satelliteId: string, acquisitionStart: string, productType: string): Promise<string | null>;
}
```

---

## 예외 타입

> **ICD 출처:** 3.3절 OPS-03 3~4단계

| 예외                   | ICD 근거 문장                                                 | 결론                           |
| ---------------------- | ------------------------------------------------------------- | ------------------------------ |
| `ProductNotFoundError` | OPS-03 3단계: "기존 제품 버전 관리" (기존 버전 미존재 가능성) | 미존재 product_id 참조 시 예외 |
| `DbError`              | OPS-03 3단계: "신규 버전 등록" (DB 갱신 실패 가능성)          | DB 갱신/조회 실패 시 예외      |

```typescript
export class ProductNotFoundError extends Error {} // 미존재 product_id
export class DbError extends Error {} // DB 갱신/조회 실패
```

---

## 의존 관계

> **ICD 출처:** 3.3절 OPS-03 3~4단계, 6.8절 CI-03

| 의존 대상                  | 호출 목적                                | ICD 근거 문장                                                        | 결론                 | 정의 위치 |
| -------------------------- | ---------------------------------------- | -------------------------------------------------------------------- | -------------------- | --------- |
| **CSU-01.01** DB Interface | sar_products 레코드 INSERT/UPDATE/SELECT | OPS-03 3단계: "기존 제품 버전 관리 후 신규 버전 등록" (DB 접근 원칙) | DB 접근은 CI-03 경유 | CI-03     |

---

## 미확정 항목

> **ICD 출처:** 6.7절 SI-06

| 우선순위 | 항목                              | 상태 | ICD 근거 문장                                                                            | 결론                                                   | 해결 조건    |
| -------- | --------------------------------- | ---- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------ |
| P2       | `product_status` 허용값 전체 목록 | TBD  | SI-06 미결: "product_status 허용값 목록 확정"                                            | 'ARCHIVED' 상태값 포함 전체 목록 확정 전 구현 불가     | 팀 내부 결정 |
| P2       | 동일 촬영 기준 버전 관리 키       | TBD  | ICD 미기재 — (satellite_id + acquisition_start + product_type) 조합 외 추가 키 여부 미결 | 버전 관리 키 확정 전 getLatestVersion() 쿼리 확정 불가 | 팀 내부 결정 |
| P3       | 아카이빙 보존 기간 정책           | TBD  | ICD 미기재 — 팀 내부 결정 사항                                                           | 아카이빙 데이터 삭제 주기 미결정                       | 팀 내부 결정 |

---

## 관련 문서

- **SI-06** — sar_products 테이블 스키마 및 status 허용값 (ICD 6.7절)
- **CI-03** — CSU-01.01 DB Interface 사용 (ICD 6.8절)
- **CSU-08.01** — registerNewVersion() 호출 (OPS-03 재처리 경로)
- **CSU-09.01** — getLatestVersion() 간접 사용 (GET /v1/products/{id} 최신 버전 반환)
