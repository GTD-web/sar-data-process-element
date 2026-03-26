# CSU-07.01 — Reception Event Listener

| 항목                | 내용                               |
| ------------------- | ---------------------------------- |
| **CSU ID**          | CSU-07.01                          |
| **소속 CSC**        | CSC-07 Pipeline Orchestrator (PWS) |
| **ICD 버전**        | v1.0 (2026-03-20)                  |
| **관련 인터페이스** | EI-01, SI-01, SI-03, SI-04, CI-03  |
| **구독 큐**         | `sdpe.reception.events`            |

---

## 입력 타입

> **ICD 출처:** 5.1.1절 EI-01 수신 이벤트 메시지 구조 테이블
> 테이블의 각 행이 필드로 대응된다. 성숙도 TBC/TBD 항목은 `@status` 주석으로 표기한다.

```typescript
export interface RawDataReceivedEvent {
  /** 메시지 스키마 버전. 현재 "1.0"
   * ICD 5.1.1절: "schema_version — 메시지 스키마 버전. 현재 '1.0'" / 성숙도: 확정 */
  schema_version: '1.0';

  /** 이벤트 고유 식별자 (UUID v4). 중복 수신 방지에 사용한다.
   * ICD 5.1.1절: "event_id — 이벤트 고유 식별자. 중복 수신 방지에 사용" / 성숙도: 확정 */
  event_id: string;

  /** 이벤트 타입. 고정값
   * ICD 5.1.1절: "event_type — 'RAW_DATA_RECEIVED' 고정값" / 성숙도: 확정 */
  event_type: 'RAW_DATA_RECEIVED';

  /** 위성 식별자
   * ICD 5.1.1절: "satellite_id — 위성 식별자. 형식: TBD (예: 'SAT-01')" / 성숙도: TBC
   * @status TBC — 형식 미확정 (예: "SAT-01") */
  satellite_id: string;

  /** 촬영 시작 UTC 시각 (ISO 8601). 예: "2024-03-15T10:30:45.000Z"
   * ICD 5.1.1절: "acquisition_start — 촬영 시작 UTC 시각" / 성숙도: 확정 */
  acquisition_start: string;

  /** 촬영 종료 UTC 시각 (ISO 8601)
   * ICD 5.1.1절: "acquisition_end — 촬영 종료 UTC 시각" / 성숙도: 확정 */
  acquisition_end: string;

  /** NAS 내 원시 데이터 파일 경로 (절대 경로)
   * ICD 5.1.1절: "raw_data_path — NAS 내 원시 데이터 파일 경로 (절대 경로)" / 성숙도: 확정 */
  raw_data_path: string;

  /** 파일 크기 (바이트). 전송 완료 검증에 사용한다.
   * ICD 5.1.1절: "file_size_bytes — 파일 크기 (바이트). 전송 완료 검증에 사용" / 성숙도: 확정 */
  file_size_bytes: number;

  /** SHA-256 체크섬. 파일 무결성 검증에 사용한다.
   * ICD 5.1.1절: "checksum_sha256 — SHA-256 체크섬. 파일 무결성 검증" / 성숙도: 확정 */
  checksum_sha256: string;

  /** 촬영 모드
   * ICD 5.1.1절: "mode — 촬영 모드. 허용값: TBD (예: 'SM', 'SC', 'SL')" / 성숙도: TBC
   * @status TBC — 허용값 미확정 (예: "SM" | "SC" | "SL") */
  mode: string;

  /** 편파 구성
   * ICD 5.1.1절: "polarization — 편파 구성. 예: ['HH'], ['HH','HV']" / 성숙도: TBC
   * @status TBC — 허용값 미확정 (예: ["HH"] | ["HH","HV"]) */
  polarization: string[];

  /** 레이더 중심 주파수 (Hz)
   * ICD 5.1.1절: "center_frequency_hz — 레이더 중심 주파수 (Hz)" / 성숙도: TBC
   * @status TBC — 위성 하드웨어 규격서 확정 후 고정값 명시 가능 */
  center_frequency_hz: number;

  /** Pulse Repetition Frequency (Hz)
   * ICD 5.1.1절: "prf_hz — Pulse Repetition Frequency (PRF) (Hz)" / 성숙도: TBC
   * @status TBC — 위성 하드웨어 규격서 확정 후 유효 범위 확정 가능 */
  prf_hz: number;

  /** 부가 메타데이터 JSON 파일 경로. 없으면 null
   * ICD 5.1.1절: "metadata_path — 부가 메타데이터 JSON 파일 경로. 없으면 null" / 성숙도: TBD
   * @status TBD — 포함 여부 및 스키마 미확정 */
  metadata_path?: string | null;
}
```

