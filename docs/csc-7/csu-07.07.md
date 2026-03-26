# CSU-07.07 — Alert Manager

| 항목                | 내용                                  |
| ------------------- | ------------------------------------- |
| **CSU ID**          | CSU-07.07                             |
| **소속 CSC**        | CSC-07 Pipeline Orchestrator (PWS)    |
| **ICD 버전**        | v1.0 (2026-03-20)                     |
| **관련 인터페이스** | SI-03, CI-03                          |
| **Alert 채널**      | 이메일 / Slack (외부. 채널 구성: TBD) |

---

## 입력 타입

> **ICD 출처:** 3.2절 OPS-02 5단계, 3절 모니터링 임계값 테이블

```typescript
/**
 * Alert 유형. 3절 모니터링 임계값 테이블 기준.
 */
export type AlertType =
  | 'PROCESSING_FAILED_FINAL' // retry_count == 3 도달. OPS-02 5단계
  | 'PROCESSING_DELAYED' // 처리 지연 2시간 초과
  | 'CPU_HIGH' // CPU > 90%
  | 'DISK_HIGH' // 디스크 > 85%
  | 'API_ERROR_RATE_HIGH' // API 오류율 > 5%
  | 'DATA_QUALITY_FAILED' // 품질 기준 미달 (CSU-08.02 발신)
  | 'STORAGE_LOW'; // NAS 잔여 용량 < 20%

/**
 * Alert 발행 요청.
 */
export interface AlertRequest {
  /** Alert 유형
   * ICD 3절 모니터링 임계값 테이블 기준 */
  alert_type: AlertType;

  /** Alert 발생 UTC 시각 (ISO 8601) */
  timestamp: string;

  /** 관련 작업 ID (job과 연관된 Alert만 설정). 예: PROCESSING_FAILED_FINAL
   * ICD OPS-02 5단계: "job_id, 마지막 error_code, retry 횟수 포함" */
  job_id?: string;

  /** 마지막 오류 코드 (PROCESSING_FAILED_FINAL 시 포함)
   * ICD OPS-02 5단계: "job_id, 마지막 error_code, retry 횟수 포함" / 성숙도: TBD
   * @status TBD — 오류 코드 체계 미확정 */
  error_code?: string;

  /** 재시도 횟수 (PROCESSING_FAILED_FINAL 시 포함)
   * ICD OPS-02 5단계: "job_id, 마지막 error_code, retry 횟수 포함" */
  retry_count?: number;

  /** 임계값을 초과한 측정 수치. 예: { cpu_percent: 92, threshold: 90 } */
  metric?: Record<string, number>;

  /** 사람이 읽을 수 있는 Alert 설명 */
  message: string;
}
```

---

## CSU 인터페이스

> **ICD 출처:** 3.2절 OPS-02 5단계, 3절 모니터링 임계값 테이블

| 메서드              | ICD 근거 문장                                                                                          | 결론                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `sendAlert()`       | OPS-02 5단계: "CSC-07.07 Alert Manager가 운영자 알림 발송. job_id, 마지막 error_code, retry 횟수 포함" | 외부 채널(이메일/Slack)로 Alert 발송 |
| `checkThresholds()` | 3절 모니터링 임계값 테이블: CPU > 90%, 디스크 > 85%, 스토리지 잔여 20% 이하 항목 (주기적 감시 필요)    | 시스템 리소스 임계값 주기적 점검     |

```typescript
export interface IAlertManager {
  /**
   * 외부 Alert 채널(이메일/Slack 등)로 운영자 알림을 발송한다.
   * 처리 실패 최종 도달, 데이터 품질 실패, API 오류율 초과 등의 이벤트에서 호출된다.
   *
   * ICD 근거:
   *   - OPS-02 5단계 — "CSC-07.07 Alert Manager가 운영자 알림 발송.
   *     job_id, 마지막 error_code, retry 횟수 포함. 처리 파이프라인 해당 job 일시 중단"
   *   - SI-03: "retry_count == 3 도달 시 CSC-07.07이 운영자 Alert 발행"
   *   - 3절 모니터링: "CSC-07.07 → 운영자 Alert" (처리 지연·실패 경로)
   *   - 3절 모니터링: "CSC-08.02 → CSC-07.07 Alert" (데이터 품질 실패 경로)
   *
   * @throws AlertDeliveryError  외부 채널 발송 실패
   */
  sendAlert(request: AlertRequest): Promise<void>;

  /**
   * 시스템 리소스 임계값을 주기적으로 점검하고 초과 시 Alert를 발행한다.
   * Prometheus/Grafana 연동이 없는 경우 이 메서드가 직접 임계값을 감시한다.
   *
   * 감시 항목 (3절 모니터링 임계값 테이블):
   *   - CPU > 90% → ALERT_TYPE: CPU_HIGH → Prometheus→Grafana Alert 경로와 병행 가능
   *   - 디스크 > 85% → ALERT_TYPE: DISK_HIGH
   *   - NAS 잔여 용량 < 20% → ALERT_TYPE: STORAGE_LOW
   *   - 처리 파이프라인 지연 2시간 초과 → ALERT_TYPE: PROCESSING_DELAYED
   *
   * ICD 근거:
   *   - 3절 모니터링: "CPU > 90%, 디스크 > 85% — Prometheus → Grafana Alert"
   *   - 3절 모니터링: "잔여 용량 20% 이하 — CSC-01 → 운영자 Alert"
   *   - 3절 모니터링: "처리 파이프라인 지연 2시간 이상 — CSC-07.07 → 운영자 Alert"
   */
  checkThresholds(): Promise<void>;
}
```

