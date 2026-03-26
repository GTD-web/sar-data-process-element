# CSU-09.02 — OGC Map Service

| 항목                | 내용                                |
| ------------------- | ----------------------------------- |
| **CSU ID**          | CSU-09.02                           |
| **소속 CSC**        | CSC-09 Data Service Subsystem (DSS) |
| **ICD 버전**        | v1.0 (2026-03-20)                   |
| **관련 인터페이스** | UI-02, SI-06, CI-03                 |
| **제공 프로토콜**   | WMS 1.3.0, WCS 2.0, WMTS 1.0.0      |

---

## 입력 타입

> **ICD 출처:** 5.3절 UI-02 OGC 서비스 엔드포인트 테이블

```typescript
/**
 * WMS GetMap 요청 파라미터 (OGC WMS 1.3.0 기준).
 * GeoServer를 통해 sar_products 래스터 데이터를 타일 이미지로 제공한다.
 */
export interface WmsGetMapRequest {
  /** 레이어 이름. sar_products product_type 코드 기반
   * ICD UI-02: "LAYERS — 렌더링할 레이어 목록" / 성숙도: TBC
   * @status TBC — 레이어 이름 규칙 미확정 */
  LAYERS: string;

  /** 좌표 참조 시스템. 예: "EPSG:4326", "EPSG:32652"
   * ICD UI-02: "CRS — 좌표 참조 시스템" / 성숙도: TBC
   * @status TBC — 지원 CRS 목록 미확정 */
  CRS: string;

  /** 공간 범위 (minx,miny,maxx,maxy)
   * ICD UI-02: "BBOX — 공간 범위" / 성숙도: 확정 */
  BBOX: string;

  /** 이미지 너비 (픽셀)
   * ICD UI-02: "WIDTH — 이미지 너비" / 성숙도: 확정 */
  WIDTH: number;

  /** 이미지 높이 (픽셀)
   * ICD UI-02: "HEIGHT — 이미지 높이" / 성숙도: 확정 */
  HEIGHT: number;

  /** 반환 이미지 형식. 예: "image/png", "image/jpeg"
   * ICD UI-02: "FORMAT — 반환 이미지 형식" / 성숙도: TBC
   * @status TBC — 지원 포맷 목록 미확정 */
  FORMAT: string;
}

/**
 * WCS GetCoverage 요청 파라미터 (OGC WCS 2.0 기준).
 * SAR 래스터 데이터를 원시 커버리지(GeoTIFF 등)로 제공한다.
 */
export interface WcsGetCoverageRequest {
  /** 커버리지 ID. sar_products.product_id 기반
   * ICD UI-02: "COVERAGEID — 커버리지 식별자" / 성숙도: TBC
   * @status TBC — 커버리지 ID 규칙 미확정 */
  COVERAGEID: string;

  /** 공간 서브셋. 예: "Lat(-10,10),Long(120,130)"
   * ICD UI-02: "SUBSET — 공간 서브셋 (선택)" / 성숙도: TBC */
  SUBSET?: string;

  /** 출력 포맷. 예: "image/tiff"
   * ICD UI-02: "FORMAT — 출력 포맷" / 성숙도: TBC
   * @status TBC — 지원 포맷 목록 미확정 */
  FORMAT?: string;
}

/**
 * WMTS GetTile 요청 파라미터 (OGC WMTS 1.0.0 기준).
 * 사전 생성된 타일 이미지를 캐시에서 제공한다.
 */
export interface WmtsGetTileRequest {
  /** 레이어 식별자
   * ICD UI-02: "Layer — 레이어 식별자" / 성숙도: TBC
   * @status TBC — 레이어 정의 미확정 */
  Layer: string;

  /** 타일 매트릭스 세트. 예: "EPSG:4326"
   * ICD UI-02: "TileMatrixSet — 타일 매트릭스 세트" / 성숙도: TBC */
  TileMatrixSet: string;

  /** 줌 레벨
   * ICD UI-02: "TileMatrix — 줌 레벨" / 성숙도: 확정 */
  TileMatrix: string;

  /** 행 번호
   * ICD UI-02: "TileRow — 행 번호" / 성숙도: 확정 */
  TileRow: number;

  /** 열 번호
   * ICD UI-02: "TileCol — 열 번호" / 성숙도: 확정 */
  TileCol: number;
}
```

