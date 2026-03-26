# CSU-07.03 — DAG Generator

| 항목                | 내용                               |
| ------------------- | ---------------------------------- |
| **CSU ID**          | CSU-07.03                          |
| **소속 CSC**        | CSC-07 Pipeline Orchestrator (PWS) |
| **ICD 버전**        | v1.0 (2026-03-20)                  |
| **관련 인터페이스** | SI-04, CI-03                       |

---

## 입력 타입

> **ICD 출처:** 3.3절 OPS-03 2단계, 6.5절 SI-04 작업 할당 메시지 구조 테이블

```typescript
/**
 * DAG 생성 입력.
 * target_level이 지정된 경우 해당 레벨부터만 실행 단계를 생성한다 (이전 단계 건너뜀).
 */
export interface DagGenerationInput {
  /** 작업 고유 식별자 (UUID v4)
   * ICD 6.5절: "job_id — 작업 고유 식별자. SI-03 이벤트와 동일 ID 사용" / 성숙도: 확정 */
  job_id: string;

  /** 처리 시작 레벨. 이 레벨부터 파이프라인을 실행한다.
   * ICD 3.3절: "target_level 파라미터로 시작 레벨 지정. 예: target_level = 'LEVEL_2'" / 성숙도: 확정 */
  target_level: 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

  /** 처리 프로파일 ID
   * ICD 6.5절: "processing_profile_id — CSC-07.02 Processing Profile Manager가 선택한 프로파일 ID" / 성숙도: 확정 */
  processing_profile_id: string;
}

/**
 * DAG 내 단일 처리 단계.
 */
export interface DagStep {
  /** 실행 순서 (1부터 시작) */
  step_order: number;

  /** 이 단계를 처리하는 CSC 식별자. 예: "CSC-03", "CSC-04"
   * ICD 6.5절: "target_csc — 작업 대상 CSC. 예: 'CSC-04'" / 성숙도: 확정 */
  target_csc: string;

  /** 이 단계의 목표 처리 레벨
   * ICD 6.5절: "target_product_level — 목표 처리 레벨. 'LEVEL_0'~'LEVEL_3'" / 성숙도: 확정 */
  target_product_level: string;

  /** 이 단계에서 생성해야 할 산출물 유형 목록
   * ICD 6.5절: "target_product_types — 생성해야 할 산출물 유형 목록. 예: ['SLC', 'GRD']" / 성숙도: TBC
   * @status TBC — 허용값 전체 목록 미확정 */
  target_product_types: string[];

  /** 작업 할당 대상 pgmq 큐명
   * ICD 6.5절: "전달 매체 — pgmq 큐. CSC별 전용 큐: sdpe.jobs.csc02 / .csc03 / .csc04 / .csc05" / 성숙도: 확정
   * @status 주의 — 큐명 목록의 불일치는 의존 관계 이슈 참조 */
  queue_name: string;
}

/**
 * 생성된 처리 DAG.
 * steps는 실행 순서대로 정렬되며, target_level 이전 단계는 포함되지 않는다.
 */
export interface ProcessingDag {
  /** 작업 고유 식별자 */
  job_id: string;

  /** 실행할 처리 단계 목록 (step_order 오름차순 정렬) */
  steps: DagStep[];
}
```

---

## CSU 인터페이스

> **ICD 출처:** 3.3절 OPS-03 2단계, 6.5절 SI-04

| 메서드           | ICD 근거 문장                                                                           | 결론                                        |
| ---------------- | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| `generateDag()`  | OPS-03 2단계: "CSC-07.03이 target_level 기반 DAG 생성 (이전 단계 건너뜀)"               | target_level 기준 실행 단계 목록 생성       |
| `getQueueName()` | SI-04: "전달 매체 — pgmq 큐. CSC별 전용 큐: sdpe.jobs.csc02 / .csc03 / .csc04 / .csc05" | CSC 식별자로 전용 큐명 반환 (내부 유틸리티) |

```typescript
export interface IDagGenerator {
  /**
   * target_level을 시작점으로 하는 처리 DAG를 생성한다.
   * target_level 이전 단계는 건너뛰고 해당 레벨부터 LEVEL_3까지의 단계를 반환한다.
   * 정상 처리(OPS-01)의 경우 target_level = 'LEVEL_0'으로 호출하여 전체 파이프라인을 생성한다.
   * 부분 재처리(OPS-03)의 경우 target_level = 'LEVEL_2' 등으로 호출하여 해당 레벨부터 실행한다.
   *
   * ICD 근거: OPS-03 2단계 — "CSC-07.03이 target_level 기반 Directed Acyclic Graph (DAG) 생성
   * (이전 단계 건너뜀). 해당 CSC 전용 큐에 작업 할당"
   *
   * @throws InvalidTargetLevelError  target_level 값이 허용 범위를 벗어남
   * @throws ProfileNotFoundError     processing_profile_id에 해당하는 프로파일 없음
   */
  generateDag(input: DagGenerationInput): ProcessingDag;

  /**
   * CSC 식별자에 대응하는 pgmq 큐명을 반환한다.
   * CSU-07.04가 메시지를 발행할 큐를 결정할 때 사용하는 내부 유틸리티이다.
   *
   * ICD 근거: SI-04 — "전달 매체 — pgmq 큐. CSC별 전용 큐: sdpe.jobs.csc02 / .csc03 / .csc04 / .csc05"
   *
   * @throws UnknownCscError  등록되지 않은 CSC 식별자
   */
  getQueueName(targetCsc: string): string;
}
```

