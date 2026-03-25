# CSU-07.03 — Workflow DAG Manager

| 항목                | 내용                               |
| ------------------- | ---------------------------------- |
| **CSU ID**          | CSU-07.03                          |
| **소속 CSC**        | CSC-07 Pipeline Orchestrator (PWS) |
| **ICD 버전**        | v1.0 (2026-03-20)                  |
| **관련 인터페이스** | SI-04, CI-03                       |

---

## 타입 정의

```typescript
export type ProductLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

export interface JobDag {
  /** 작업 고유 식별자 (UUID v4) */
  job_id: string;

  /** DAG 실행 순서대로 정렬된 처리 단계 목록. target_level 이전 단계는 포함하지 않는다. */
  steps: DagStep[];
}

export interface DagStep {
  /** 처리 대상 CSC. 예: "CSC-03" */
  target_csc: string;

  /** 이 단계의 목표 처리 레벨 */
  product_level: ProductLevel;

  /**
   * 생성해야 할 산출물 유형 목록
   * @status TBC — 허용값 미확정
   */
  product_types: string[];

  /** 입력 파일 NAS 경로. 이전 단계 output_path 또는 기존 제품 경로 */
  input_path: string;
}
```

---

## CSU 인터페이스

```typescript
export interface IWorkflowDagManager {
  /**
   * 정상 처리(OPS-01) DAG를 생성한다. LEVEL_0부터 전체 단계를 포함한다.
   *
   * @param jobId     CSC-07이 부여한 작업 식별자
   * @param profile   CSU-07.02가 선택한 처리 프로파일
   */
  createFullDag(jobId: string, profile: ProcessingProfile): Promise<JobDag>;

  /**
   * 부분 재처리(OPS-03) DAG를 생성한다. targetLevel부터 이후 단계만 포함한다.
   *
   * @param jobId       CSC-07이 부여한 작업 식별자
   * @param targetLevel 재처리 시작 레벨
   * @param inputPath   재처리 시작 레벨의 입력 파일 NAS 경로
   * @param profile     CSU-07.02가 선택한 처리 프로파일
   */
  createPartialDag(
    jobId: string,
    targetLevel: ProductLevel,
    inputPath: string,
    profile: ProcessingProfile,
  ): Promise<JobDag>;
}
```

---

## 의존 관계

| 의존 대상                  | 호출 목적                         | 정의 위치            |
| -------------------------- | --------------------------------- | -------------------- |
| **CSU-07.02**              | 처리 프로파일 참조                | CSU-07.02 인터페이스 |
| **CSU-01.01** DB Interface | 기존 제품 경로 조회 (부분 재처리) | CI-03                |

---

## 미확정 항목

| 우선순위 | 항목                             | 상태 | 해결 조건                           |
| -------- | -------------------------------- | ---- | ----------------------------------- |
| P2       | `product_types` 허용값 전체 목록 | TBC  | SI-04 허용값 확정 후                |
| P2       | 부분 재처리 시 버전 관리 방식    | TBD  | CSU-08.05 Product Lifecycle 설계 후 |

---

## 관련 문서

- **SI-04** — DAG 각 단계가 생성하는 작업 할당 이벤트 (ICD)
- **CI-03** — CSU-01.01 사용 (ICD)