---

## CSU 인터페이스

> **ICD 출처:** 3.1절 OPS-01 운영 시나리오 1~2단계, 3.2절 OPS-02 운영 시나리오 1~3단계

| 메서드                | ICD 근거 문장                                                                                   | 결론                        |
| --------------------- | ----------------------------------------------------------------------------------------------- | --------------------------- |
| `startPolling()`      | OPS-01 1단계: "위성 수신국이 sdpe.reception.events 큐에 RAW_DATA_RECEIVED 이벤트 발행"          | 큐를 지속적으로 감시해야 함 |
| `poll()`              | OPS-01 2단계: "CSC-07.01이 이벤트 수신"                                                         | 큐에서 메시지를 꺼내는 행위 |
| `onRawDataReceived()` | OPS-01 2단계: "CSC-07.02가 처리 프로파일 자동 선택. CSC-01 DB Interface를 통해 job 레코드 생성" | 꺼낸 이벤트를 처리하는 행위 |

```typescript
export interface IReceptionEventListener {
  /**
   * ICD 근거: OPS-01 1단계 — "sdpe.reception.events 큐에 RAW_DATA_RECEIVED 이벤트 발행"
   * 수신국이 언제 데이터를 보낼지 알 수 없으므로 큐를 지속적으로 감시한다.
   */
  startPolling(): void;

  /**
   * sdpe.reception.events 큐에서 메시지를 읽어 처리한다.
   * 한 번에 몇 건을 읽을지는 구현에서 결정한다. ICD에 건수 제약 없음.
   * 정상 처리 시 큐에서 삭제한다(pgmq.delete).
   * 실패 시 삭제하지 않아 visibility timeout 후 자동으로 재노출된다.
   * 큐가 비어 있으면 'empty'를 반환하며, 호출자(startPolling)는 이를 이용해
   * 폴링 주기를 조절(백오프 등)할 수 있다.
   * ICD 근거: OPS-01 2단계 — "CSC-07.01이 이벤트 수신"
   *
   * @returns 'processed' — 메시지를 1건 이상 처리 완료
   * @returns 'empty'     — 큐에 처리할 메시지 없음
   */
  poll(): Promise<'processed' | 'empty'>;

  /**
   * RAW_DATA_RECEIVED 이벤트를 처리한다.
   *
   * 처리 순서:
   *   1. event_id 기준 중복 이벤트 여부 확인 → 중복이면 무시하고 정상 반환
   *   2. NAS 파일 체크섬 검증 (CSU-01.03 경유)
   *   3. CSU-07.02에 처리 프로파일 선택 위임
   *   4. CSU-01.01 경유 job 레코드 생성
   *   5. CSU-07.04에 CSC-03 작업 할당 위임 (sdpe.jobs.csc03 큐)
   *   6. CSU-07.06에 수신 성공 감사 로그 기록 위임
   *
   * 파일 무결성 검증 실패(FileIntegrityError) 시에는 job 레코드를 생성하지 않으며
   * SI-03 PROCESSING_FAILED 이벤트도 발행되지 않는다. 이 경우 처리 파이프라인이
   * 시작되지 않으므로 CSC-07.07의 Alert 대상에서도 제외된다.
   * ICD 근거:
   *   - 중복 방지: EI-01 5.1.1절 — "event_id — 이벤트 고유 식별자. 중복 수신 방지에 사용"
   *   - 프로파일·job 생성: OPS-01 2단계 — "CSC-07.02가 처리 프로파일 자동 선택.
   *     CSC-01 DB Interface를 통해 job 레코드 생성"
   *   - 무결성 검증: EI-01 5.1.1절 — "checksum_sha256 — SHA-256 체크섬. 파일 무결성 검증"
   *   - SI-03 미발행 케이스: OPS-02 2단계 — "CSC-04에서 처리 실패 발생 ...
   *     PROCESSING_FAILED 이벤트 발행" (처리 시작 전 실패는 이 흐름에 포함되지 않음)
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

> **ICD 출처:** 3.1절 OPS-01 1~2단계, 3.2절 OPS-02 2단계

| 예외                   | ICD 근거 문장                                              | 결론                  |
| ---------------------- | ---------------------------------------------------------- | --------------------- |
| `FileIntegrityError`   | OPS-01 1단계: "파일 크기·체크섬 포함"                      | 체크섬 불일치 시 실패 |
| `ProfileNotFoundError` | OPS-01 2단계: "CSC-07.02가 처리 프로파일 자동 선택"        | 선택 실패 가능성      |
| `DbError`              | OPS-01 2단계: "CSC-01 DB Interface를 통해 job 레코드 생성" | 저장 실패 가능성      |

```typescript
export class FileIntegrityError extends Error {} // 체크섬 불일치
export class ProfileNotFoundError extends Error {} // 처리 프로파일 선택 실패
export class DbError extends Error {} // job 레코드 저장 실패
```

---

## 의존 관계

> **ICD 출처:** 3.1절 OPS-01 2~3단계, 3.2절 OPS-02 6단계

| 의존 대상                  | 호출 목적                            | ICD 근거 문장                                                                                                                                         | 결론                  | 정의 위치            |
| -------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------- |
| **CSU-07.02**              | 위성·모드 기반 처리 프로파일 선택    | OPS-01 2단계: "CSC-07.02가 처리 프로파일 자동 선택"                                                                                                   | 프로파일 선택 위임    | CSU-07.02 인터페이스 |
| **CSU-07.04**              | CSC-03 작업 할당 메시지 발행         | OPS-01 3단계: "CSC-07.04가 sdpe.jobs.csc02에 JOB_ASSIGNED 발행. **CSC-02** 워커가 메시지 소비 후 처리 시작"                                           | 작업 할당 위임        | CSU-07.04 인터페이스 |
| **CSU-07.06**              | 이벤트 수신 성공·실패 감사 로그 기록 | OPS-01 2단계: 이벤트 수신 처리 완료 (기록 주체). OPS-02 6단계: "운영자가 CSC-07.06 Audit Log 조회" (로그가 기록되어 있어야 조회 가능함을 역으로 확인) | 감사 로그 기록 위임   | CSU-07.06 인터페이스 |
| **CSU-01.01** DB Interface | job 레코드 생성 / event_id 중복 확인 | OPS-01 2단계: "CSC-01 DB Interface를 통해 job 레코드 생성"                                                                                            | DB 접근은 CI-03 경유  | CI-03                |
| **CSU-01.03** NAS Manager  | 파일 체크섬 검증                     | EI-01 5.1.1절: "checksum_sha256 — SHA-256 체크섬. 파일 무결성 검증"                                                                                   | NAS 접근은 CI-03 경유 | CI-03                |

> **[이슈] OPS-01 3단계 작업 할당 대상 CSC 불일치**
>
> v1.0 ICD 내에 다음 두 가지 기재가 충돌한다.
>
> | 출처                 | 내용                                                             |
> | -------------------- | ---------------------------------------------------------------- |
> | OPS-01 3단계 (3.1절) | `sdpe.jobs.csc02` 큐에 JOB_ASSIGNED 발행 → **CSC-02** 워커 소비  |
> | CI-01 6.1절 제공자   | Level-0 처리 컴포넌트 = **CSC-03** (CSU 번호 CSU-03.xx로 뒷받침) |
> | OPS-01 4단계 (3.1절) | "**CSC-03**가 Level-0 처리 완료"                                 |
>
> v1.0에서 CSC-02는 DCS(Data Collection Subsystem) 소속으로 별도 존재한다.
> Level-0 처리(SAR Processing)는 CSC-03(SPS 소속)이 담당하는 것이 ICD 전체 구조와 일치한다.
> `sdpe.jobs.csc02` 큐명과 "CSC-02 워커"는 OPS-01 3단계의 오기일 가능성이 높다.
>
> **본 문서는 CI-01 6.1절 및 OPS-01 4단계 기준으로 최초 작업 할당 대상을 CSC-03으로 간주하여
> `onRawDataReceived()` 처리 순서 5단계에 CSC-03 / `sdpe.jobs.csc03`을 명시한다.
> ICD 담당자의 OPS-01 3단계 큐명·CSC 번호 확인이 필요하다.**

---

## 미확정 항목

> **ICD 출처:** 8.2절 외부 인터페이스 미확정 항목 테이블, 8.6절 해결 우선순위 테이블

| 우선순위 | 항목                                    | 상태 | ICD 근거 문장                                                                                        | 결론                                             | 해결 조건                                   |
| -------- | --------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------- |
| P1       | `satellite_id` 형식 및 파싱 규칙        | TBC  | 8.2절: "위성 식별 코드 체계가 위성팀에서 관리됨. 위성팀이 확정해야 SDPE 파싱 규칙 구현 가능"         | 위성팀 확정 전 파싱 규칙 구현 불가               | 위성팀 협의                                 |
| P1       | `mode` 허용값 enum                      | TBC  | 8.2절: "모드 코드가 확정되어야 CSC-07 처리 프로파일 선택 로직 구현 가능"                             | 모드 코드 확정 전 프로파일 선택 로직 구현 불가   | 위성팀 협의                                 |
| P1       | `polarization` 허용값 enum              | TBC  | 8.2절: "위성 하드웨어 지원 편파 조합은 위성팀 확정 사항"                                             | 위성팀 확정 전 편파 파싱 구현 불가               | 위성팀 협의                                 |
| P1       | `center_frequency_hz` 고정값            | TBC  | 8.2절: "위성 탑재 SAR 센서의 정확한 중심 주파수는 위성 하드웨어 규격서 확정 후 고정값으로 명시 가능" | 위성 하드웨어 규격서 확정 전 유효 범위 검증 불가 | 위성팀 협의                                 |
| P1       | `prf_hz` 유효 범위                      | TBC  | 8.2절: `center_frequency_hz`와 동일 맥락 — 위성 탑재 센서 규격 종속                                  | 위성 하드웨어 규격서 확정 전 유효 범위 검증 불가 | 위성팀 협의                                 |
| P1       | 작업 할당 대상 CSC 및 큐명              | 이슈 | OPS-01 3단계 vs CI-01 6.1절 불일치 — 상세 내용은 의존 관계 테이블 이슈 참조                          | ICD 담당자 확인 전 큐명 구현 불가                | ICD 담당자 확인                             |
| P2       | pgmq 재시도 상한 (`max_delivery_count`) | TBD  | ICD 미기재 — 팀 내부 구현 결정 사항                                                                  | 미기재로 팀 내부 결정 필요                       | 팀 내부 결정                                |
| P2       | 폴링 주기 및 백오프 전략 (ms)           | TBC  | ICD 미기재 — 팀 내부 구현 결정 사항. `poll()` 반환값 `'empty'` 활용 방식과 연동                      | 미기재로 팀 내부 결정 필요                       | 팀 내부 결정                                |
| P2       | job 저장 + 작업 할당 트랜잭션 처리 방식 | TBD  | 8.3절: "CSU-01.01 DB Interface 트랜잭션 API 확정 후"                                                 | 트랜잭션 API 확정 전 구현 불가                   | CSU-01.01 DB Interface 트랜잭션 API 확정 후 |
| P3       | `metadata_path` 포함 여부 및 스키마     | TBD  | 8.2절: "부가 메타데이터 파일을 수신국이 함께 제공할 수 있는지 수신국과 협의 필요"                    | 수신국 협의 전 필드 구현 불가                    | 수신국 협의                                 |

---

## 관련 문서

- **EI-01** — 입력 이벤트 원천 정의 (ICD 5.1.1절)
- **SI-01** — 원시 데이터 NAS 저장 및 수신 이벤트 (CSC-02 → CSC-07). CSU-07.01이 소비하는 이벤트의 SDPE 내부 경계 정의 (ICD 2.3절)
- **SI-03** — 처리 완료/실패 이벤트. FileIntegrityError 발생 시 이 인터페이스가 트리거되지 않는 예외 경로에 해당 (ICD 6.4절)
- **SI-04** — CSU-07.04가 발행하는 작업 할당 이벤트 (ICD 6.5절)
- **CI-03** — CSU-01.01, CSU-01.03 사용 (ICD 6.8절)
