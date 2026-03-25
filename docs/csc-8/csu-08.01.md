# CSU-08.01 — Registration Event Listener

| 항목                | 내용                                   |
| ------------------- | -------------------------------------- |
| **CSU ID**          | CSU-08.01                              |
| **소속 CSC**        | CSC-08 Product & Catalog Manager (PPS) |
| **ICD 버전**        | v1.0 (2026-03-20)                      |
| **관련 인터페이스** | SI-05, CI-03                           |
| **구독 큐**         | `sdpe.catalog.registration`            |

---

## 입력 타입

```typescript
export type ProductLevel = 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

export interface RegistrationTriggerMessage {
  /**
   * 메시지 스키마 버전. 현재 "1.0"
   * @status TBC
   */
  schema_version: '1.0';

  /**
   * 등록 요청 고유 ID (UUID v4)
   * @status TBC
   */
  registration_id: string;

  /** 원본 처리 작업 ID (UUID v4). SI-04 job_id와 동일 */
  job_id: string;

  /** 등록 대상 제품 레벨. Level-0은 수신하지 않는다. */
  product_level: ProductLevel;

  /**
   * 산출물 유형. 예: "GRD", "SLC"
   * @status TBC — 허용값 미확정
   */
  product_type: string;

  /** NAS 제품 파일 경로 */
  product_path: string;

  /**
   * 위성 식별자
   * @status TBC — 형식 미확정
   */
  satellite_id: string;

  /** 촬영 시작 UTC 시각 (ISO 8601) */
  acquisition_start: string;

  /** 촬영 종료 UTC 시각 (ISO 8601) */
  acquisition_end: string;

  /**
   * 제품 공간 범위 (WKT POLYGON 형식)
   * @status TBC — 정밀도 및 좌표계 미확정
   */
  footprint_wkt: string;

  /**
   * 품질 검증 실행 여부. true 시 CSU-08.02 자동 실행
   * @status TBC
   */
  quality_run: boolean;
}
```

---

## CSU 인터페이스

```typescript
export interface IRegistrationEventListener {
  /**
   * 폴링을 시작한다. onModuleInit()에서 호출한다.
   */
  startPolling(): void;

  /**
   * sdpe.catalog.registration 큐에서 메시지를 1건 읽어 처리한다.
   * 정상 처리 시 큐에서 삭제한다(pgmq.delete).
   * 실패 시 삭제하지 않아 visibility timeout 후 자동으로 재노출된다.
   */
  poll(): Promise<void>;

  /**
   * 등록 트리거 메시지를 처리한다.
   * 중복 메시지(registration_id 기준)는 무시하고 정상 반환한다.
   * quality_run === true이면 CSU-08.02 품질 검증을 실행한다.
   *
   * @throws DbError  등록 레코드 저장 실패
   * @throws QualityValidationError  품질 검증 실패
   */
  onRegistrationTriggered(message: RegistrationTriggerMessage): Promise<void>;
}
```

---

## 예외 타입

```typescript
export class DbError extends Error {} // 등록 레코드 저장 실패
export class QualityValidationError extends Error {} // 품질 검증 실패
```

---

## 의존 관계

| 의존 대상                  | 호출 목적                                    | 정의 위치            |
| -------------------------- | -------------------------------------------- | -------------------- |
| **CSU-08.02**              | quality_run === true 시 품질 검증 실행       | CSU-08.02 인터페이스 |
| **CSU-08.03**              | STAC 카탈로그 등록                           | CSU-08.03 인터페이스 |
| **CSU-08.04**              | 공간 인덱스 갱신                             | CSU-08.04 인터페이스 |
| **CSU-08.05**              | 재처리(OPS-03) 시 기존 제품 버전 관리        | CSU-08.05 인터페이스 |
| **CSU-01.01** DB Interface | 등록 레코드 생성 / registration_id 중복 확인 | CI-03                |

---

## 미확정 항목

| 우선순위 | 항목                                    | 상태 | 해결 조건            |
| -------- | --------------------------------------- | ---- | -------------------- |
| P2       | `product_type` 허용값 전체 목록         | TBC  | SI-05 허용값 확정 후 |
| P2       | `footprint_wkt` 정밀도 및 좌표계        | TBC  | 팀 내부 결정         |
| P2       | `quality_run` 자동 실행 조건            | TBC  | 팀 내부 결정         |
| P2       | 등록 실패 시 재시도 정책                | TBD  | 팀 내부 결정         |
| P2       | pgmq 재시도 상한 (`max_delivery_count`) | TBD  | 팀 내부 결정         |

---

## 관련 문서

- **SI-05** — 입력 이벤트 원천 정의 (ICD)
- **CI-03** — CSU-01.01 사용 (ICD)
