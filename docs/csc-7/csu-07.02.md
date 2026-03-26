# CSU-07.02 — Processing Profile Manager

| 항목                | 내용                               |
| ------------------- | ---------------------------------- |
| **CSU ID**          | CSU-07.02                          |
| **소속 CSC**        | CSC-07 Pipeline Orchestrator (PWS) |
| **ICD 버전**        | v1.0 (2026-03-20)                  |
| **관련 인터페이스** | SI-04, EI-01, CI-03                |

---

## 입력 타입

> **ICD 출처:** 5.1.1절 EI-01 수신 이벤트 메시지 구조 테이블, 6.5절 SI-04 작업 할당 메시지 구조 테이블

```typescript
/**
 * 프로파일 선택에 필요한 위성·모드·편파 기준.
 * EI-01 이벤트의 해당 필드에서 추출하여 구성한다.
 */
export interface ProfileSelectionCriteria {
  /** 위성 식별자
   * ICD 5.1.1절: "satellite_id — 위성 식별자. 형식: TBD" / 성숙도: TBC
   * @status TBC — 형식 미확정 */
  satellite_id: string;

  /** 촬영 모드
   * ICD 5.1.1절: "mode — 촬영 모드. 허용값: TBD (예: 'SM', 'SC', 'SL')" / 성숙도: TBC
   * @status TBC — 허용값 미확정 */
  mode: string;

  /** 편파 구성
   * ICD 5.1.1절: "polarization — 편파 구성. 예: ['HH'], ['HH','HV']" / 성숙도: TBC
   * @status TBC — 허용값 미확정 */
  polarization: string[];
}

/**
 * 선택된 처리 프로파일.
 * profile_id는 SI-04 메시지의 processing_profile_id 필드로 전달된다.
 */
export interface ProcessingProfile {
  /** 프로파일 고유 식별자 (UUID v4)
   * ICD 6.5절: "processing_profile_id — CSC-07.02 Processing Profile Manager가 선택한 프로파일 ID" / 성숙도: 확정 */
  profile_id: string;

  /** 프로파일 이름 (사람이 읽을 수 있는 형식) */
  name: string;

  /** 적용 위성 식별자 */
  satellite_id: string;

  /** 적용 촬영 모드 */
  mode: string;

  /** 알고리즘 파라미터 맵. 상세 구조: TBD
   * ICD 6.5절: "processing_params — 처리 파라미터 오버라이드. 상세 구조: TBD" / 성숙도: TBD
   * @status TBD — 허용 오버라이드 항목 미확정 */
  parameters: Record<string, unknown>;
}
```

---

## CSU 인터페이스

> **ICD 출처:** 3.1절 OPS-01 2단계, 6.5절 SI-04

| 메서드             | ICD 근거 문장                                                                              | 결론                                     |
| ------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `selectProfile()`  | OPS-01 2단계: "CSC-07.02가 처리 프로파일 자동 선택"                                        | 기준(위성·모드·편파)으로 DB 조회 후 반환 |
| `getProfileById()` | SI-04: "processing_profile_id — CSC-07.02 Processing Profile Manager가 선택한 프로파일 ID" | profile_id로 직접 프로파일 로드          |

```typescript
export interface IProcessingProfileManager {
  /**
   * 위성·모드·편파 기준으로 처리 프로파일을 자동 선택한다.
   * DB에서 조건에 맞는 프로파일을 조회하며, 복수 일치 시 가장 최근에 등록된 프로파일을 반환한다.
   * 일치하는 프로파일이 없으면 ProfileNotFoundError를 던진다.
   *
   * ICD 근거: OPS-01 2단계 — "CSC-07.02가 처리 프로파일 자동 선택"
   *
   * @throws ProfileNotFoundError  기준에 맞는 프로파일 없음
   * @throws DbError               DB 조회 실패
   */
  selectProfile(criteria: ProfileSelectionCriteria): Promise<ProcessingProfile>;

  /**
   * 프로파일 ID로 처리 프로파일을 로드한다.
   * OPS-03 부분 재처리 시, 이미 선택된 profile_id로 프로파일 내용을 다시 로드할 때 사용한다.
   *
   * ICD 근거: SI-04 — "processing_profile_id — CSC-07.02 Processing Profile Manager가 선택한 프로파일 ID"
   *
   * @throws ProfileNotFoundError  해당 ID의 프로파일 없음
   * @throws DbError               DB 조회 실패
   */
  getProfileById(profileId: string): Promise<ProcessingProfile>;
}
```

