# CSU-08.01 — Catalog Registration Listener

| 항목                | 내용                                   |
| ------------------- | -------------------------------------- |
| **CSU ID**          | CSU-08.01                              |
| **소속 CSC**        | CSC-08 Product & Catalog Manager (PPS) |
| **ICD 버전**        | v1.0 (2026-03-20)                      |
| **관련 인터페이스** | SI-05, SI-06, CI-03                    |
| **구독 큐**         | `sdpe.catalog.registration`            |

---

## 입력 타입

> **ICD 출처:** 6.6절 SI-05 제품 등록 트리거 필드 테이블

```typescript
/**
 * SI-05 제품 등록 트리거 메시지 (pgmq 페이로드).
 * CSC-07이 LEVEL_1 이상 제품 처리 완료 시 sdpe.catalog.registration 큐에 발행한다.
 */
export interface ProductRegistrationTrigger {
  /** 메시지 스키마 버전. 현재 "1.0"
   * ICD 6.6절: "schema_version — 메시지 스키마 버전. '1.0'" / 성숙도: TBC
   * @status TBC — 미확정 */
  schema_version: string;

  /** 등록 요청 고유 ID (UUID v4)
   * ICD 6.6절: "registration_id — 등록 요청 고유 ID" / 성숙도: TBC
   * @status TBC — 미확정 */
  registration_id: string;

  /** 원본 처리 작업 ID (SI-04와 연결)
   * ICD 6.6절: "job_id — 원본 처리 작업 ID (SI-04와 연결)" / 성숙도: 확정 */
  job_id: string;

  /** 등록 대상 제품 레벨. "LEVEL_1"~"LEVEL_3"
   * ICD 6.6절: "product_level — 등록 대상 제품 레벨. 'LEVEL_1'~'LEVEL_3'" / 성숙도: 확정 */
  product_level: 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

  /** 산출물 유형. 예: "GRD", "SLC"
   * ICD 6.6절: "product_type — 산출물 유형. 예: 'GRD', 'SLC'" / 성숙도: TBC
   * @status TBC — 허용값 전체 목록 미확정 */
  product_type: string;

  /** NAS 제품 파일 경로
   * ICD 6.6절: "product_path — NAS 제품 파일 경로" / 성숙도: 확정 */
  product_path: string;

  /** 위성 식별자
   * ICD 6.6절: "satellite_id — 위성 식별자" / 성숙도: TBC
   * @status TBC — 형식 미확정 */
  satellite_id: string;

  /** 촬영 시작 UTC 시각 (ISO 8601)
   * ICD 6.6절: "acquisition_start — 촬영 시작 UTC 시각" / 성숙도: 확정 */
  acquisition_start: string;

  /** 촬영 종료 UTC 시각 (ISO 8601)
   * ICD 6.6절: "acquisition_end — 촬영 종료 UTC 시각" / 성숙도: 확정 */
  acquisition_end: string;

  /** 제품 공간 범위 WKT POLYGON 형식
   * ICD 6.6절: "footprint_wkt — 제품 공간 범위 WKT POLYGON 형식" / 성숙도: TBC
   * @status TBC — 정밀도 및 좌표계 확정 필요 */
  footprint_wkt: string;

  /** 품질 검증 실행 여부. true 시 CSU-08.02 자동 실행
   * ICD 6.6절: "quality_run — 품질 검증 실행 여부. true 시 CSC-08.02 자동 실행" / 성숙도: TBC
   * @status TBC — 자동 실행 조건 미확정 */
  quality_run: boolean;
}
```

---

## CSU 인터페이스

> **ICD 출처:** 3.1절 OPS-01 8단계, 3.3절 OPS-03 3~4단계, 6.6절 SI-05

| 메서드                      | ICD 근거 문장                                                                                                                             | 결론                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `startPolling()`            | SI-05: "Level-1 이상 제품 처리 완료 시 자동 발행"                                                                                         | sdpe.catalog.registration 큐를 지속적으로 감시해야 함 |
| `poll()`                    | OPS-01 8단계: "CSC-08이 메타데이터 추출, 품질 검증, STAC 등록, 공간 인덱스 갱신"                                                          | 큐에서 트리거를 꺼내 처리하는 행위                    |
| `onRegistrationTriggered()` | OPS-01 8단계: "CSC-08이 메타데이터 추출, 품질 검증, STAC 등록, 공간 인덱스 갱신. sar_products 테이블에 레코드 생성. status = 'PUBLISHED'" | 등록 트리거를 수신하여 전체 등록 파이프라인 조정      |

