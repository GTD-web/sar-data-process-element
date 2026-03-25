# CSU-09.03 — OGC Map Service Controller

| 항목                | 내용                           |
| ------------------- | ------------------------------ |
| **CSU ID**          | CSU-09.03                      |
| **소속 CSC**        | CSC-09 Data API Provider (DSS) |
| **ICD 버전**        | v1.0 (2026-03-20)              |
| **관련 인터페이스** | UI-02, CI-03                   |

---

## 타입 정의

```typescript
/**
 * OGC 서비스 유형
 * WMS 1.3.0 / WCS 2.0 / WMTS 1.0.0
 */
export type OgcServiceType = 'WMS' | 'WCS' | 'WMTS';

/** WMS GetMap 요청 파라미터 */
export interface WmsGetMapRequest {
  /** 레이어 이름 목록 */
  layers: string[];

  /** 공간 범위 (minX, minY, maxX, maxY) */
  bbox: [number, number, number, number];

  /**
   * 좌표 참조 체계. 기본값: EPSG:4326
   * @status TBC — 추가 지원 EPSG 코드 미확정
   */
  crs: string;

  /** 출력 이미지 너비 (픽셀) */
  width: number;

  /** 출력 이미지 높이 (픽셀) */
  height: number;

  /**
   * 출력 이미지 포맷
   * @status TBC — JPEG 지원 여부 미확정
   */
  format: 'image/png' | 'image/geotiff';
}

/** WCS GetCoverage 요청 파라미터 */
export interface WcsGetCoverageRequest {
  /** Coverage 식별자 */
  coverageId: string;

  /**
   * 출력 포맷
   * @status TBC — 허용값 미확정
   */
  format?: string;

  /**
   * 공간 서브셋
   * @status TBC
   */
  subset?: string[];
}

/** WMTS GetTile 요청 파라미터 */
export interface WmtsTileRequest {
  /** 레이어 이름 */
  layer: string;

  /** 타일 매트릭스 세트 */
  tileMatrixSet: string;

  /** 줌 레벨 */
  tileMatrix: string;

  /** 타일 행 */
  tileRow: number;

  /** 타일 열 */
  tileCol: number;
}
```

---

## CSU 인터페이스

```typescript
export interface IOgcMapServiceController {
  /**
   * WMS GetCapabilities 응답을 반환한다.
   * 인증: API Key 쿼리 파라미터
   *
   * @status TBC — 지원 레이어 목록 미확정
   */
  wmsGetCapabilities(): Promise<string>; // XML

  /**
   * WMS GetMap 이미지를 반환한다.
   * 인증: API Key 쿼리 파라미터
   *
   * @throws LayerNotFoundError  레이어 없음
   * @status TBC — 인증 방식 최종 확정 대기
   */
  wmsGetMap(request: WmsGetMapRequest): Promise<Buffer>;

  /**
   * WCS GetCapabilities 응답을 반환한다.
   * 인증: JWT Bearer 토큰
   *
   * @status TBC — 지원 Coverage 목록 미확정
   */
  wcsGetCapabilities(): Promise<string>; // XML

  /**
   * WCS GetCoverage 래스터 데이터를 반환한다.
   * 인증: JWT Bearer 토큰
   *
   * @throws CoverageNotFoundError  Coverage 없음
   * @status TBC — 출력 포맷 미확정
   */
  wcsGetCoverage(request: WcsGetCoverageRequest): Promise<Buffer>;

  /**
   * WMTS GetCapabilities 응답을 반환한다.
   * 인증: API Key 쿼리 파라미터
   *
   * @status TBC — 타일 캐시 전략 미확정
   */
  wmtsGetCapabilities(): Promise<string>; // XML

  /**
   * WMTS GetTile 타일 이미지를 반환한다.
   * 인증: API Key 쿼리 파라미터
   *
   * @throws TileNotFoundError  타일 없음
   */
  wmtsGetTile(request: WmtsTileRequest): Promise<Buffer>;
}
```

---

## 예외 타입

```typescript
export class LayerNotFoundError extends Error {} // WMS 레이어 없음
export class CoverageNotFoundError extends Error {} // WCS Coverage 없음
export class TileNotFoundError extends Error {} // WMTS 타일 없음
```

---

## 의존 관계

| 의존 대상                  | 호출 목적                       | 정의 위치 |
| -------------------------- | ------------------------------- | --------- |
| GeoServer (또는 MapServer) | OGC 요청 위임                   | —         |
| **CSU-01.01** DB Interface | 레이어·Coverage 메타데이터 조회 | CI-03     |

---

## 미확정 항목

| 우선순위 | 항목                             | 상태 | 해결 조건                     |
| -------- | -------------------------------- | ---- | ----------------------------- |
| P2       | 지원 레이어 목록 및 SLD 스타일   | TBD  | 팀 내부 결정                  |
| P2       | 추가 지원 EPSG 코드              | TBC  | User Service 요구사항 확정 후 |
| P2       | WCS GetCoverage 출력 포맷        | TBC  | 팀 내부 결정                  |
| P2       | OGC 인증 방식 최종 확정          | TBC  | 팀 내부 결정                  |
| P3       | WMTS 타일 캐시 전략              | TBD  | 팀 내부 결정                  |
| P3       | GeoServer vs MapServer 최종 선정 | 확정 | 완료                          |

---

## 관련 문서

- **UI-02** — OGC 표준, 좌표계, 인증 방식 원천 정의 (ICD)
- **CI-03** — CSU-01.01 사용 (ICD)