---

## CSU 인터페이스

> **ICD 출처:** 5.3절 UI-02 OGC 서비스 엔드포인트 테이블

| 메서드 / 엔드포인트 | ICD 근거 문장                                                      | 결론                                        |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------- |
| `GET /ogc/wms`      | UI-02: "WMS 1.3.0 — GetCapabilities, GetMap 지원" / 성숙도: TBC    | GeoServer WMS 프록시. GetMap 요청 처리      |
| `GET /ogc/wcs`      | UI-02: "WCS 2.0 — GetCapabilities, GetCoverage 지원" / 성숙도: TBC | GeoServer WCS 프록시. GetCoverage 요청 처리 |
| `GET /ogc/wmts`     | UI-02: "WMTS 1.0.0 — GetCapabilities, GetTile 지원" / 성숙도: TBC  | GeoServer WMTS 프록시. 타일 캐시 제공       |

```typescript
export interface IOgcMapService {
  /**
   * WMS GetMap 요청을 처리하여 지정된 영역의 래스터 이미지를 반환한다.
   * GeoServer WMS 엔드포인트로 요청을 위임한다.
   *
   * 처리 순서:
   *   1. JWT 인증 검증
   *   2. LAYERS에 해당하는 제품 존재 여부 확인 (SI-06 경유)
   *   3. GeoServer WMS 요청으로 위임
   *   4. 이미지 바이너리 반환
   *
   * ICD 근거: UI-02 — "WMS 1.3.0 — GetCapabilities, GetMap 지원"
   *   응답 SLA — "지도 타일 응답: 2초 이내 (95 백분위)"
   *
   * @throws UnauthorizedError  JWT 인증 실패
   * @throws NotFoundError      레이어(제품) 없음
   * @throws OgcServiceError    GeoServer 처리 실패
   */
  getWmsMap(request: WmsGetMapRequest, authToken: string): Promise<Buffer>;

  /**
   * WMS GetCapabilities XML 문서를 반환한다.
   * 사용 가능한 레이어 및 지원 작업 목록을 포함한다.
   *
   * ICD 근거: UI-02 — "WMS 1.3.0 — GetCapabilities, GetMap 지원"
   */
  getWmsCapabilities(): Promise<string>;

  /**
   * WCS GetCoverage 요청을 처리하여 원시 래스터 커버리지 데이터를 반환한다.
   * 서브셋 지정 시 해당 공간 범위만 잘라서 반환한다.
   *
   * ICD 근거: UI-02 — "WCS 2.0 — GetCapabilities, GetCoverage 지원"
   *
   * @throws UnauthorizedError  JWT 인증 실패
   * @throws NotFoundError      커버리지(제품) 없음
   * @throws OgcServiceError    GeoServer 처리 실패
   */
  getWcsCoverage(request: WcsGetCoverageRequest, authToken: string): Promise<Buffer>;

  /**
   * WMTS GetTile 요청을 처리하여 사전 생성된 타일 이미지를 반환한다.
   * 캐시 미스 시 GeoServer에서 즉시 생성 후 반환한다.
   *
   * ICD 근거: UI-02 — "WMTS 1.0.0 — GetCapabilities, GetTile 지원"
   *   응답 SLA — "지도 타일 응답: 2초 이내 (95 백분위)"
   *
   * @throws UnauthorizedError  JWT 인증 실패
   * @throws NotFoundError      레이어 또는 타일 없음
   * @throws OgcServiceError    GeoServer 처리 실패
   */
  getWmtsTile(request: WmtsGetTileRequest, authToken: string): Promise<Buffer>;
}
```

---

## 예외 타입

> **ICD 출처:** 5.3절 UI-02