---

## 예외 타입

> **ICD 출처:** 3.3절 OPS-03 2단계

| 예외                      | ICD 근거 문장                                                                              | 결론                           |
| ------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------ |
| `InvalidTargetLevelError` | OPS-03 2단계: "target_level 파라미터로 시작 레벨 지정"                                     | 허용 범위 외 레벨 입력 시 예외 |
| `ProfileNotFoundError`    | SI-04: "processing_profile_id — CSC-07.02 Processing Profile Manager가 선택한 프로파일 ID" | 프로파일 미존재 시 예외        |
| `UnknownCscError`         | SI-04: "CSC별 전용 큐" (등록된 CSC 외 입력 시 실패)                                        | 미등록 CSC 식별자 입력 시 예외 |

```typescript
export class InvalidTargetLevelError extends Error {} // 허용 범위 외 target_level
export class ProfileNotFoundError extends Error {} // 프로파일 미존재
export class UnknownCscError extends Error {} // 미등록 CSC 식별자
```

---

## 의존 관계

> **ICD 출처:** 3.3절 OPS-03 2단계

| 의존 대상     | 호출 목적                                          | ICD 근거 문장                                                                              | 결론                                 | 정의 위치            |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------ | -------------------- |
| **CSU-07.02** | 프로파일 내용 로드 (파이프라인 단계 파라미터 결정) | SI-04: "processing_profile_id — CSC-07.02 Processing Profile Manager가 선택한 프로파일 ID" | 프로파일에서 단계별 산출물 유형 결정 | CSU-07.02 인터페이스 |

> **[이슈] SI-04 전달 매체의 큐명 목록 불일치**
>
> v1.0 ICD 내에 다음 두 가지 기재가 충돌한다.
>
> | 출처                    | 큐명 목록                                      |
> | ----------------------- | ---------------------------------------------- |
> | SI-04 전달 매체 (6.5절) | `sdpe.jobs.csc02 / .csc03 / .csc04 / .csc05`   |
> | SI-04 VT 테이블 (6.5절) | CSC-02(L0), CSC-04(L1), CSC-05(L2), CSC-06(L3) |
>
> 전달 매체 기재는 `.csc02 ~ .csc05` 4개이지만, VT 테이블은 CSC-02/04/05/06를 처리 CSC로 명시한다.
> OPS-01 4단계 "CSC-03가 Level-0 처리 완료" 및 EI-01 소비자 "CSC-03 Level-0 Processor"와 결합하면,
> 올바른 큐명은 `sdpe.jobs.csc03 / .csc04 / .csc05 / .csc06`일 가능성이 높다.
>
> **본 문서는 OPS-01 단계 기술 및 EI-01 소비자 기준으로 Level-0 담당을 CSC-03으로 간주한다.
> `getQueueName()` 구현 전 ICD 담당자의 최종 큐명 확인이 필요하다.**

---

## 미확정 항목

> **ICD 출처:** 8.3절, 8.6절

| 우선순위 | 항목                                      | 상태 | ICD 근거 문장                                                                                      | 결론                                               | 해결 조건                    |
| -------- | ----------------------------------------- | ---- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------- |
| P1       | 처리 CSC 식별자 및 큐명 최종 확정         | 이슈 | SI-04 전달 매체 vs VT 테이블 불일치 — 의존 관계 이슈 참조                                          | 큐명 확정 전 `getQueueName()` 구현 불가            | ICD 담당자 확인              |
| P2       | `target_product_types` 허용값 목록        | TBC  | 8.3절: "output_product_type 허용값 목록 — SLC/GRD/GEC/MAP/MSK/OBJ/CHG 등 전체 코드 목록 확정 필요" | 코드 목록 확정 전 DagStep 생성 로직 완전 구현 불가 | 팀 내부 결정                 |
| P2       | 프로파일에서 단계별 산출물 유형 결정 방식 | TBD  | ICD 미기재 — 팀 내부 구현 결정 사항                                                                | 프로파일 구조(CSU-07.02 parameters) 확정 전 불가   | CSU-07.02 parameters 확정 후 |

---

## 관련 문서

- **SI-04** — DAG 각 단계가 발행하는 작업 할당 이벤트 정의 (ICD 6.5절)
- **CSU-07.02** — 처리 프로파일 로드 (단계별 산출물 유형 결정)
- **CSU-07.04** — DAG 각 단계를 순서대로 큐에 발행하는 CSU
