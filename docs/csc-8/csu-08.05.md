# CSU-08.05 — Product Lifecycle Manager

| 항목                | 내용                                   |
| ------------------- | -------------------------------------- |
| **CSU ID**          | CSU-08.05                              |
| **소속 CSC**        | CSC-08 Product & Catalog Manager (PPS) |
| **ICD 버전**        | v1.0 (2026-03-20)                      |
| **관련 인터페이스** | SI-06, CI-03                           |

---

## 타입 정의

```typescript
/**
 * 제품 상태
 * @status TBD — 허용값 전체 목록 미확정
 */
export type ProductStatus =
  | 'REGISTERED' // 등록됨
  | 'PUBLISHED' // 서비스 제공 중
  | 'ARCHIVED'; // 아카이빙 (구 버전)

export interface ProductVersionInput {
  /** 원본 제품 ID (UUID v4). 재처리 대상 */
  original_product_id: string;

  /** 신규 버전 제품 NAS 파일 경로 */
  new_product_path: string;
}

export interface ProductVersionResult {
  /** 신규 버전 제품 ID (UUID v4) */
  new_product_id: string;

  /** 아카이빙 처리된 이전 버전 제품 ID */
  archived_product_id: string;
}
```

---

## CSU 인터페이스

```typescript
export interface IProductLifecycleManager {
  /**
   * 재처리(OPS-03) 시 기존 제품을 아카이빙하고 신규 버전을 등록한다.
   * 이전 버전 status를 'ARCHIVED'로, 신규 버전 status를 'PUBLISHED'로 설정한다.
   *
   * @throws DbError       상태 갱신 실패
   * @throws NotFoundError 원본 제품 없음
   */
  createNewVersion(input: ProductVersionInput): Promise<ProductVersionResult>;

  /**
   * 제품 상태를 변경한다.
   *
   * @throws DbError       상태 갱신 실패
   * @throws NotFoundError 대상 제품 없음
   */
  updateStatus(productId: string, status: ProductStatus): Promise<void>;
}
```

---

## 예외 타입

```typescript
export class DbError extends Error {} // 상태 갱신 실패
export class NotFoundError extends Error {} // 대상 제품 없음
```

---

## 의존 관계

| 의존 대상                  | 호출 목적                        | 정의 위치 |
| -------------------------- | -------------------------------- | --------- |
| **CSU-01.01** DB Interface | 제품 상태 갱신, 버전 레코드 생성 | CI-03     |

---

## 미확정 항목

| 우선순위 | 항목                             | 상태 | 해결 조건               |
| -------- | -------------------------------- | ---- | ----------------------- |
| P2       | `ProductStatus` 허용값 전체 목록 | TBD  | SI-06 DB 스키마 확정 후 |
| P2       | 아카이빙 보존 기간 정책          | TBD  | 팀 내부 결정            |
| P3       | 버전 이력 조회 API 제공 여부     | TBD  | UI-01 스키마 확정 후    |

---

## 관련 문서

- **SI-06** — `status` 컬럼 및 product 테이블 스키마 원천 정의 (ICD)
- **CI-03** — CSU-01.01 사용 (ICD)
