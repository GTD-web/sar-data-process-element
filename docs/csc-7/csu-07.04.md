# CSU-07.04 — Task Queue Manager

| 항목                | 내용                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| **CSU ID**          | CSU-07.04                                                                     |
| **소속 CSC**        | CSC-07 Pipeline Orchestrator (PWS)                                            |
| **ICD 버전**        | v1.0 (2026-03-20)                                                             |
| **관련 인터페이스** | SI-04, CI-03                                                                  |
| **발행 큐**         | `sdpe.jobs.csc03` / `sdpe.jobs.csc04` / `sdpe.jobs.csc05` / `sdpe.jobs.csc06` |

---

## 타입 정의

```typescript
export type ProductLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

export interface JobAssignedMessage {
  /** 메시지 스키마 버전. 현재 "1.0" */
  schema_version: '1.0';

  /** 작업 고유 식별자 (UUID v4). SI-03 이벤트와 동일 ID 사용 */
  job_id: string;

  /** 메시지 타입. 고정값 */
  message_type: 'JOB_ASSIGNED';

  /** 작업 대상 CSC. 예: "CSC-03" */
  target_csc: string;

  /**
   * 처리 우선순위. 1(최고) ~ 10(최저)
   * @status TBC — 기본값 미확정
   */
  priority: number;

  /** 작업 할당 UTC 시각 (ISO 8601) */
  timestamp: string;

  /** 입력 파일 NAS 경로 */
  input_path: string;

  /** CSU-07.02가 선택한 처리 프로파일 ID (UUID v4) */
  processing_profile_id: string;

  /** 목표 처리 레벨 */
  target_product_level: ProductLevel;

  /**
   * 생성해야 할 산출물 유형 목록
   * @status TBC — 허용값 미확정 (예: ["SLC", "GRD"])
   */
  target_product_types: string[];

  /**
   * 처리 파라미터 오버라이드. 프로파일 기본값 우선
   * @status TBD — 허용 오버라이드 항목 미확정
   */
  processing_params?: Record<string, unknown>;

  /**
   * 처리 완료 기한 (ISO 8601). SLA 모니터링에 사용
   * @status TBC
   */
  deadline_utc?: string;
}
```

가시성 제한 시간(Visibility Timeout)은 SI-04 정의 기준을 따른다.

| 대상 CSC | 큐명              | Visibility Timeout |
| -------- | ----------------- | ------------------ |
| CSC-03   | `sdpe.jobs.csc03` | 3,600초            |
| CSC-04   | `sdpe.jobs.csc04` | 9,000초            |
| CSC-05   | `sdpe.jobs.csc05` | 2,700초            |
| CSC-06   | `sdpe.jobs.csc06` | 1,800초            |

---

## CSU 인터페이스

```typescript
export interface ITaskQueueManager {
  /**
   * 대상 CSC 전용 큐에 JOB_ASSIGNED 메시지를 발행한다.
   * schema_version, message_type, timestamp는 내부에서 자동 설정한다.
   *
   * @throws QueuePublishError  큐 발행 실패
   */
  assignJob(message: Omit<JobAssignedMessage, 'schema_version' | 'message_type' | 'timestamp'>): Promise<void>;
}
```

---

## 예외 타입

```typescript
export class QueuePublishError extends Error {} // 큐 발행 실패
```

---

## 의존 관계

| 의존 대상 | 호출 목적      | 정의 위치 |
| --------- | -------------- | --------- |
| pgmq      | 큐 메시지 발행 | —         |

---

## 미확정 항목

| 우선순위 | 항목                                     | 상태 | 해결 조건                            |
| -------- | ---------------------------------------- | ---- | ------------------------------------ |
| P2       | `priority` 기본값 및 긴급 재처리 정책    | TBC  | OPS-02/03 시나리오 기반 팀 내부 결정 |
| P2       | `target_product_types` 허용값 목록       | TBC  | SI-04 허용값 확정 후                 |
| P2       | `processing_params` 허용 오버라이드 목록 | TBD  | FI 시그니처 전체 확정 후             |
| P2       | `deadline_utc` 산정 방식                 | TBC  | 팀 내부 결정                         |

---

## 관련 문서

- **SI-04** — 작업 할당 이벤트 원천 정의 (ICD)
