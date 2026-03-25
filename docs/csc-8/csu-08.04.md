# CSU-08.04 — Spatial Index Manager

| 항목                | 내용                                   |
| ------------------- | -------------------------------------- |
| **CSU ID**          | CSU-08.04                              |
| **소속 CSC**        | CSC-08 Product & Catalog Manager (PPS) |
| **ICD 버전**        | v1.0 (2026-03-20)                      |
| **관련 인터페이스** | SI-06, CI-03                           |

---

## 타입 정의

```typescript
export interface SpatialIndexInput {
  /** 인덱스 갱신 대상 제품 ID (UUID v4) */
  product_id: string;

  /**
   * 제품 공간 범위 (WKT POLYGON 형식)
   * @status TBC — 정밀도 및 좌표계 미확정
   */
  footprint_wkt: string;
}
```

---

## CSU 인터페이스

```typescript
export interface ISpatialIndexManager {
  /**
   * sar_products 테이블의 PostGIS 공간 인덱스를 갱신한다.
   * 신규 제품 등록 및 재처리(OPS-03) 버전 갱신 시 호출한다.
   *
   * @throws DbError  인덱스 갱신 실패
   */
  updateIndex(input: SpatialIndexInput): Promise<void>;
}
```

---

## 예외 타입

```typescript
export class DbError extends Error {} // 인덱스 갱신 실패
```

---

## 의존 관계

| 의존 대상                  | 호출 목적                          | 정의 위치 |
| -------------------------- | ---------------------------------- | --------- |
| **CSU-01.01** DB Interface | PostGIS GIST 인덱스 갱신 쿼리 실행 | CI-03     |

---

## 미확정 항목

| 우선순위 | 항목                  | 상태 | 해결 조건                    |
| -------- | --------------------- | ---- | ---------------------------- |
| P2       | 좌표계 변환 필요 여부 | TBC  | SI-06 DB 스키마 확정 후      |
| P3       | 인덱스 갱신 성능 요건 | TBD  | SI-06 쿼리 성능 요건 확정 후 |

---

## 관련 문서

- **SI-06** — `idx_sar_products_footprint` 인덱스 정의 (ICD)
- **CI-03** — CSU-01.01 사용 (ICD)
