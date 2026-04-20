# CSC-01 인터페이스 타입 정의

> ICD v1.0 (2026-03-20) 기준. **ICD에서 "확정"으로 표기된 필드만** 타입을 정의합니다.
> TBC/TBD 필드는 외부 협의 또는 타 CSC의 결정에 의존하므로, 결정 주체와 함께 별도 표기합니다.

---

## 1. CI-03 — 공통 인프라 서비스

CSC-01이 **제공자**입니다. 모든 CSC가 소비자입니다.
네트워크 호출 없이 TypeScript 모듈 import로 동작합니다.

### 1.1 CSU-01.01 DB Interface

```typescript
/**
 * CI-03 DB Interface (ICD 6.11)
 * - 모든 CSC는 직접 DB 접근이 금지되며, 반드시 DbRepository를 경유해야 합니다.
 * - 스키마 소유자: CSC-01
 * - 패키지명: @sdpe/common (TBC)
 */
interface DbRepository {
  executeQuery(query: string, params?: unknown[]): Promise<unknown[]>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  findById(table: string, id: string): Promise<unknown | null>;
  save(table: string, entity: Record<string, unknown>): Promise<void>;
}

// ── TBD — 상세 설계 착수 시 확정 ──
// - 제네릭 타입 파라미터 구조
// - 트랜잭션 관리 패턴 (Unit of Work vs Repository per Entity)
// - 커넥션 풀 설정
// - 에러 타입 (DbError 계층)
```

### 1.2 CSU-01.02 Geo Data Manager

```typescript
/**
 * CI-03 Geo Data Manager (ICD 6.11)
 * - 지리 데이터 변환, 파싱, 공간 연산 기능을 제공합니다.
 */
interface GeoDataManager {
  convertCrs(geometry: string, fromEpsg: number, toEpsg: number): string;
  parseGeoJson(geojson: string): unknown;
  parseWkt(wkt: string): unknown;
  intersects(geomA: string, geomB: string): boolean;
  buffer(geometry: string, distanceM: number): string;
  toGeoJson(geometry: unknown): string;
}

// ── TBD — 상세 설계 착수 시 확정 ──
// - 반환 타입 구체화 (GeoJSON Feature vs Geometry)
// - 지원 EPSG 코드 목록
// - 좌표 정밀도 요건
```

### 1.3 CSU-01.03 NAS Manager

```typescript
/**
 * CI-03 NAS Manager (ICD 6.11)
 * - NAS 공유 스토리지 파일 입출력을 캡슐화합니다.
 * - 모든 CSC는 NAS 직접 접근 대신 NasManager를 사용합니다.
 */
interface NasManager {
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, data: Buffer): Promise<void>;
  moveFile(src: string, dest: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  getChecksum(path: string, algorithm?: 'sha256'): Promise<string>;
  buildPath(params: NasPathParams): string;
}

interface NasPathParams {
  satelliteId: string;
  productLevel: string;            // 'L0' | 'L1' | 'L2' | 'L3'
  productType?: string;            // 'RAW', 'SLC', 'GRD', ...
  date?: string;                   // YYYYMMDD
  fileName?: string;
}

// ── TBD — satellite_id 형식 확정 후 결정 가능 ──
// - buildPath() 경로 생성 규칙 전체 정의
// - NAS 루트 경로 설정
// - 동시 접근 제어 방식 (파일 잠금 등)
```

---

## 2. 미확정 필드 결정 주체 정리

| 필드 | 인터페이스 | 결정 주체 | 사유 |
|------|-----------|-----------|------|
| `@sdpe/common` 패키지명 | CI-03 | **내부 팀** | npm 패키지 명명 규칙 및 버전 관리 전략 |
| 메서드 상세 시그니처 | CI-03 전체 | **CSC-01 담당자** | 각 CSU 상세 설계 착수 시 확정 |
| `buildPath()` 규칙 | CI-03 NAS | **위성팀 + CSC-01** | satellite_id 형식 확정 후 경로 규칙 설계 가능 |
| 트랜잭션 관리 패턴 | CI-03 DB | **CSC-01 담당자** | 내부 설계 결정 |
| 오류 타입 전체 정의 | CI-03 전체 | **CSC-01 담당자** | 내부 설계 결정 |

### 결정 순서 의존 관계

```
위성팀 확정 (satellite_id)
  → NAS buildPath() 경로 규칙 확정
  → 파일 명명 규칙 코드 확정

CSC-01 상세 설계 착수
  → 각 메서드 시그니처 확정
  → 트랜잭션 패턴 확정
  → 오류 타입 확정
```
