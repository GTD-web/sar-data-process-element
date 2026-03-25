# CSU-07.01 — Reception Event Listener

| 항목                | 내용                               |
| ------------------- | ---------------------------------- |
| **CSU ID**          | CSU-07.01                          |
| **소속 CSC**        | CSC-07 Pipeline Orchestrator (PWS) |
| **ICD 버전**        | v1.0 (2026-03-20)                  |
| **관련 인터페이스** | EI-01, SI-04, CI-03                |
| **구독 큐**         | `sdpe.reception.events`            |

---

## 입력 타입

```typescript
export interface RawDataReceivedEvent {
  /** 메시지 스키마 버전. 현재 "1.0" */
  schema_version: '1.0';

  /** 이벤트 고유 식별자 (UUID v4). 중복 수신 방지에 사용한다. */
  event_id: string;

  /** 이벤트 타입. 고정값 */
  event_type: 'RAW_DATA_RECEIVED';

  /**
   * 위성 식별자
   * @status TBC — 형식 미확정 (예: "SAT-01")
   */
  satellite_id: string;

  /** 촬영 시작 UTC 시각 (ISO 8601). 예: "2024-03-15T10:30:45.000Z" */
  acquisition_start: string;

  /** 촬영 종료 UTC 시각 (ISO 8601) */
  acquisition_end: string;

  /** NAS 내 원시 데이터 파일 경로 (절대 경로) */
  raw_data_path: string;

  /** 파일 크기 (바이트). 전송 완료 검증에 사용한다. */
  file_size_bytes: number;

  /** SHA-256 체크섬. 파일 무결성 검증에 사용한다. */
  checksum_sha256: string;

  /**
   * 촬영 모드
   * @status TBC — 허용값 미확정 (예: "SM" | "SC" | "SL")
   */
  mode: string;

  /**
   * 편파 구성
   * @status TBC — 허용값 미확정 (예: ["HH"] | ["HH","HV"])
   */
  polarization: string[];

  /**
   * 레이더 중심 주파수 (Hz)
   * @status TBC
   */
  center_frequency_hz: number;

  /**
   * Pulse Repetition Frequency (Hz)
   * @status TBC
   */
  prf_hz: number;

  /**
   * 부가 메타데이터 JSON 파일 경로. 없으면 null
   * @status TBD — 포함 여부 및 스키마 미확정
   */
  metadata_path?: string | null;
}
```

---

## CSU 인터페이스

```typescript
export interface IReceptionEventListener {
  /**
   * 폴링을 시작한다. onModuleInit()에서 호출한다.
   */
  startPolling(): void;

  /**
   * sdpe.reception.events 큐에서 메시지를 1건 읽어 처리한다.
   * 정상 처리 시 큐에서 삭제한다(pgmq.delete).
   * 실패 시 삭제하지 않아 visibility timeout 후 자동으로 재노출된다.
   */
  poll(): Promise<void>;

  /**
   * RAW_DATA_RECEIVED 이벤트를 처리한다.
   * 중복 이벤트(event_id 기준)는 무시하고 정상 반환한다.
   *
   * @throws FileIntegrityError  체크섬 불일치
   * @throws ProfileNotFoundError  처리 프로파일 선택 실패
   * @throws DbError  job 레코드 저장 실패
   */
  onRawDataReceived(event: RawDataReceivedEvent): Promise<void>;
}
```

---

## 예외 타입

```typescript
export class FileIntegrityError extends Error {} // 체크섬 불일치
export class ProfileNotFoundError extends Error {} // 처리 프로파일 선택 실패
export class DbError extends Error {} // job 레코드 저장 실패
```

---

## 의존 관계

| 의존 대상                  | 호출 목적                            | 정의 위치            |
| -------------------------- | ------------------------------------ | -------------------- |
| **CSU-07.02**              | 위성·모드 기반 처리 프로파일 선택    | CSU-07.02 인터페이스 |
| **CSU-07.04**              | CSC-03 작업 할당 메시지 발행         | CSU-07.04 인터페이스 |
| **CSU-07.06**              | 이벤트 수신·실패 감사 로그 기록      | CSU-07.06 인터페이스 |
| **CSU-01.01** DB Interface | job 레코드 생성 / event_id 중복 확인 | CI-03                |
| **CSU-01.03** NAS Manager  | 파일 체크섬 검증                     | CI-03                |

---

## 미확정 항목

| 우선순위 | 항목                                    | 상태 | 해결 조건                                   |
| -------- | --------------------------------------- | ---- | ------------------------------------------- |
| P1       | `satellite_id` 형식 및 파싱 규칙        | TBC  | 위성팀 협의                                 |
| P1       | `mode` 허용값 enum                      | TBC  | 위성팀 협의                                 |
| P1       | `polarization` 허용값 enum              | TBC  | 위성팀 협의                                 |
| P2       | pgmq 재시도 상한 (`max_delivery_count`) | TBD  | 팀 내부 결정                                |
| P2       | 폴링 주기 (ms)                          | TBC  | 팀 내부 결정                                |
| P2       | job 저장 + 작업 할당 트랜잭션 처리 방식 | TBD  | CSU-01.01 DB Interface 트랜잭션 API 확정 후 |
| P3       | `metadata_path` 포함 여부 및 스키마     | TBD  | 수신국 협의                                 |

---

## 관련 문서

- **EI-01** — 입력 이벤트 원천 정의 (ICD)
- **SI-04** — CSU-07.04가 발행하는 작업 할당 이벤트 (ICD)
- **CI-03** — CSU-01.01, CSU-01.03 사용 (ICD)
