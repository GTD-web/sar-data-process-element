# CSU-07.05 — Processing Monitor

| 항목                | 내용                               |
| ------------------- | ---------------------------------- |
| **CSU ID**          | CSU-07.05                          |
| **소속 CSC**        | CSC-07 Pipeline Orchestrator (PWS) |
| **ICD 버전**        | v1.0 (2026-03-20)                  |
| **관련 인터페이스** | SI-03, SI-04, SI-05, CI-03         |
| **구독 큐**         | `sdpe.processing.events`           |

---

## 입력 타입

> **ICD 출처:** 6.4절 SI-03 처리 이벤트 메시지 구조 테이블

```typescript
/**
 * SI-03 처리 완료 이벤트 (PROCESSING_COMPLETED).
 */
export interface ProcessingCompletedEvent {
  /** ICD 6.4절: "schema_version — 메시지 스키마 버전. 현재 '1.0'" / 성숙도: 확정 */
  schema_version: '1.0';

  /** ICD 6.4절: "job_id — CSC-07이 부여한 작업 고유 식별자. 파이프라인 추적 키" / 성숙도: 확정 */
  job_id: string;

  /** ICD 6.4절: "'PROCESSING_COMPLETED' 또는 'PROCESSING_FAILED'" / 성숙도: 확정 */
  event_type: 'PROCESSING_COMPLETED';

  /** ICD 6.4절: "source_csc — 이벤트 발행 CSC. 예: 'CSC-02', 'CSC-04'" / 성숙도: 확정 */
  source_csc: string;

  /** ICD 6.4절: "product_level — 처리 완료 레벨. 'LEVEL_0'~'LEVEL_3'" / 성숙도: 확정 */
  product_level: string;

  /** ICD 6.4절: "timestamp — 이벤트 발생 UTC 시각" / 성숙도: 확정 */
  timestamp: string;

  /** ICD 6.4절: "input_path — 입력 파일 NAS 경로" / 성숙도: 확정 */
  input_path: string;

  /** ICD 6.4절: "output_path — 처리 결과 NAS 경로. COMPLETED 시 필수" / 성숙도: 확정 */
  output_path: string;

  /** ICD 6.4절: "output_product_type — 산출물 유형. 예: 'SLC', 'GRD'. COMPLETED 시 필수" / 성숙도: TBC
   * @status TBC — 허용값 전체 목록 미확정 */
  output_product_type: string;

  /** ICD 6.4절: "processing_duration_ms — 처리 소요 시간 (밀리초)" / 성숙도: TBC
   * @status TBC — 미확정 */
  processing_duration_ms: number;

  /** ICD 6.4절: "retry_count — 현재까지 재시도 횟수. 최초 시도는 0" / 성숙도: 확정 */
  retry_count: number;
}

/**
 * SI-03 처리 실패 이벤트 (PROCESSING_FAILED).
 */
export interface ProcessingFailedEvent {
  /** ICD 6.4절: "schema_version" / 성숙도: 확정 */
  schema_version: '1.0';

  /** ICD 6.4절: "job_id" / 성숙도: 확정 */
  job_id: string;

  /** ICD 6.4절: "'PROCESSING_COMPLETED' 또는 'PROCESSING_FAILED'" / 성숙도: 확정 */
  event_type: 'PROCESSING_FAILED';

  /** ICD 6.4절: "source_csc" / 성숙도: 확정 */
  source_csc: string;

  /** ICD 6.4절: "product_level" / 성숙도: 확정 */
  product_level: string;

  /** ICD 6.4절: "timestamp" / 성숙도: 확정 */
  timestamp: string;

  /** ICD 6.4절: "input_path" / 성숙도: 확정 */
  input_path: string;

  /** ICD 6.4절: "output_path — FAILED 시 null" / 성숙도: 확정 */
  output_path: null;

  /** ICD 6.4절: "processing_duration_ms" / 성숙도: TBC */
  processing_duration_ms: number;

  /** ICD 6.4절: "error_code — 실패 시 오류 코드. 코드 체계: TBD" / 성숙도: TBD
   * @status TBD — 오류 코드 체계 미확정 */
  error_code?: string;

  /** ICD 6.4절: "error_message — 실패 시 오류 메시지 (사람이 읽을 수 있는 형식)" / 성숙도: TBC
   * @status TBC — 미확정 */
  error_message?: string;

  /** ICD 6.4절: "retry_count — 최대값 = 3. retry_count == 3 도달 시 CSC-07.07이 운영자 Alert 발행" / 성숙도: 확정 */
  retry_count: number;
}
```

---

## CSU 인터페이스

> **ICD 출처:** 3.1절 OPS-01 4~7단계, 3.2절 OPS-02 2~5단계, 6.4절 SI-03