```typescript
export interface ICatalogRegistrationListener {
  /**
   * sdpe.catalog.registration 큐를 지속적으로 감시한다.
   * ICD 근거: SI-05 — "Level-1 이상 제품 처리 완료 시 자동 발행"
   */
  startPolling(): void;

  /**
   * sdpe.catalog.registration 큐에서 메시지를 읽어 처리한다.
   * 정상 처리 시 큐에서 삭제한다. 실패 시 삭제하지 않아 VT 후 자동 재노출된다.
   * ICD 근거: OPS-01 8단계 — "CSC-08이 메타데이터 추출, 품질 검증, STAC 등록, 공간 인덱스 갱신"
   *
   * @returns 'processed' — 트리거 1건 이상 처리 완료
   * @returns 'empty'     — 큐에 처리할 트리거 없음
   */
  poll(): Promise<'processed' | 'empty'>;

  /**
   * 제품 등록 트리거를 처리하여 전체 카탈로그 등록 파이프라인을 실행한다.
   *
   * 처리 순서:
   *   1. product_path에서 메타데이터 추출 (CSU-01.03 경유)
   *   2. quality_run == true이면 CSU-08.02 품질 검증 실행
   *      - 품질 실패 시: sar_products.status = 'QUALITY_FAILED' 기록 후 Alert 발행 위임 (CSU-07.07)
   *   3. CSU-08.03을 통해 STAC Item/Collection 등록
   *   4. CSU-08.04를 통해 PostGIS 공간 인덱스 갱신
   *   5. sar_products 테이블에 레코드 생성. status = 'PUBLISHED' (CSU-01.01 경유)
   *   6. OPS-03 재처리의 경우: CSU-08.05를 통해 기존 버전 아카이빙 후 신규 버전 등록
   *
   * ICD 근거:
   *   - OPS-01 8단계 — "CSC-08이 메타데이터 추출, 품질 검증, STAC 등록, 공간 인덱스 갱신.
   *     sar_products 테이블에 레코드 생성. status = 'PUBLISHED'"
   *   - SI-06: sar_products 테이블 status 필드 — "'REGISTERED', 'PUBLISHED', ..."
   *   - 3절 모니터링: "데이터 품질 — 품질 기준 미달 → CSC-08.02 → CSC-07.07 Alert"
   *   - OPS-03 3단계 — "CSC-08이 기존 제품 버전 관리 후 신규 버전 등록 (CSC-08.05)"
   *
   * @throws FileReadError        product_path 파일 읽기 실패
   * @throws RegistrationError    STAC 등록 또는 DB 기록 실패
   */
  onRegistrationTriggered(trigger: ProductRegistrationTrigger): Promise<void>;
}
```

---

## 예외 타입

> **ICD 출처:** 3.1절 OPS-01 8단계

| 예외                | ICD 근거 문장                                                           | 결론                       |
| ------------------- | ----------------------------------------------------------------------- | -------------------------- |
| `FileReadError`     | OPS-01 8단계: "메타데이터 추출" (NAS 파일 읽기 실패 가능성)             | NAS 파일 읽기 실패 시 예외 |
| `RegistrationError` | OPS-01 8단계: "sar_products 테이블에 레코드 생성" (DB 기록 실패 가능성) | 카탈로그 등록 실패 시 예외 |

```typescript
export class FileReadError extends Error {} // NAS 파일 읽기 실패
export class RegistrationError extends Error {} // STAC 등록 또는 DB 기록 실패
```

---

## 의존 관계

> **ICD 출처:** 3.1절 OPS-01 8단계, 3.3절 OPS-03 3단계

