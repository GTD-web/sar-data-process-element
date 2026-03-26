# CSU-07.06 — Audit Log Collector

| 항목                | 내용                               |
| ------------------- | ---------------------------------- |
| **CSU ID**          | CSU-07.06                          |
| **소속 CSC**        | CSC-07 Pipeline Orchestrator (PWS) |
| **ICD 버전**        | v1.0 (2026-03-20)                  |
| **관련 인터페이스** | CI-03                              |

---

## 입력 타입

> **ICD 출처:** 3.2절 OPS-02 6단계

```typescript
/**
 * 감사 로그 항목 유형.
 * 수신 이벤트, 작업 할당, 처리 완료/실패 등 주요 시스템 이벤트를 기록한다.
 */
export type AuditEventType =
  | 'RAW_DATA_RECEIVED' // EI-01 수신 이벤트 처리 (CSU-07.01)
  | 'JOB_CREATED' // job 레코드 생성
  | 'JOB_ASSIGNED' // 처리 CSC에 작업 할당 (CSU-07.04)
  | 'PROCESSING_COMPLETED' // 처리 완료 이벤트 수신 (CSU-07.05)
  | 'PROCESSING_FAILED' // 처리 실패 이벤트 수신 (CSU-07.05)
  | 'JOB_RETRIED' // 자동 재시도 발행
  | 'JOB_FAILED_FINAL' // retry_count == 3 도달, 최종 실패
  | 'MANUAL_REPROCESS' // 수동 재처리 요청 (UI-01 POST)
  | 'REGISTRATION_TRIGGERED'; // SI-05 등록 트리거 발행

/**
 * 감사 로그 기록 요청.
 */
export interface AuditLogEntry {
  /** 감사 이벤트 유형 */
  event_type: AuditEventType;

  /** 관련 작업 고유 식별자 (UUID v4). job과 연관이 없는 이벤트는 null.
   * ICD 3.2절: "job_id, 마지막 error_code, retry 횟수 포함" (Alert 내용 기준) */
  job_id: string | null;

  /** 이벤트 발생 UTC 시각 (ISO 8601) */
  timestamp: string;

  /** 이벤트를 생성한 CSU 식별자. 예: "CSU-07.01", "CSU-07.05" */
  source_csu: string;

  /** 추가 컨텍스트 데이터 (자유 형식 JSON). 오류 코드, 경로 등 이벤트별 부가 정보 포함 */
  context?: Record<string, unknown>;
}

/**
 * 감사 로그 조회 필터.
 */
export interface AuditLogFilter {
  /** 조회할 job_id (없으면 전체) */
  job_id?: string;

  /** 조회할 이벤트 유형 목록 (없으면 전체) */
  event_types?: AuditEventType[];

  /** 조회 시작 UTC 시각 (ISO 8601) */
  from?: string;

  /** 조회 종료 UTC 시각 (ISO 8601) */
  to?: string;

  /** 최대 반환 건수 */
  limit?: number;
}
```

---

## CSU 인터페이스

> **ICD 출처:** 3.2절 OPS-02 6단계

| 메서드        | ICD 근거 문장                                                                                | 결론                                          |
| ------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `logEvent()`  | CSU-07.01 의존 관계: "CSU-07.06에 수신 성공 감사 로그 기록 위임"                             | 주요 시스템 이벤트를 DB에 기록                |
| `queryLogs()` | OPS-02 6단계: "운영자가 CSC-07.06 Audit Log 조회 (CSC-01 DB Interface 경유). 실패 원인 파악" | 운영자 또는 CSU-07.08이 로그를 조회할 때 사용 |

```typescript
export interface IAuditLogCollector {
  /**
   * 감사 로그 항목을 DB에 기록한다.
   * 모든 주요 시스템 이벤트(수신, 할당, 완료, 실패, 재시도, 등록 트리거)에 대해 호출된다.
   * 로그 기록 실패는 처리 파이프라인을 중단시키지 않는다. 단, 오류는 내부 로그(stderr)에 출력한다.
   *
   * ICD 근거: OPS-02 6단계 — "운영자가 CSC-07.06 Audit Log 조회 (CSC-01 DB Interface 경유)"
   * (조회 가능하려면 기록이 선행되어야 함)
   *
   * @throws DbError  DB 기록 실패 (호출자에게 전파하지 않고 내부 처리 권장)
   */
  logEvent(entry: AuditLogEntry): Promise<void>;

  /**
   * 필터 조건에 맞는 감사 로그 목록을 반환한다.
   * 운영자 장애 조사 및 CSU-07.08 성능 분석 시 사용한다.
   *
   * ICD 근거: OPS-02 6단계 — "운영자가 CSC-07.06 Audit Log 조회 (CSC-01 DB Interface 경유).
   * CSC-07.08 Performance Analyzer에서 처리 시간·병목 분석. 실패 원인 파악"
   *
   * @throws DbError  DB 조회 실패
   */
  queryLogs(filter: AuditLogFilter): Promise<AuditLogEntry[]>;
}
```

---

## 예외 타입

> **ICD 출처:** 3.2절 OPS-02 6단계

| 예외      | ICD 근거 문장                                                                  | 결론                      |
| --------- | ------------------------------------------------------------------------------ | ------------------------- |
| `DbError` | OPS-02 6단계: "CSC-01 DB Interface를 통해 job 레코드 생성" (공통 DB 접근 패턴) | DB 기록/조회 실패 시 예외 |

```typescript
export class DbError extends Error {} // DB 기록/조회 실패
```

---

## 의존 관계

> **ICD 출처:** 3.2절 OPS-02 6단계, 6.8절 CI-03

| 의존 대상                  | 호출 목적              | ICD 근거 문장                                                 | 결론                 | 정의 위치 |
| -------------------------- | ---------------------- | ------------------------------------------------------------- | -------------------- | --------- |
| **CSU-01.01** DB Interface | 감사 로그 기록 및 조회 | OPS-02 6단계: "CSC-01 DB Interface를 통해 ... Audit Log 조회" | DB 접근은 CI-03 경유 | CI-03     |

---

## 미확정 항목

> **ICD 출처:** 6.8절 CI-03 미결 항목

| 우선순위 | 항목                           | 상태 | ICD 근거 문장                                                                 | 결론                                     | 해결 조건    |
| -------- | ------------------------------ | ---- | ----------------------------------------------------------------------------- | ---------------------------------------- | ------------ |
| P2       | 감사 로그 테이블 스키마        | TBD  | CI-03 미결: "각 메서드 상세 시그니처 완전 정의" (logEvent 대상 테이블 미정의) | 테이블 스키마 확정 전 DB 기록 구현 불가  | 팀 내부 결정 |
| P2       | 로그 보존 기간 정책            | TBD  | ICD 미기재 — 팀 내부 결정 사항                                                | 보존 정책 확정 전 TTL/아카이빙 구현 불가 | 팀 내부 결정 |
| P2       | `logEvent()` 실패 시 처리 방식 | TBD  | ICD 미기재 — 파이프라인 중단 vs. 경고 로그만 출력 여부 결정 필요              | 장애 격리 정책 확정 필요                 | 팀 내부 결정 |

---

## 관련 문서

- **CI-03** — CSU-01.01 DB Interface 사용 (ICD 6.8절)
- **CSU-07.01** — 수신 이벤트 로그 기록 요청
- **CSU-07.05** — 처리 완료/실패/재시도 로그 기록 요청
- **CSU-07.08** — 로그 조회를 통한 성능 분석
