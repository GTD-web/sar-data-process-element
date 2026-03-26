# CSU-07.08 — Performance Analyzer

| 항목                | 내용                               |
| ------------------- | ---------------------------------- |
| **CSU ID**          | CSU-07.08                          |
| **소속 CSC**        | CSC-07 Pipeline Orchestrator (PWS) |
| **ICD 버전**        | v1.0 (2026-03-20)                  |
| **관련 인터페이스** | CI-03                              |

---

## 입력 타입

> **ICD 출처:** 3.2절 OPS-02 6단계

```typescript
/**
 * 성능 분석 요청.
 * 운영자 장애 조사 시 특정 job의 처리 시간 및 병목 구간을 파악한다.
 */
export interface PerformanceAnalysisRequest {
  /** 분석 대상 작업 고유 식별자 (UUID v4)
   * ICD OPS-02 6단계: "CSC-07.08 Performance Analyzer에서 처리 시간·병목 분석" */
  job_id: string;
}

/**
 * 단계별 처리 시간 정보.
 */
export interface StepDuration {
  /** 처리 CSC 식별자. 예: "CSC-03", "CSC-04" */
  source_csc: string;

  /** 처리 레벨. "LEVEL_0"~"LEVEL_3" */
  product_level: string;

  /** 처리 소요 시간 (밀리초)
   * ICD SI-03: "processing_duration_ms — 처리 소요 시간 (밀리초)" / 성숙도: TBC */
  duration_ms: number;

  /** SI-04 VT 기준 예산 (밀리초). 초과 여부 판단에 사용.
   * ICD SI-04 VT: CSC-03(L0)=3,600초, CSC-04(L1)=9,000초, CSC-05(L2)=2,700초, CSC-06(L3)=1,800초 */
  budget_ms: number;

  /** 예산 초과 여부 */
  exceeded_budget: boolean;
}

/**
 * 성능 분석 결과.
 */
export interface PerformanceReport {
  /** 분석 대상 작업 ID */
  job_id: string;

  /** 분석 수행 UTC 시각 */
  analyzed_at: string;

  /** 단계별 처리 시간 목록 (step_order 오름차순) */
  step_durations: StepDuration[];

  /** 전체 처리 소요 시간 (밀리초) */
  total_duration_ms: number;

  /** 500GB/4시간(14,400,000ms) 요건 충족 여부
   * ICD 3.1절: "전체 소요 시간 상한: 14,400초 (4시간)" */
  within_sla: boolean;

  /** 병목 구간 식별. duration이 가장 긴 단계의 source_csc */
  bottleneck_csc: string | null;
}
```

---

## CSU 인터페이스

> **ICD 출처:** 3.2절 OPS-02 6단계

| 메서드         | ICD 근거 문장                                                                          | 결론                                        |
| -------------- | -------------------------------------------------------------------------------------- | ------------------------------------------- |
| `analyzeJob()` | OPS-02 6단계: "CSC-07.08 Performance Analyzer에서 처리 시간·병목 분석. 실패 원인 파악" | 특정 job의 처리 시간 분석 및 병목 구간 반환 |

```typescript
export interface IPerformanceAnalyzer {
  /**
   * 특정 job의 처리 시간 및 병목 구간을 분석하여 보고서를 반환한다.
   * CSU-07.06 Audit Log 및 SI-03 processing_duration_ms 기록 데이터를 기반으로 분석한다.
   * 운영자 장애 조사(OPS-02) 및 일상 성능 모니터링 시 사용한다.
   *
   * 분석 기준:
   *   - 단계별 VT 예산 대비 실제 처리 시간 비교
   *   - 전체 처리 시간이 14,400초(4시간) 이내인지 확인
   *   - 처리 시간이 가장 긴 단계를 병목 구간으로 식별
   *
   * ICD 근거:
   *   - OPS-02 6단계 — "CSC-07.08 Performance Analyzer에서 처리 시간·병목 분석. 실패 원인 파악"
   *   - 3.1절 OPS-01 — "전체 소요 시간 상한: 14,400초 (4시간)"
   *   - SI-04 VT — 단계별 예산: L0=3,600초, L1=9,000초, L2=2,700초, L3=1,800초
   *
   * @throws JobNotFoundError  해당 job_id의 레코드 없음
   * @throws DbError           DB 조회 실패
   */
  analyzeJob(request: PerformanceAnalysisRequest): Promise<PerformanceReport>;
}
```

---

## 예외 타입

> **ICD 출처:** 3.2절 OPS-02 6단계

| 예외               | ICD 근거 문장                                                              | 결론                       |
| ------------------ | -------------------------------------------------------------------------- | -------------------------- |
| `JobNotFoundError` | OPS-02 6단계: "운영자가 ... Audit Log 조회" (조회 대상 job이 없을 수 있음) | 미존재 job_id 조회 시 예외 |
| `DbError`          | OPS-02 6단계: "CSC-01 DB Interface 경유" (공통 DB 접근 패턴)               | DB 조회 실패 시 예외       |

```typescript
export class JobNotFoundError extends Error {} // 미존재 job_id
export class DbError extends Error {} // DB 조회 실패
```

---

## 의존 관계

> **ICD 출처:** 3.2절 OPS-02 6단계, 6.8절 CI-03

| 의존 대상                  | 호출 목적                           | ICD 근거 문장                                                                                 | 결론                 | 정의 위치            |
| -------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- | -------------------- | -------------------- |
| **CSU-07.06**              | 단계별 처리 시간 로그 조회          | OPS-02 6단계: "운영자가 CSC-07.06 Audit Log 조회 ... CSC-07.08 Performance Analyzer에서 분석" | 로그 조회 위임       | CSU-07.06 인터페이스 |
| **CSU-01.01** DB Interface | job 레코드 및 처리 시간 데이터 조회 | OPS-02 6단계: "CSC-01 DB Interface 경유" (공통 DB 접근 원칙)                                  | DB 접근은 CI-03 경유 | CI-03                |

---

## 미확정 항목

> **ICD 출처:** SI-03, SI-04

| 우선순위 | 항목                               | 상태 | ICD 근거 문장                                                           | 결론                                             | 해결 조건     |
| -------- | ---------------------------------- | ---- | ----------------------------------------------------------------------- | ------------------------------------------------ | ------------- |
| P2       | `processing_duration_ms` 기록 시점 | TBC  | SI-03: "processing_duration_ms — 처리 소요 시간 (밀리초)" / 성숙도: TBC | 기록 시점 미확정 시 처리 시간 데이터 부정확 가능 | 팀 내부 결정  |
| P3       | 성능 리포트 UI 제공 여부           | TBD  | ICD 미기재 — UI-03(운영자 콘솔)과의 연동 여부 결정 필요                 | UI-03 설계 확정 후 연동 여부 결정                | UI-03 설계 후 |

---

## 관련 문서

- **SI-03** — processing_duration_ms 데이터 원천 (ICD 6.4절)
- **SI-04** — 단계별 VT(예산) 기준 (ICD 6.5절)
- **CSU-07.06** — 로그 데이터 조회
- **CI-03** — CSU-01.01 DB Interface 사용 (ICD 6.8절)
