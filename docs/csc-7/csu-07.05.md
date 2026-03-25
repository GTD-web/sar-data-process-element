# CSU-07.05 — Processing Monitor

| 항목                | 내용                               |
| ------------------- | ---------------------------------- |
| **CSU ID**          | CSU-07.05                          |
| **소속 CSC**        | CSC-07 Pipeline Orchestrator (PWS) |
| **ICD 버전**        | v1.0 (2026-03-20)                  |
| **관련 인터페이스** | SI-03, SI-04, CI-03                |
| **구독 큐**         | `sdpe.processing.events`           |

---

## 입력 타입

```typescript
export type ProductLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

export interface ProcessingEvent {
  /** 메시지 스키마 버전. 현재 "1.0" */
  schema_version: '1.0';

  /** CSC-07이 부여한 작업 고유 식별자 (UUID v4) */
  job_id: string;

  /** 이벤트 타입 */
  event_type: 'PROCESSING_COMPLETED' | 'PROCESSING_FAILED';

  /** 이벤트 발행 CSC. 예: "CSC-03", "CSC-04" */
  source_csc: string;

  /** 처리 완료 레벨 */
  product_level: ProductLevel;

  /** 이벤트 발생 UTC 시각 (ISO 8601) */
  timestamp: string;

  /** 입력 파일 NAS 경로 */
  input_path: string;

  /** 처리 결과 NAS 경로. COMPLETED 시 필수, FAILED 시 null */
  output_path: string | null;

  /**
   * 산출물 유형. COMPLETED 시 필수
   * @status TBC — 허용값 미확정 (예: "SLC", "GRD")
   */
  output_product_type?: string;

  /**
   * 처리 소요 시간 (밀리초)
   * @status TBC
   */
  processing_duration_ms: number;

  /**
   * 실패 시 오류 코드
   * @status TBD — 오류 코드 체계 미확정
   */
  error_code?: string;

  /**
   * 실패 시 오류 메시지
   * @status TBC
   */
  error_message?: string;

  /**
   * 현재까지 재시도 횟수. 최초 시도는 0. 최대값 3.
   * retry_count === 3 도달 시 CSU-07.07이 운영자 Alert 발행
   */
  retry_count: number;
}
```

---

## CSU 인터페이스

```typescript
export interface IProcessingMonitor {
  /**
   * 폴링을 시작한다. onModuleInit()에서 호출한다.
   */
  startPolling(): void;

  /**
   * sdpe.processing.events 큐에서 메시지를 1건 읽어 처리한다.
   */
  poll(): Promise<void>;

  /**
   * PROCESSING_COMPLETED 이벤트를 처리한다.
   * DAG 다음 단계 CSC에 작업을 할당하거나, 마지막 단계인 경우 등록 트리거를 발행한다.
   *
   * @throws DbError  job 상태 갱신 실패
   */
  onProcessingCompleted(event: ProcessingEvent): Promise<void>;

  /**
   * PROCESSING_FAILED 이벤트를 처리한다.
   * retry_count < 3이면 CSU-07.04를 통해 동일 job을 재할당한다.
   * retry_count === 3이면 job status를 FAILED로 갱신하고 CSU-07.07에 Alert을 요청한다.
   *
   * @throws DbError  job 상태 갱신 실패
   */
  onProcessingFailed(event: ProcessingEvent): Promise<void>;
}
```

---

## 예외 타입

```typescript
export class DbError extends Error {} // job 상태 갱신 실패
```

---

## 의존 관계

| 의존 대상                  | 호출 목적                            | 정의 위치            |
| -------------------------- | ------------------------------------ | -------------------- |
| **CSU-07.04**              | 다음 단계 작업 할당 / 실패 시 재할당 | CSU-07.04 인터페이스 |
| **CSU-07.06**              | 처리 완료·실패 감사 로그 기록        | CSU-07.06 인터페이스 |
| **CSU-07.07**              | retry_count === 3 도달 시 Alert 요청 | CSU-07.07 인터페이스 |
| **CSU-01.01** DB Interface | job 상태 갱신                        | CI-03                |

---

## 미확정 항목

| 우선순위 | 항목                                   | 상태 | 해결 조건                |
| -------- | -------------------------------------- | ---- | ------------------------ |
| P2       | `output_product_type` 허용값 목록      | TBC  | SI-03 허용값 확정 후     |
| P2       | `error_code` 체계 전체 목록            | TBD  | 각 CSC 오류 유형 취합 후 |
| P2       | 재시도 간격 정책 (즉시 vs 지수 백오프) | TBC  | 팀 내부 결정             |
| P2       | 이벤트 보존 기간 정책                  | TBD  | 팀 내부 결정             |

---

## 관련 문서

- **SI-03** — 입력 이벤트 원천 정의 (ICD)
- **SI-04** — CSU-07.04가 발행하는 작업 할당 이벤트 (ICD)
- **CI-03** — CSU-01.01 사용 (ICD)