| 메서드                    | ICD 근거 문장                                                                                                  | 결론                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `startMonitoring()`       | SI-03 소비자: "CSC-07 Processing Monitor (CSU-07.05)"                                                          | sdpe.processing.events 큐를 지속적으로 감시해야 함               |
| `poll()`                  | OPS-01 4단계: "CSC-03가 Level-0 처리 완료. ... PROCESSING_COMPLETED 발행. CSC-07이 수신 후 CSC-04에 작업 할당" | 큐에서 이벤트를 꺼내 처리하는 행위                               |
| `onProcessingCompleted()` | OPS-01 4~7단계: 각 레벨 완료 이벤트 수신 후 다음 CSC에 작업 할당 또는 SI-05 등록 트리거 발행                   | 완료 이벤트 처리: 다음 단계 작업 할당 또는 최종 단계 등록 트리거 |
| `onProcessingFailed()`    | OPS-02 2~4단계: "CSC-07.05 Processing Monitor가 실패 수신. retry_count < 3 확인. ... JOB_ASSIGNED 재발행"      | 실패 이벤트 처리: 재시도 또는 Alert 발행                         |

```typescript
export interface IProcessingMonitor {
  /**
   * sdpe.processing.events 큐를 지속적으로 감시한다.
   * ICD 근거: SI-03 소비자 — "CSC-07 Processing Monitor (CSU-07.05)"
   */
  startMonitoring(): void;

  /**
   * sdpe.processing.events 큐에서 이벤트를 읽어 처리한다.
   * 정상 처리 시 큐에서 삭제한다. 실패 시 삭제하지 않아 VT 후 자동 재노출된다.
   * ICD 근거: OPS-01 4단계 — "PROCESSING_COMPLETED 발행. CSC-07이 수신 후 CSC-04에 작업 할당"
   *
   * @returns 'processed' — 이벤트 1건 이상 처리 완료
   * @returns 'empty'     — 큐에 처리할 이벤트 없음
   */
  poll(): Promise<'processed' | 'empty'>;

  /**
   * PROCESSING_COMPLETED 이벤트를 처리한다.
   *
   * 처리 순서:
   *   1. job 레코드를 COMPLETED 상태로 갱신 (CSU-01.01 경유)
   *   2. product_level 기준으로 다음 단계 결정:
   *      - LEVEL_0 완료 → CSU-07.04를 통해 CSC-04에 LEVEL_1 작업 할당
   *      - LEVEL_1 완료 → CSU-07.04를 통해 CSC-05에 LEVEL_2 작업 할당
   *      - LEVEL_2 완료 → CSU-07.04를 통해 CSC-06에 LEVEL_3 작업 할당
   *      - LEVEL_3 완료 → CSU-07.04를 통해 SI-05 등록 트리거 발행 (CSC-08 대상)
   *   3. processing_duration_ms를 DB에 기록 (CSU-01.01 경유)
   *   4. CSU-07.06에 감사 로그 기록 위임
   *
   * ICD 근거:
   *   - OPS-01 4단계 — "PROCESSING_COMPLETED 발행. CSC-07이 수신 후 CSC-04에 작업 할당"
   *   - OPS-01 5단계 — "CSC-04이 Level-1 처리 완료. ... CSC-07이 CSC-05에 작업 할당"
   *   - OPS-01 7단계 — "CSC-06가 Level-3 응용 제품 생성 완료. CSC-07이 CSC-08에 등록 트리거 발행"
   *
   * @throws DbError  job 레코드 갱신 실패
   */
  onProcessingCompleted(event: ProcessingCompletedEvent): Promise<void>;

  /**
   * PROCESSING_FAILED 이벤트를 처리한다.
   *
   * 처리 순서:
   *   1. job 레코드에 실패 정보 기록 (CSU-01.01 경유)
   *   2. retry_count < 3이면 → CSU-07.04를 통해 동일 job_id로 JOB_ASSIGNED 재발행 (retry_count + 1)
   *   3. retry_count == 3이면 → job status = 'FAILED' 갱신 후 CSU-07.07에 Alert 발행 위임
   *   4. CSU-07.06에 감사 로그 기록 위임
   *
   * ICD 근거:
   *   - OPS-02 2단계 — "PROCESSING_FAILED 이벤트 발행. error_code, error_message 포함. retry_count = 0"
   *   - OPS-02 3단계 — "CSC-07.05 Processing Monitor가 실패 수신. retry_count < 3 확인.
   *     CSC-07.04가 동일 job_id로 JOB_ASSIGNED 재발행. retry_count = 1."
   *   - SI-03 retry_count: "retry_count == 3 도달 시 CSC-07.07이 운영자 Alert 발행"
   *   - 재시도 정책: "최대 자동 재시도 횟수 3회 (시스템 설계서 2.2)"
   *
   * @throws DbError  job 레코드 갱신 실패
   */
  onProcessingFailed(event: ProcessingFailedEvent): Promise<void>;
}
```

