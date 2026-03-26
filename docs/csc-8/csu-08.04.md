# CSU-08.04 — Spatial Index Manager

| 항목                | 내용                                   |
| ------------------- | -------------------------------------- |
| **CSU ID**          | CSU-08.04                              |
| **소속 CSC**        | CSC-08 Product & Catalog Manager (PPS) |
| **ICD 버전**        | v1.0 (2026-03-20)                      |
| **관련 인터페이스** | SI-06, CI-03                           |

---

## 입력 타입

> **ICD 출처:** 3.1절 OPS-01 8단계, 6.7절 SI-06

```typescript
/**
 * 공간 인덱스 갱신 요청.
 * 신규 제품 등록 또는 버전 갱신 시 PostGIS GIST 인덱스를 갱신한다.
 */
export interface SpatialIndexUpdateRequest {
  /** 제품 고유 식별자 (UUID v4). sar_products 테이블의 id
   * ICD SI-06: "id UUID PRIMARY KEY" */
  product_id: string;

  /** 제품 공간 범위 WKT POLYGON 형식.
   * PostGIS GEOMETRY(POLYGON, 4326)으로 변환하여 인덱스에 반영한다.
   * ICD SI-06: "footprint GEOMETRY(POLYGON, 4326) NOT NULL — PostGIS" */
  footprint_wkt: string;

  /** 인덱스 갱신 작업 유형 */
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
}
```

---

## CSU 인터페이스

> **ICD 출처:** 3.1절 OPS-01 8단계, 6.7절 SI-06

| 메서드                 | ICD 근거 문장                    | 결론                                    |
| ---------------------- | -------------------------------- | --------------------------------------- |
| `updateSpatialIndex()` | OPS-01 8단계: "공간 인덱스 갱신" | sar_products.footprint GIST 인덱스 갱신 |

```typescript
export interface ISpatialIndexManager {
  /**
   * sar_products 테이블의 footprint 컬럼에 PostGIS GIST 공간 인덱스를 갱신한다.
   * WKT 형식의 POLYGON을 EPSG:4326 좌표계 기준 GEOMETRY로 변환하여 반영한다.
   *
   * ICD 근거:
   *   - OPS-01 8단계 — "공간 인덱스 갱신"
   *   - SI-06 — "footprint GEOMETRY(POLYGON, 4326) NOT NULL — PostGIS"
   *   - SI-06 — "CREATE INDEX idx_sar_products_footprint ON sar_products USING GIST(footprint)"
   *
   * @throws InvalidGeometryError    WKT POLYGON 파싱 실패 또는 좌표 범위 초과
   * @throws DbError                 PostGIS GIST 인덱스 갱신 실패
   */
  updateSpatialIndex(request: SpatialIndexUpdateRequest): Promise<void>;
}
```

---

## 예외 타입

> **ICD 출처:** 6.7절 SI-06

| 예외                   | ICD 근거 문장                                                             | 결론                                 |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------------------ |
| `InvalidGeometryError` | SI-06: "footprint GEOMETRY(POLYGON, 4326)" (잘못된 WKT 입력 가능성)       | WKT 파싱 실패 또는 좌표 오류 시 예외 |
| `DbError`              | SI-06: "CREATE INDEX ... USING GIST(footprint)" (인덱스 갱신 실패 가능성) | PostGIS 인덱스 갱신 실패 시 예외     |

```typescript
export class InvalidGeometryError extends Error {} // WKT 파싱 오류 또는 좌표 범위 초과
export class DbError extends Error {} // PostGIS 인덱스 갱신 실패
```

---

## 의존 관계

> **ICD 출처:** 6.7절 SI-06, 6.8절 CI-03

| 의존 대상                      | 호출 목적                          | ICD 근거 문장                                                                          | 결론                          | 정의 위치 |
| ------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------- | --------- |
| **CSU-01.01** DB Interface     | PostGIS 공간 인덱스 갱신 쿼리 실행 | SI-06: "CREATE INDEX idx_sar_products_footprint ON sar_products USING GIST(footprint)" | DB 접근은 CI-03 경유          | CI-03     |
| **CSU-01.02** Geo Data Manager | WKT → PostGIS GEOMETRY 변환        | CI-03: "GeoDataManager.parseWkt(), convertCrs()"                                       | 지리 데이터 변환은 CI-03 경유 | CI-03     |

---

## 미확정 항목

> **ICD 출처:** 6.7절 SI-06

| 우선순위 | 항목                              | 상태 | ICD 근거 문장                                    | 결론                                            | 해결 조건    |
| -------- | --------------------------------- | ---- | ------------------------------------------------ | ----------------------------------------------- | ------------ |
| P2       | `footprint_wkt` 정밀도 및 좌표계  | TBC  | 8.3절: "footprint_wkt 정밀도 및 좌표계 확정"     | 정밀도 확정 전 InvalidGeometryError 조건 미결정 | 팀 내부 결정 |
| P2       | 추가 공간 인덱스 전략 (타 테이블) | TBD  | SI-06 미결: "쿼리 성능 요건 및 인덱스 전략 확정" | 인덱스 전략 확정 전 추가 인덱스 구현 불가       | 팀 내부 결정 |
| P3       | 인덱스 재구축(REINDEX) 정책       | TBD  | ICD 미기재 — 팀 내부 결정 사항                   | 주기적 REINDEX 여부 및 트리거 조건 미결정       | 팀 내부 결정 |

---

## 관련 문서

- **SI-06** — footprint GIST 인덱스 정의 (ICD 6.7절)
- **CI-03** — CSU-01.01 DB Interface, CSU-01.02 Geo Data Manager 사용 (ICD 6.8절)
- **CSU-08.01** — 공간 인덱스 갱신 호출
