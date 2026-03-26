# CSU-08.03 — STAC Manager

| 항목                | 내용                                   |
| ------------------- | -------------------------------------- |
| **CSU ID**          | CSU-08.03                              |
| **소속 CSC**        | CSC-08 Product & Catalog Manager (PPS) |
| **ICD 버전**        | v1.0 (2026-03-20)                      |
| **관련 인터페이스** | SI-05, SI-06, CI-03                    |

---

## 입력 타입

> **ICD 출처:** 3.1절 OPS-01 8단계, 5.2절 UI-01, 6.7절 SI-06

```typescript
/**
 * STAC Item 등록 요청.
 * 제품 1건에 대한 SpatioTemporal Asset Catalog 표준 아이템을 생성한다.
 */
export interface StacItemRegistrationRequest {
  /** 제품 고유 식별자 (UUID v4). sar_products 테이블의 id와 동일
   * ICD SI-06: "id UUID PRIMARY KEY" */
  product_id: string;

  /** 위성 식별자
   * ICD SI-06: "satellite_id VARCHAR NOT NULL" */
  satellite_id: string;

  /** 제품 레벨
   * ICD SI-06: "product_level VARCHAR NOT NULL — 'LEVEL_0'~'LEVEL_3'" */
  product_level: string;

  /** 산출물 유형. 예: "GRD", "SLC"
   * ICD SI-06: "product_type VARCHAR NOT NULL — 'SLC', 'GRD', 'GEC', ..." */
  product_type: string;

  /** 촬영 시작 UTC 시각 (ISO 8601)
   * ICD SI-06: "acquisition_start TIMESTAMPTZ NOT NULL" */
  acquisition_start: string;

  /** 촬영 종료 UTC 시각 (ISO 8601)
   * ICD SI-06: "acquisition_end TIMESTAMPTZ NOT NULL" */
  acquisition_end: string;

  /** 제품 공간 범위 WKT POLYGON 형식
   * ICD SI-06: "footprint GEOMETRY(POLYGON, 4326) NOT NULL" */
  footprint_wkt: string;

  /** NAS 제품 파일 경로
   * ICD SI-06: "file_path TEXT NOT NULL" */
  file_path: string;
}

/**
 * STAC Collection 조회/생성 요청.
 * 위성·레벨 조합으로 Collection을 관리한다.
 */
export interface StacCollectionRequest {
  /** Collection 식별자. 예: "SAT01_LEVEL_1_GRD"
   * ICD UI-01: "GET /v1/stac/collections — STAC Collection 목록" */
  collection_id: string;

  /** Collection에 속하는 위성 식별자 */
  satellite_id: string;

  /** Collection에 속하는 제품 레벨 */
  product_level: string;
}

/**
 * STAC Item 등록 결과.
 */
export interface StacItemRegistrationResult {
  /** 등록된 STAC Item ID */
  stac_item_id: string;

  /** 등록된 STAC Collection ID */
  stac_collection_id: string;
}
```

---

## CSU 인터페이스

> **ICD 출처:** 3.1절 OPS-01 8단계, 3.3절 OPS-03 4단계, 5.2절 UI-01

| 메서드                    | ICD 근거 문장                                                                                   | 결론                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `registerStacItem()`      | OPS-01 8단계: "STAC 등록"                                                                       | 제품 1건에 대한 STAC Item을 stac_items 테이블에 등록 |
| `getOrCreateCollection()` | UI-01: "GET /v1/stac/collections — STAC Collection 목록" (Collection이 존재해야 Item 등록 가능) | Collection 미존재 시 생성, 기존 시 ID 반환           |

