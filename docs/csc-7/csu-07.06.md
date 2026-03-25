# CSU-07.06 — Audit Log Collector

| 항목                | 내용                               |
| ------------------- | ---------------------------------- |
| **CSU ID**          | CSU-07.06                          |
| **소속 CSC**        | CSC-07 Pipeline Orchestrator (PWS) |
| **ICD 버전**        | v1.0 (2026-03-20)                  |
| **관련 인터페이스** | SI-05, CI-03                       |
| **발행 큐**         | `sdpe.catalog.registration`        |

---

## 타입 정의

```typescript
export type ProductLevel = 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

/** SI-05: 제품 등록 트리거 메시지 */
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

  /** 등록 대상 제품 레벨. Level-0은 발행하지 않는다. */
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
   * 품질 검증 실행 여부. true 시 CSC-08 자동 실행
   * @status TBC
   */
  quality_run: boolean;
}

/** 감사 로그 항목 */
export interface AuditLogEntry {
  /**
   * 로그 이벤트 타입
   * @status TBD — 전체 타입 목록 미확정
   */
  type: string;

  /** 관련 작업 ID. 작업과 무관한 이벤트는 없을 수 있다. */
  job_id?: string;

  /** 로그 기록 UTC 시각 (ISO 8601) */
  timestamp: string;

  /** 이벤트 상세 데이터 */
  detail?: unknown;
}
```

---

## CSU 인터페이스

```typescript
export interface IAuditLogCollector {
  /**
   * 감사 로그를 기록한다.
   */
  log(entry: AuditLogEntry): Promise<void>;

  /**
   * Level-1 이상 제품 처리 완료 시 sdpe.catalog.registration 큐에
   * 등록 트리거를 발행한다. Level-0은 발행하지 않는다.
   *
   * @throws QueuePublishError  큐 발행 실패
   */
  publishRegistrationTrigger(message: RegistrationTriggerMessage): Promise<void>;
}
```

---

## 예외 타입

```typescript
export class QueuePublishError extends Error {} // 큐 발행 실패
```

---

## 의존 관계

| 의존 대상                  | 호출 목적               | 정의 위치 |
| -------------------------- | ----------------------- | --------- |
| **CSU-01.01** DB Interface | 감사 로그 저장          | CI-03     |
| pgmq                       | 등록 트리거 메시지 발행 | —         |

---

## 미확정 항목

| 우선순위 | 항목                                           | 상태 | 해결 조건             |
| -------- | ---------------------------------------------- | ---- | --------------------- |
| P2       | 등록 트리거 발행 주체 (CSU-07.05 vs CSU-07.06) | TBC  | 팀 내부 설계 결정     |
| P2       | `product_type` 허용값 전체 목록                | TBC  | SI-05 허용값 확정 후  |
| P2       | `footprint_wkt` 정밀도 및 좌표계               | TBC  | 팀 내부 결정          |
| P2       | `quality_run` 자동 실행 조건                   | TBC  | 팀 내부 결정          |
| P2       | `AuditLogEntry.type` 전체 목록                 | TBD  | 각 CSU 담당자 취합 후 |
| P2       | 등록 실패 시 재시도 정책                       | TBD  | 팀 내부 결정          |

---

## 관련 문서

- **SI-05** — 제품 등록 트리거 원천 정의 (ICD)
- **CI-03** — CSU-01.01 사용 (ICD)
