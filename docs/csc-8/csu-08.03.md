# CSU-08.03 — STAC Catalog Manager

| 항목                | 내용                                   |
| ------------------- | -------------------------------------- |
| **CSU ID**          | CSU-08.03                              |
| **소속 CSC**        | CSC-08 Product & Catalog Manager (PPS) |
| **ICD 버전**        | v1.0 (2026-03-20)                      |
| **관련 인터페이스** | SI-06, CI-03                           |

---

## 타입 정의

```typescript
export type ProductLevel = 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

export interface StacItemInput {
  /** 제품 고유 식별자 (UUID v4) */
  product_id: string;

  /**
   * 위성 식별자
   * @status TBC — 형식 미확정
   */
  satellite_id: string;

  /** 제품 레벨 */
  product_level: ProductLevel;

  /**
   * 산출물 유형. 예: "GRD", "SLC"
   * @status TBC — 허용값 미확정
   */
  product_type: string;

  /** 촬영 시작 UTC 시각 (ISO 8601) */
  acquisition_start: string;

  /** 촬영 종료 UTC 시각 (ISO 8601) */
  acquisition_end: string;

  /**
   * 제품 공간 범위 (WKT POLYGON 형식)
   * @status TBC — 정밀도 및 좌표계 미확정
   */
  footprint_wkt: string;

  /** NAS 제품 파일 경로 */
  product_path: string;

  /** 품질 검증 통과 여부 */
  quality_passed: boolean;
}

export interface StacItem {
  /** STAC Item ID */
  id: string;

  /**
   * STAC Item 상세 구조
   * @status TBD — STAC Item 매핑 구조 미확정
   */
  [key: string]: unknown;
}
```

---

## CSU 인터페이스

```typescript
export interface IStacCatalogManager {
  /**
   * sar_products 테이블에 제품을 등록하고 STAC Item을 생성한다.
   * status를 'PUBLISHED'로 설정한다.
   *
   * @throws DbError  DB 저장 실패
   */
  register(input: StacItemInput): Promise<StacItem>;

  /**
   * 기존 제품의 STAC Item을 신규 버전으로 갱신한다. OPS-03 재처리 시 사용한다.
   * 이전 버전은 아카이빙 상태로 유지한다.
   *
   * @throws DbError       DB 갱신 실패
   * @throws NotFoundError 갱신 대상 제품 없음
   */
  update(productId: string, input: StacItemInput): Promise<StacItem>;
}
```

---

## 예외 타입

```typescript
export class DbError extends Error {} // DB 저장/갱신 실패
export class NotFoundError extends Error {} // 갱신 대상 제품 없음
```

---

## 의존 관계

| 의존 대상                  | 호출 목적                     | 정의 위치 |
| -------------------------- | ----------------------------- | --------- |
| **CSU-01.01** DB Interface | sar_products, stac_items 저장 | CI-03     |

---

## 미확정 항목

| 우선순위 | 항목                          | 상태 | 해결 조건                     |
| -------- | ----------------------------- | ---- | ----------------------------- |
| P2       | STAC Item 매핑 구조 전체 정의 | TBD  | SI-06 DB 스키마 확정 후       |
| P2       | `product_status` 허용값 목록  | TBD  | SI-06 DB 스키마 확정 후       |
| P2       | stac_collections 구조         | TBD  | SI-06 DB 스키마 확정 후       |
| P2       | 아카이빙 상태 처리 방식       | TBD  | CSU-08.05와 역할 분리 확정 후 |

---

## 관련 문서

- **SI-06** — sar_products, stac_items 테이블 스키마 원천 정의 (ICD)
- **CI-03** — CSU-01.01 사용 (ICD)