| 의존 대상                  | 호출 목적                         | ICD 근거 문장                                                                                        | 결론                  | 정의 위치            |
| -------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------- | -------------------- |
| **CSU-08.02**              | 품질 검증 실행                    | 6.6절 SI-05: "quality_run — true 시 CSC-08.02 자동 실행"                                             | 품질 검증 위임        | CSU-08.02 인터페이스 |
| **CSU-08.03**              | STAC Item/Collection 등록         | OPS-01 8단계: "STAC 등록"                                                                            | STAC 등록 위임        | CSU-08.03 인터페이스 |
| **CSU-08.04**              | PostGIS 공간 인덱스 갱신          | OPS-01 8단계: "공간 인덱스 갱신"                                                                     | 공간 인덱스 갱신 위임 | CSU-08.04 인터페이스 |
| **CSU-08.05**              | 기존 버전 아카이빙 및 버전 관리   | OPS-03 3단계: "CSC-08이 기존 제품 버전 관리 후 신규 버전 등록 (CSC-08.05 Product Lifecycle Manager)" | 버전 관리 위임        | CSU-08.05 인터페이스 |
| **CSU-07.07**              | 품질 실패 Alert 발행              | 3절 모니터링: "데이터 품질 — 품질 기준 미달 → CSC-08.02 → CSC-07.07 Alert"                           | Alert 발행 위임       | CSU-07.07 인터페이스 |
| **CSU-01.01** DB Interface | sar_products 레코드 생성 및 조회  | OPS-01 8단계: "sar_products 테이블에 레코드 생성"                                                    | DB 접근은 CI-03 경유  | CI-03                |
| **CSU-01.03** NAS Manager  | product_path 파일 메타데이터 추출 | OPS-01 8단계: "메타데이터 추출"                                                                      | NAS 접근은 CI-03 경유 | CI-03                |

---

## 미확정 항목

> **ICD 출처:** 6.6절 SI-05 미결 항목, 8.3절

| 우선순위 | 항목                             | 상태 | ICD 근거 문장                                                                     | 결론                                         | 해결 조건    |
| -------- | -------------------------------- | ---- | --------------------------------------------------------------------------------- | -------------------------------------------- | ------------ |
| P1       | `footprint_wkt` 정밀도 및 좌표계 | TBC  | 8.3절: "footprint_wkt 정밀도 및 좌표계 확정"                                      | 확정 전 공간 인덱스 생성 정확도 보장 불가    | 팀 내부 결정 |
| P2       | `quality_run` 자동 실행 조건     | TBC  | 8.3절: "품질 검증 자동 실행 조건 확정"                                            | 조건 미확정 시 품질 검증 실행 여부 판단 불가 | 팀 내부 결정 |
| P2       | 등록 실패 시 재시도 정책         | TBC  | 8.3절: "등록 실패 시 재시도 정책 확정"                                            | 재시도 정책 미확정 시 오류 복구 구현 불가    | 팀 내부 결정 |
| P2       | `product_type` 허용값 목록       | TBC  | 8.3절: "output_product_type 허용값 목록 — 파일명 규칙 PRODUCT_TYPE과 일관성 필요" | 목록 확정 전 유효성 검증 불가                | 팀 내부 결정 |
| P2       | SI-05 트리거 큐 VT               | TBC  | SI-05 전달 매체: "pgmq 큐: sdpe.catalog.registration" / 성숙도: TBC               | VT 미확정 시 등록 작업 시간 초과 대응 불가   | 팀 내부 결정 |
| P3       | `schema_version` "1.0" 고정 여부 | TBC  | SI-05: "schema_version — '1.0'" / 성숙도: TBC                                     | 스키마 버전 확정 전 역호환성 구현 범위 미결  | 팀 내부 결정 |

---

## 관련 문서

- **SI-05** — 구독 트리거 구조 정의 (ICD 6.6절)
- **SI-06** — sar_products 테이블 스키마 (ICD 6.7절)
- **CI-03** — CSU-01.01 DB Interface, CSU-01.03 NAS Manager 사용 (ICD 6.8절)
- **CSU-08.02** — 품질 검증
- **CSU-08.03** — STAC 등록
- **CSU-08.04** — 공간 인덱스 갱신
- **CSU-08.05** — 버전 관리
