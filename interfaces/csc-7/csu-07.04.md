# CSU-07.04 — Task Queue Manager

| 항목                | 내용                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| **CSU ID**          | CSU-07.04                                                                     |
| **소속 CSC**        | CSC-07 Pipeline Orchestrator (PWS)                                            |
| **ICD 버전**        | v1.0 (2026-03-20)                                                             |
| **관련 인터페이스** | SI-04, CI-03                                                                  |
| **발행 큐**         | `sdpe.jobs.csc03` / `sdpe.jobs.csc04` / `sdpe.jobs.csc05` / `sdpe.jobs.csc06` |

---

## 입력 타입

> **ICD 출처:** 6.5절 SI-04 작업 할당 메시지 구조 테이블

```typescript
/**
 * 작업 할당 요청.
 * CSU-07.01(최초 수신), CSU-07.05(재시도/연쇄), CSU-07.09(수동 재처리) 등에서 호출한다.
 */
export interface JobAssignmentRequest {
  /** 작업 고유 식별자 (UUID v4)
   * ICD 6.5절: "job_id — 작업 고유 식별자. SI-03 이벤트와 동일 ID 사용" / 성숙도: 확정 */
  job_id: string;

  /** 작업 대상 CSC 식별자. 예: "CSC-03"
   * ICD 6.5절: "target_csc — 작업 대상 CSC. 예: 'CSC-04'" / 성숙도: 확정 */
  target_csc: string;

  /** 입력 파일 NAS 경로
   * ICD 6.5절: "input_path — 입력 파일 NAS 경로" / 성숙도: 확정 */
  input_path: string;

  /** 처리 프로파일 ID
   * ICD 6.5절: "processing_profile_id — CSC-07.02 Processing Profile Manager가 선택한 프로파일 ID" / 성숙도: 확정 */
  processing_profile_id: string;

  /** 목표 처리 레벨
   * ICD 6.5절: "target_product_level — 목표 처리 레벨. 'LEVEL_0'~'LEVEL_3'" / 성숙도: 확정 */
  target_product_level: 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

  /** 생성해야 할 산출물 유형 목록
   * ICD 6.5절: "target_product_types — 생성해야 할 산출물 유형 목록. 예: ['SLC', 'GRD']" / 성숙도: TBC
   * @status TBC — 허용값 전체 목록 미확정 */
  target_product_types: string[];

  /** 처리 우선순위. 1(최고) ~ 10(최저).
   * ICD 6.5절: "priority — 처리 우선순위. 1(최고) ~ 10(최저). 기본값: TBD" / 성숙도: TBC
   * @status TBC — 기본값 미확정 */
  priority?: number;

  /** 처리 파라미터 오버라이드. 프로파일 기본값 우선. 상세 구조: TBD
   * ICD 6.5절: "processing_params — 처리 파라미터 오버라이드. 상세 구조: TBD" / 성숙도: TBD
   * @status TBD — 허용 오버라이드 항목 미확정 */
  processing_params?: Record<string, unknown>;

  /** 처리 완료 기한 (ISO 8601 UTC). SLA 모니터링에 사용한다.
   * ICD 6.5절: "deadline_utc — 처리 완료 기한. SLA 모니터링에 사용" / 성숙도: TBC
   * @status TBC — 미확정 */
  deadline_utc?: string;

  /** 현재까지 재시도 횟수. 최초 할당 시 0.
   * ICD 6.5절 관련: SI-03 "retry_count — 현재까지 재시도 횟수. 최초 시도는 0" / 성숙도: 확정 */
  retry_count: number;
}

/**
 * SI-04 JOB_ASSIGNED pgmq 메시지 페이로드 (내부 직렬화 타입).
 * assignJob() 호출 시 이 구조로 직렬화하여 큐에 발행한다.
 */
export interface JobAssignedMessage {
  /** ICD 6.5절: "schema_version — 메시지 스키마 버전. 현재 '1.0'" / 성숙도: 확정 */
  schema_version: '1.0';

  /** ICD 6.5절: "job_id" / 성숙도: 확정 */
  job_id: string;

  /** ICD 6.5절: "'JOB_ASSIGNED' 고정값" / 성숙도: 확정 */
  message_type: 'JOB_ASSIGNED';

  /** ICD 6.5절: "target_csc" / 성숙도: 확정 */
  target_csc: string;

  /** ICD 6.5절: "timestamp — 작업 할당 UTC 시각" / 성숙도: 확정 */
  timestamp: string;

  /** ICD 6.5절: "input_path" / 성숙도: 확정 */
  input_path: string;

  /** ICD 6.5절: "processing_profile_id" / 성숙도: 확정 */
  processing_profile_id: string;

  /** ICD 6.5절: "target_product_level" / 성숙도: 확정 */
  target_product_level: string;

  /** ICD 6.5절: "target_product_types" / 성숙도: TBC */
  target_product_types: string[];

  priority?: number;
  processing_params?: Record<string, unknown>;
  deadline_utc?: string;
  retry_count: number;
}
```

---

## CSU 인터페이스

> **ICD 출처:** 3.1절 OPS-01 3~7단계, 3.2절 OPS-02 3단계, 3.3절 OPS-03 2단계, 6.5절 SI-04

| 메서드        | ICD 근거 문장                                                                                                              | 결론                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `assignJob()` | OPS-01 3단계: "CSC-07.04가 sdpe.jobs.csc02에 JOB_ASSIGNED 발행. CSC-02 워커가 메시지 소비 후 처리 시작" (큐명은 이슈 참조) | target_csc에 맞는 전용 큐에 JOB_ASSIGNED 발행 |