| 예외                | ICD 근거 문장                                                                               | 결론                                 |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| `UnauthorizedError` | UI-02: "JWT Bearer 토큰 (RS256 알고리즘). UI-01과 동일한 인증 방식 적용" (인증 실패 가능성) | JWT 검증 실패 시 HTTP 401            |
| `NotFoundError`     | UI-02: "레이어/커버리지가 존재하지 않을 경우" (미존재 리소스 요청 가능성)                   | 미존재 리소스 요청 시 HTTP 404       |
| `OgcServiceError`   | UI-02: "GeoServer 연동 오류 시 OGC 표준 ExceptionReport 반환" / 성숙도: TBC                 | GeoServer 처리 실패 시 OGC 오류 반환 |

```typescript
export class UnauthorizedError extends Error {} // JWT 인증 실패 → HTTP 401
export class NotFoundError extends Error {} // 미존재 리소스 → HTTP 404
export class OgcServiceError extends Error {} // GeoServer 처리 실패
```

---

## 의존 관계

> **ICD 출처:** 5.3절 UI-02, 6.7절 SI-06, 6.8절 CI-03

| 의존 대상                  | 호출 목적                              | ICD 근거 문장                                                     | 결론                        | 정의 위치                 |
| -------------------------- | -------------------------------------- | ----------------------------------------------------------------- | --------------------------- | ------------------------- |
| **GeoServer**              | WMS/WCS/WMTS 요청 위임                 | UI-02: "GeoServer를 통해 OGC 표준 지도 서비스 제공" / 성숙도: TBC | OGC 처리는 GeoServer에 위임 | 외부 컴포넌트 (GeoServer) |
| **CSU-01.01** DB Interface | 레이어/제품 존재 여부 확인 (읽기 전용) | SI-06: "CSC-09는 읽기 전용 (SELECT만 허용). 쓰기는 CSC-08 전용"   | DB 접근은 CI-03 경유        | CI-03                     |

---

## 미확정 항목

> **ICD 출처:** 5.3절 UI-02 미결 항목, 8.2절

| 우선순위 | 항목                       | 상태 | ICD 근거 문장                                                               | 결론                                   | 해결 조건         |
| -------- | -------------------------- | ---- | --------------------------------------------------------------------------- | -------------------------------------- | ----------------- |
| P1       | GeoServer 레이어 이름 규칙 | TBC  | UI-02 미결: "레이어 이름 규칙 및 product_type 코드와의 매핑 방식 확정 필요" | 규칙 확정 전 WMS/WMTS 레이어 구성 불가 | 팀 내부 결정      |
| P1       | 지원 CRS 목록              | TBC  | UI-02 미결: "지원 CRS 목록 (EPSG:4326, 32652 외 추가 여부) 확정 필요"       | 목록 확정 전 CRS 유효성 검증 불가      | 팀 내부 결정      |
| P2       | WMTS 타일 캐시 전략        | TBC  | 8.2절: "WMTS 타일 사전 생성(pre-seeding) 범위 및 캐시 용량 분석 선행 필요"  | 캐시 전략 미확정 시 응답 SLA 보장 불가 | 팀 내부 결정      |
| P2       | WCS 지원 출력 포맷         | TBC  | UI-02 미결: "GetCoverage 출력 포맷 (GeoTIFF, NetCDF 등) 지원 범위 확정"     | 포맷 목록 확정 전 클라이언트 통합 불가 | User Service 협의 |
| P3       | OGC 인증 위임 방식         | TBD  | ICD 미기재 — GeoServer와 CSU-09.02 간 인증 토큰 전달 방식 미결              | GeoServer 인증 구성 미확정             | 팀 내부 결정      |

---

## 관련 문서

- **UI-02** — OGC 서비스 엔드포인트 목록, 인증 방식, SLA 정의 (ICD 5.3절)
- **SI-06** — sar_products 읽기 전용 조회 (ICD 6.7절)
- **CI-03** — CSU-01.01 DB Interface 사용 (ICD 6.8절)
- **CSU-09.01** — 동일 CSC 내 REST API Handler (레이어/제품 정보 공유)