---

## 예외 타입

> **ICD 출처:** 3.2절 OPS-02 2~4단계

| 예외      | ICD 근거 문장                                                | 결론                 |
| --------- | ------------------------------------------------------------ | -------------------- |
| `DbError` | OPS-02 3단계: "CSC-01 DB Interface 경유" (공통 DB 접근 패턴) | DB 갱신 실패 시 예외 |

```typescript
export class DbError extends Error {} // DB 레코드 조회/갱신 실패
```

---

## 의존 관계

> **ICD 출처:** 3.1절 OPS-01, 3.2절 OPS-02, 6.4절 SI-03, 6.5절 SI-04, 6.6절 SI-05

| 의존 대상                  | 호출 목적                              | ICD 근거 문장                                                                        | 결론                 | 정의 위치            |
| -------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------ | -------------------- | -------------------- |
| **CSU-07.04**              | 다음 단계 작업 할당 메시지 발행        | OPS-01 4단계: "CSC-07이 수신 후 CSC-04에 작업 할당"                                  | 작업 할당 위임       | CSU-07.04 인터페이스 |
| **CSU-07.06**              | 이벤트 처리 결과 감사 로그 기록        | OPS-02 6단계: "운영자가 CSC-07.06 Audit Log 조회" (로그가 기록되어 있어야 조회 가능) | 감사 로그 기록 위임  | CSU-07.06 인터페이스 |
| **CSU-07.07**              | retry_count == 3 도달 시 Alert 발행    | SI-03: "retry_count == 3 도달 시 CSC-07.07이 운영자 Alert 발행"                      | Alert 발행 위임      | CSU-07.07 인터페이스 |
| **CSU-01.01** DB Interface | job 레코드 상태 갱신 및 처리 시간 기록 | OPS-01 2단계: "CSC-01 DB Interface를 통해 job 레코드 생성" (공통 DB 접근 원칙)       | DB 접근은 CI-03 경유 | CI-03                |

---

## 미확정 항목

> **ICD 출처:** 3.2절 OPS-02 재시도 정책, 8.3절, 8.6절

| 우선순위 | 항목                                   | 상태 | ICD 근거 문장                                                                     | 결론                                   | 해결 조건    |
| -------- | -------------------------------------- | ---- | --------------------------------------------------------------------------------- | -------------------------------------- | ------------ |
| P2       | 재시도 간격 (지수 백오프 여부)         | TBC  | 3.2절: "즉시 재시도 (즉각성 우선). 연속 실패 시 지수 백오프 적용 여부: TBC"       | 정책 확정 전 재시도 간격 구현 불가     | 팀 내부 결정 |
| P2       | `error_code` 체계                      | TBD  | 8.3절: "SDPE 고유 오류 코드 형식 미확정. 각 CSC 담당자가 유형 취합 후 설계 필요"  | 코드 체계 확정 전 error_code 파싱 불가 | 팀 내부 결정 |
| P2       | `output_product_type` 허용값 목록      | TBC  | 8.3절: "SLC/GRD/GEC/MAP/MSK/OBJ/CHG 등 전체 코드 목록. 파일명 규칙과 일관성 필요" | 목록 확정 전 유효성 검증 불가          | 팀 내부 결정 |
| P2       | 이벤트 보존 기간 정책                  | TBC  | SI-03 CDR 요건: "이벤트 보존 기간 정책 확정"                                      | 정책 확정 전 pgmq 큐 TTL 설정 불가     | 팀 내부 결정 |
| P3       | LEVEL_3 완료 후 SI-05 트리거 발행 주체 | TBC  | 8.3절: "등록 트리거 발행 CSU (07.05 vs 07.06) — 내부 설계 결정 필요"              | 담당 CSU 확정 전 구현 위치 결정 불가   | 팀 내부 결정 |

---

## 관련 문서

- **SI-03** — 구독 이벤트 구조 정의 (ICD 6.4절)
- **SI-04** — 다음 단계 작업 할당 메시지 구조 (ICD 6.5절)
- **SI-05** — LEVEL_3 완료 후 발행하는 등록 트리거 (ICD 6.6절)
- **CSU-07.04** — 작업 할당 메시지 발행
- **CSU-07.06** — 감사 로그 기록
- **CSU-07.07** — Alert 발행
- **CI-03** — CSU-01.01 DB Interface 사용 (ICD 6.8절)