```typescript
export interface IStacManager {
  /**
   * 제품에 대한 STAC Item을 stac_items 테이블에 등록한다.
   * Item 등록 전 해당 Collection이 존재하는지 확인하고, 없으면 자동 생성한다.
   *
   * ICD 근거:
   *   - OPS-01 8단계 — "STAC 등록"
   *   - OPS-03 4단계 — "신규 버전 제품 STAC 등록 완료. User Service가 GET /v1/products/{id}
   *     조회 시 최신 버전 반환. 이전 버전은 아카이빙 상태로 유지"
   *   - SI-06: stac_items, stac_collections 테이블 (STAC Item 매핑 구조: TBD)
   *
   * @throws StacRegistrationError  STAC Item 등록 실패
   * @throws DbError                DB 기록 실패
   */
  registerStacItem(request: StacItemRegistrationRequest): Promise<StacItemRegistrationResult>;

  /**
   * 위성·레벨 조합에 해당하는 STAC Collection을 반환하거나, 없으면 생성한다.
   * 내부 유틸리티로서 registerStacItem() 내에서 호출한다.
   *
   * ICD 근거: UI-01 — "GET /v1/stac/collections — STAC Collection 목록"
   * (Collection 목록이 존재해야 외부에서 조회 가능)
   *
   * @throws DbError  DB 조회/생성 실패
   */
  getOrCreateCollection(request: StacCollectionRequest): Promise<string>; // collection_id 반환
}
```

---

## 예외 타입

> **ICD 출처:** 3.1절 OPS-01 8단계

| 예외                    | ICD 근거 문장                                                         | 결론                        |
| ----------------------- | --------------------------------------------------------------------- | --------------------------- |
| `StacRegistrationError` | OPS-01 8단계: "STAC 등록" (등록 실패 가능성)                          | STAC Item 등록 실패 시 예외 |
| `DbError`               | OPS-01 8단계: "sar_products 테이블에 레코드 생성" (공통 DB 접근 패턴) | DB 기록/조회 실패 시 예외   |

```typescript
export class StacRegistrationError extends Error {} // STAC Item 등록 실패
export class DbError extends Error {} // DB 기록/조회 실패
```

---

## 의존 관계

> **ICD 출처:** 3.1절 OPS-01 8단계, 6.8절 CI-03

| 의존 대상                  | 호출 목적                        | ICD 근거 문장                            | 결론                 | 정의 위치 |
| -------------------------- | -------------------------------- | ---------------------------------------- | -------------------- | --------- |
| **CSU-01.01** DB Interface | stac_items/stac_collections 기록 | OPS-01 8단계: "STAC 등록" (DB 접근 원칙) | DB 접근은 CI-03 경유 | CI-03     |

---

## 미확정 항목

> **ICD 출처:** 6.7절 SI-06, 5.2절 UI-01

| 우선순위 | 항목                                      | 상태 | ICD 근거 문장                                                                                           | 결론                                              | 해결 조건         |
| -------- | ----------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------- |
| P2       | STAC Item 매핑 구조                       | TBD  | SI-06 미결: "STAC Item 매핑 구조 확정"                                                                  | 매핑 구조 확정 전 registerStacItem() 구현 불가    | 팀 내부 결정      |
| P2       | stac_items / stac_collections 전체 스키마 | TBD  | SI-06: "핵심 테이블 (스켈레톤) — sar_products, stac_items, stac_collections, product_files (상세: TBD)" | 스키마 확정 전 DB 기록 구현 불가                  | 팀 내부 결정      |
| P2       | GET /v1/stac/search POST Body 스키마      | TBD  | UI-01: "POST /v1/stac/search — 복합 조건 검색 (POST Body)" / 성숙도: TBD                                | 검색 요청 스키마 확정 전 STAC 검색 기능 구현 불가 | User Service 협의 |
| P2       | Collection 명명 규칙                      | TBD  | ICD 미기재 — 팀 내부 결정 사항                                                                          | 명명 규칙 확정 전 Collection ID 생성 불가         | 팀 내부 결정      |

---

## 관련 문서

- **SI-05** — 등록 트리거 (product_type, footprint_wkt 포함) (ICD 6.6절)
- **SI-06** — stac_items, stac_collections 테이블 스켈레톤 (ICD 6.7절)
- **UI-01** — GET /v1/stac/collections, GET /v1/stac/search 엔드포인트 (ICD 5.2절)
- **CI-03** — CSU-01.01 DB Interface 사용 (ICD 6.8절)
- **CSU-08.01** — STAC 등록 호출