```typescript
export interface ITaskQueueManager {
  /**
   * target_csc에 해당하는 전용 pgmq 큐에 JOB_ASSIGNED 메시지를 발행한다.
   * 큐명은 CSU-07.03 getQueueName()으로 결정한다.
   *
   * VT(Visibility Timeout)는 SI-04에 정의된 단계별 값을 적용한다:
   *   - Level-0 (CSC-03): 3,600초
   *   - Level-1 (CSC-04): 9,000초
   *   - Level-2 (CSC-05): 2,700초
   *   - Level-3 (CSC-06): 1,800초
   *
   * ICD 근거:
   *   - OPS-01 3단계 — "CSC-07.04가 [큐명]에 JOB_ASSIGNED 발행"
   *   - OPS-02 3단계 — "CSC-07.04가 동일 job_id로 JOB_ASSIGNED 재발행. retry_count = 1."
   *   - SI-04 — "가시성 제한 시간 (Visibility Timeout) — 500GB/4시간 요건 역산"
   *
   * @throws QueuePublishError  pgmq 발행 실패
   * @throws UnknownCscError    등록되지 않은 target_csc
   */
  assignJob(request: JobAssignmentRequest): Promise<void>;
}
```

---

## 예외 타입

> **ICD 출처:** 6.5절 SI-04

| 예외                | ICD 근거 문장                                                               | 결론                           |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------ |
| `QueuePublishError` | SI-04: "pgmq 큐. CSC별 전용 큐" (발행 실패 가능성)                          | pgmq 발행 실패 시 예외         |
| `UnknownCscError`   | SI-04: "target_csc — 작업 대상 CSC. 예: 'CSC-04'" (미등록 CSC 입력 시 실패) | 미등록 CSC 식별자 입력 시 예외 |

```typescript
export class QueuePublishError extends Error {} // pgmq 발행 실패
export class UnknownCscError extends Error {} // 미등록 CSC 식별자
```

---

## 의존 관계

> **ICD 출처:** 3.1절 OPS-01 3~7단계, 6.5절 SI-04

| 의존 대상     | 호출 목적 | ICD 근거 문장                                                | 결론                | 정의 위치            |
| ------------- | --------- | ------------------------------------------------------------ | ------------------- | -------------------- |
| **CSU-07.03** | 큐명 결정 | SI-04: "전달 매체 — pgmq 큐. CSC별 전용 큐: sdpe.jobs.csc0X" | 큐명 결정 로직 위임 | CSU-07.03 인터페이스 |

> **[이슈] OPS-01 3단계 큐명·CSC 번호 불일치**
>
> v1.0 ICD OPS-01 3단계는 "sdpe.jobs.csc02 큐에 JOB_ASSIGNED 발행. **CSC-02** 워커 소비"로 기재되어 있으나,
> OPS-01 4단계 "**CSC-03**가 Level-0 처리 완료", EI-01 소비자 "CSC-03 Level-0 Processor",
> CI-01 6.1절 제목 "CSC-03 → CSC-04" 등 v1.0 ICD 다수 기재와 충돌한다.
>
> 본 문서는 CSU-07.01과 동일하게 **Level-0 담당 = CSC-03**, **큐명 = `sdpe.jobs.csc03`** 으로 간주한다.
> ICD 담당자의 OPS-01 3단계 큐명·CSC 번호 확인이 필요하다.

---

## 미확정 항목

> **ICD 출처:** 8.3절, 8.6절

| 우선순위 | 항목                               | 상태 | ICD 근거 문장                                                                     | 결론                                     | 해결 조건        |
| -------- | ---------------------------------- | ---- | --------------------------------------------------------------------------------- | ---------------------------------------- | ---------------- |
| P1       | 처리 CSC 식별자 및 큐명 최종 확정  | 이슈 | OPS-01 3단계 vs OPS-01 4단계·EI-01 불일치 — 의존 관계 이슈 참조                   | 큐명 확정 전 assignJob() 구현 불가       | ICD 담당자 확인  |
| P2       | `priority` 기본값 및 우선순위 체계 | TBC  | 8.3절: "처리 우선순위 체계 및 기본값 — OPS-02/03 시나리오 기반으로 결정 필요"     | 기본값 확정 전 priority 적용 불가        | 팀 내부 결정     |
| P2       | `target_product_types` 허용값      | TBC  | 8.3절: "output_product_type 허용값 목록 — 파일명 규칙 PRODUCT_TYPE과 일관성 필요" | 목록 확정 전 유효성 검증 불가            | 팀 내부 결정     |
| P2       | `processing_params` 허용 구조      | TBD  | 8.3절: "processing_params 오버라이드 허용 목록 — FI 함수 시그니처 확정 후 협의"   | FI 함수 확정 전 파라미터 구조 정의 불가  | FI-01~06 확정 후 |
| P2       | `deadline_utc` 산출 방식           | TBC  | SI-04: "deadline_utc — 처리 완료 기한. SLA 모니터링에 사용" / 성숙도: TBC         | 산출 기준 확정 전 deadline_utc 설정 불가 | 팀 내부 결정     |

---

## 관련 문서

- **SI-04** — 발행 메시지 구조 및 Visibility Timeout 정의 (ICD 6.5절)
- **CSU-07.03** — 큐명 결정 (`getQueueName()`)
- **CSU-07.01** — 최초 assignJob() 호출 (수신 이벤트 처리)
- **CSU-07.05** — 재시도 assignJob() 호출 (실패 이벤트 처리)
