# CSU-07.07 — Alert Manager

| 항목                | 내용                               |
| ------------------- | ---------------------------------- |
| **CSU ID**          | CSU-07.07                          |
| **소속 CSC**        | CSC-07 Pipeline Orchestrator (PWS) |
| **ICD 버전**        | v1.0 (2026-03-20)                  |
| **관련 인터페이스** | SI-03, CI-03                       |

---

## 타입 정의

```typescript
/**
 * Alert 발생 조건 (ICD 3.2 재시도 정책 및 OPS-02/03 모니터링 임계값 기준)
 * @status TBD — 전체 조건 목록 미확정
 */
export type AlertCondition =
  | 'PROCESSING_FAILED_MAX_RETRY' // retry_count === 3 도달
  | 'PROCESSING_DELAYED' // 처리 지연 2시간 초과
  | 'CPU_THRESHOLD_EXCEEDED' // CPU > 90%
  | 'DISK_THRESHOLD_EXCEEDED' // 디스크 잔여 용량 < 20%
  | 'API_ERROR_RATE_EXCEEDED'; // API 오류율 > 5%

export interface AlertPayload {
  /** Alert 발생 조건 */
  condition: AlertCondition;

  /** 관련 작업 ID. 작업과 무관한 시스템 Alert은 없을 수 있다. */
  job_id?: string;

  /**
   * 오류 코드
   * @status TBD — 오류 코드 체계 미확정
   */
  error_code?: string;

  /** 재시도 횟수. PROCESSING_FAILED_MAX_RETRY 조건 시 포함 */
  retry_count?: number;

  /** Alert 발생 UTC 시각 (ISO 8601) */
  timestamp: string;

  /** 조건별 상세 데이터 */
  detail?: unknown;
}
```

---

## CSU 인터페이스

```typescript
export interface IAlertManager {
  /**
   * 운영자에게 Alert을 발송한다.
   * 발송 채널(이메일/슬랙 등)은 설정으로 관리한다.
   *
   * @throws AlertDeliveryError  발송 실패
   */
  sendAlert(payload: AlertPayload): Promise<void>;
}
```

---

## 예외 타입

```typescript
export class AlertDeliveryError extends Error {} // Alert 발송 실패
```

---

## 의존 관계

| 의존 대상                  | 호출 목적                | 정의 위치 |
| -------------------------- | ------------------------ | --------- |
| **CSU-01.01** DB Interface | Alert 이력 저장          | CI-03     |
| 외부 Alert 채널            | 이메일/슬랙 등 실제 발송 | —         |

---

## 미확정 항목

| 우선순위 | 항목                              | 상태 | 해결 조건               |
| -------- | --------------------------------- | ---- | ----------------------- |
| P2       | `AlertCondition` 전체 목록        | TBD  | 팀 내부 결정            |
| P2       | Alert 발송 채널 종류 및 설정 방식 | TBD  | 팀 내부 결정            |
| P2       | `error_code` 체계                 | TBD  | SI-03 오류 코드 확정 후 |
| P3       | Alert 중복 발송 방지 정책         | TBD  | 팀 내부 결정            |

---

## 관련 문서

- **SI-03** — Alert 트리거 조건 원천 정의 (ICD)
- **CI-03** — CSU-01.01 사용 (ICD)