---

## 예외 타입

> **ICD 출처:** 3.1절 OPS-01 2단계

| 예외                   | ICD 근거 문장                                                                  | 결론                      |
| ---------------------- | ------------------------------------------------------------------------------ | ------------------------- |
| `ProfileNotFoundError` | OPS-01 2단계: "CSC-07.02가 처리 프로파일 자동 선택" (선택 실패 가능성)         | 기준 불일치 시 예외 발생  |
| `DbError`              | OPS-01 2단계: "CSC-01 DB Interface를 통해 job 레코드 생성" (공통 DB 접근 패턴) | DB 조회 실패 시 예외 발생 |

```typescript
export class ProfileNotFoundError extends Error {} // 기준에 맞는 프로파일 없음
export class DbError extends Error {} // DB 조회/저장 실패
```

---

## 의존 관계

> **ICD 출처:** 3.1절 OPS-01 2단계, 6.8절 CI-03

| 의존 대상                  | 호출 목적                 | ICD 근거 문장                                                                  | 결론                 | 정의 위치 |
| -------------------------- | ------------------------- | ------------------------------------------------------------------------------ | -------------------- | --------- |
| **CSU-01.01** DB Interface | 프로파일 레코드 조회·로드 | OPS-01 2단계: "CSC-01 DB Interface를 통해 job 레코드 생성" (공통 DB 접근 원칙) | DB 접근은 CI-03 경유 | CI-03     |

---

## 미확정 항목

> **ICD 출처:** 8.2절, 8.3절, 8.6절

| 우선순위 | 항목                            | 상태 | ICD 근거 문장                                                                                     | 결론                                             | 해결 조건        |
| -------- | ------------------------------- | ---- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------- |
| P1       | `mode` 허용값                   | TBC  | 8.2절: "모드 코드가 확정되어야 CSC-07 처리 프로파일 선택 로직 구현 가능"                          | 모드 코드 확정 전 프로파일 선택 로직 구현 불가   | 위성팀 협의      |
| P1       | `satellite_id` 형식             | TBC  | 8.2절: "위성 식별 코드 체계가 위성팀에서 관리됨. 위성팀이 확정해야 SDPE 파싱 규칙 구현 가능"      | 위성팀 확정 전 프로파일 매핑 구현 불가           | 위성팀 협의      |
| P1       | `polarization` 허용값           | TBC  | 8.2절: "위성 하드웨어 지원 편파 조합은 위성팀 확정 사항"                                          | 위성팀 확정 전 편파 기준 프로파일 선택 불가      | 위성팀 협의      |
| P2       | `parameters` 허용 구조          | TBD  | 8.3절: "processing_params 오버라이드 허용 목록 — FI 함수 시그니처 확정 후 알고리즘 개발자와 협의" | FI 함수 시그니처 확정 전 파라미터 구조 정의 불가 | FI-01~06 확정 후 |
| P2       | 복수 프로파일 일치 시 선택 정책 | TBD  | ICD 미기재 — 팀 내부 결정 사항                                                                    | 팀 내부 정책 결정 필요 (최신 등록 vs. 우선순위)  | 팀 내부 결정     |

---

## 관련 문서

- **EI-01** — 프로파일 선택 기준(satellite_id, mode, polarization) 원천 (ICD 5.1.1절)
- **SI-04** — processing_profile_id 전달 대상 (ICD 6.5절)
- **CI-03** — CSU-01.01 DB Interface 사용 (ICD 6.8절)
