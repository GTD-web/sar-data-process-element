# CSU-09.04 — Operator Console API

| 항목                | 내용                           |
| ------------------- | ------------------------------ |
| **CSU ID**          | CSU-09.04                      |
| **소속 CSC**        | CSC-09 Data API Provider (DSS) |
| **ICD 버전**        | v1.0 (2026-03-20)              |
| **관련 인터페이스** | UI-03, SI-06, CI-03            |

---

## 타입 정의

```typescript
export type ProductLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

/**
 * 운영자 콘솔 응답 구조
 * @status TBC — 전체 스키마 미확정
 */

/** 파이프라인 현황 조회 응답 */
export interface PipelineStatusResponse {
  /**
   * 진행 중인 job 목록
   * @status TBC
   */
  active_jobs: JobSummary[];

  /**
   * 실패한 job 목록
   * @status TBC
   */
  failed_jobs: JobSummary[];
}

export interface JobSummary {
  /** job 고유 식별자 (UUID v4) */
  job_id: string;

  /**
   * job 상태
   * @status TBD — 허용값 미확정
   */
  status: string;

  /** 현재 처리 레벨 */
  current_level?: ProductLevel;

  /** 재시도 횟수 */
  retry_count: number;

  /** job 생성 UTC 시각 (ISO 8601) */
  created_at: string;
}

/** 수동 재처리 요청 바디 */
export interface ReprocessingRequest {
  /** 재처리 대상 job_id */
  job_id: string;

  /**
   * 재처리 시작 레벨. 미지정 시 전체 재처리
   * @status TBC
   */
  target_level?: ProductLevel;
}
```

---

## CSU 인터페이스

```typescript
export interface IOperatorConsoleApi {
  /**
   * 파이프라인 전체 현황을 조회한다.
   * Electron 앱의 대시보드에서 사용한다.
   *
   * @status TBC — 응답 스키마 미확정
   */
  getPipelineStatus(): Promise<PipelineStatusResponse>;

  /**
   * 특정 job의 상세 정보 및 처리 이력을 조회한다.
   *
   * @throws NotFoundError  job 없음
   * @status TBC — 응답 스키마 미확정
   */
  getJobDetail(jobId: string): Promise<JobSummary>;

  /**
   * 수동 재처리를 요청한다. (OPS-02 Step 4, OPS-03)
   * retry_count를 초기화하고 CSC-07에 신규 job을 생성한다.
   *
   * @throws NotFoundError  대상 job 없음
   */
  requestReprocessing(request: ReprocessingRequest): Promise<void>;
}
```

---

## 예외 타입

```typescript
export class NotFoundError extends Error {} // job 없음
```

---

## 의존 관계

| 의존 대상                  | 호출 목적                      | 정의 위치 |
| -------------------------- | ------------------------------ | --------- |
| **CSU-01.01** DB Interface | job 이력, 파이프라인 현황 조회 | CI-03     |

---

## 미확정 항목

| 우선순위 | 항목                             | 상태 | 해결 조건               |
| -------- | -------------------------------- | ---- | ----------------------- |
| P2       | 응답 JSON 스키마 전체            | TBC  | 운영자 요구사항 확정 후 |
| P2       | Electron IPC vs REST 통신 방식   | TBC  | UI-03 확정 후           |
| P3       | 대시보드 갱신 주기 (폴링 vs SSE) | TBD  | 팀 내부 결정            |
| P3       | 운영자 인증 방식                 | TBC  | UI-03 확정 후           |

---

## 관련 문서

- **UI-03** — 운영자 콘솔 인터페이스 원천 정의 (ICD)
- **SI-06** — job 이력 조회 대상 DB 스키마 (ICD)
- **CI-03** — CSU-01.01 사용 (ICD)