---

## 예외 타입

> **ICD 출처:** 3.2절 OPS-02 5단계

| 예외                 | ICD 근거 문장                                                            | 결론                        |
| -------------------- | ------------------------------------------------------------------------ | --------------------------- |
| `AlertDeliveryError` | OPS-02 5단계: "외부 Alert 채널 (이메일/슬랙 등)" (채널 발송 실패 가능성) | 외부 채널 발송 실패 시 예외 |

```typescript
export class AlertDeliveryError extends Error {} // 외부 Alert 채널 발송 실패
```

---

## 의존 관계

> **ICD 출처:** 3.2절 OPS-02 5단계, 3절 모니터링 임계값 테이블

| 의존 대상                  | 호출 목적               | ICD 근거 문장                                                              | 결론                  | 정의 위치 |
| -------------------------- | ----------------------- | -------------------------------------------------------------------------- | --------------------- | --------- |
| **CSU-01.01** DB Interface | 처리 지연 job 목록 조회 | 3절 모니터링: "처리 파이프라인 지연 2시간 이상 — CSC-07.07 → 운영자 Alert" | DB 접근은 CI-03 경유  | CI-03     |
| **CSU-01.03** NAS Manager  | NAS 잔여 용량 확인      | 3절 모니터링: "잔여 용량 20% 이하 — CSC-01 → 운영자 Alert"                 | NAS 접근은 CI-03 경유 | CI-03     |

---

## 미확정 항목

> **ICD 출처:** 3.2절 OPS-02, 3절 모니터링 임계값 테이블

| 우선순위 | 항목                               | 상태 | ICD 근거 문장                                                             | 결론                                           | 해결 조건    |
| -------- | ---------------------------------- | ---- | ------------------------------------------------------------------------- | ---------------------------------------------- | ------------ |
| P2       | Alert 채널 구성 (이메일/Slack URL) | TBD  | OPS-02 5단계: "외부 Alert 채널 (이메일/슬랙 등)"                          | 채널 구성 정보 확정 전 sendAlert() 구현 불가   | 팀 내부 결정 |
| P2       | `checkThresholds()` 호출 주기      | TBD  | ICD 미기재 — 팀 내부 결정 사항                                            | 주기 미확정 시 임계값 감시 스케줄 설정 불가    | 팀 내부 결정 |
| P2       | API 오류율 감시 주체               | TBC  | 3절 모니터링: "응답 > 5초, 오류율 > 5% — API Gateway → 운영자 Alert"      | API Gateway 연동 vs CSU-07.07 직접 감시 미결정 | 팀 내부 결정 |
| P2       | `error_code` 체계                  | TBD  | 8.3절: "SDPE 고유 오류 코드 형식 미확정. 각 CSC 담당자 취합 후 설계 필요" | 코드 체계 확정 전 Alert 내용 구성 불완전       | 팀 내부 결정 |
| P2       | Alert 중복 억제 정책               | TBD  | ICD 미기재 — 팀 내부 결정 사항                                            | 동일 job 연속 Alert 억제 정책 미결정           | 팀 내부 결정 |

---

## 관련 문서

- **SI-03** — retry_count == 3 도달 시 Alert 발행 트리거 (ICD 6.4절)
- **CI-03** — CSU-01.01 DB Interface, CSU-01.03 NAS Manager 사용 (ICD 6.8절)
- **CSU-07.05** — PROCESSING_FAILED_FINAL Alert 발행 요청
- **CSU-08.02** — DATA_QUALITY_FAILED Alert 발행 요청 (모니터링 표)
