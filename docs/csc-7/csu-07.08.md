# CSU-07.08 — Performance Analyzer

| 항목                | 내용                               |
| ------------------- | ---------------------------------- |
| **CSU ID**          | CSU-07.08                          |
| **소속 CSC**        | CSC-07 Pipeline Orchestrator (PWS) |
| **ICD 버전**        | v1.0 (2026-03-20)                  |
| **관련 인터페이스** | CI-03                              |

---

## 타입 정의

```typescript
export type ProductLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

export interface PerformanceQuery {
  /** 조회 대상 작업 ID. 미지정 시 전체 범위 조회 */
  job_id?: string;

  /** 조회 시작 UTC 시각 (ISO 8601) */
  from_timestamp?: string;

  /** 조회 종료 UTC 시각 (ISO 8601) */
  to_timestamp?: string;
}

export interface PerformanceReport {
  /** 조회 대상 작업 ID */
  job_id?: string;

  /** 단계별 처리 소요 시간 */
  duration_by_level: Partial<Record<ProductLevel, number>>; // 밀리초

  /**
   * 병목 CSC 식별자. 예: "CSC-04"
   * @status TBD — 병목 판정 기준 미확정
   */
  bottleneck_csc?: string;

  /** 전체 파이프라인 소요 시간 (밀리초) */
  total_duration_ms?: number;
}
```

---

## CSU 인터페이스

```typescript
export interface IPerformanceAnalyzer {
  /**
   * 처리 시간 및 병목 구간을 분석한다.
   * 운영자가 OPS-02 장애 대응 시 원인 파악에 사용한다.
   *
   * @throws DbError  분석 데이터 조회 실패
   */
  analyze(query: PerformanceQuery): Promise<PerformanceReport>;
}
```

---

## 예외 타입

```typescript
export class DbError extends Error {} // 분석 데이터 조회 실패
```

---

## 의존 관계

| 의존 대상                  | 호출 목적                          | 정의 위치 |
| -------------------------- | ---------------------------------- | --------- |
| **CSU-01.01** DB Interface | 처리 이력 및 소요 시간 데이터 조회 | CI-03     |

---

## 미확정 항목

| 우선순위 | 항목                          | 상태 | 해결 조건    |
| -------- | ----------------------------- | ---- | ------------ |
| P3       | 병목 판정 기준                | TBD  | 팀 내부 결정 |
| P3       | `PerformanceReport` 상세 구조 | TBD  | 팀 내부 결정 |
| P3       | 집계 단위 (job별 / 기간별)    | TBD  | 팀 내부 결정 |

---

## 관련 문서

- **CI-03** — CSU-01.01 사용 (ICD)
