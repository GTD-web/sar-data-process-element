# CSU-09.03 — Operator Console

| 항목                | 내용                                |
| ------------------- | ----------------------------------- |
| **CSU ID**          | CSU-09.03                           |
| **소속 CSC**        | CSC-09 Data Service Subsystem (DSS) |
| **ICD 버전**        | v1.0 (2026-03-20)                   |
| **관련 인터페이스** | UI-03, SI-06, CI-03                 |
| **구현 기술**       | Electron 데스크톱 애플리케이션      |

---

## 입력 타입

> **ICD 출처:** 5.4절 UI-03 운영자 콘솔 기능 테이블

```typescript
/**
 * 운영자 콘솔 로그인 요청.
 * Electron 앱 실행 후 최초 인증에 사용한다.
 */
export interface ConsoleLoginRequest {
  /** 운영자 계정 ID
   * ICD UI-03: "operator_id — 운영자 계정 식별자" / 성숙도: TBC
   * @status TBC — 계정 관리 체계 미확정 */
  operator_id: string;

  /** 비밀번호 (전송 전 해싱 처리)
   * ICD UI-03: "password — 인증 자격 증명" / 성숙도: TBC
   * @status TBC — 인증 방식(로컬/LDAP) 미확정 */
  password: string;
}

/**
 * 처리 현황 조회 필터.
 * 운영자가 현재 처리 중인 작업 목록을 조회할 때 사용한다.
 */
export interface JobStatusFilter {
  /** 필터할 job 상태. 미지정 시 전체 조회
   * ICD UI-03: "status_filter — 상태별 필터링" / 성숙도: TBC
   * @status TBC — 허용 status 값 목록 미확정 */
  status?: string;

  /** 조회 시작 UTC 시각 (ISO 8601)
   * ICD UI-03: "from_time — 조회 시간 범위 시작" / 성숙도: TBC */
  from_time?: string;

  /** 조회 종료 UTC 시각 (ISO 8601)
   * ICD UI-03: "to_time — 조회 시간 범위 종료" / 성숙도: TBC */
  to_time?: string;
}

/**
 * 수동 재처리 요청.
 * 운영자가 실패한 job을 콘솔에서 직접 재처리 트리거할 때 사용한다.
 */
export interface ManualReprocessRequest {
  /** 재처리 대상 job_id
   * ICD OPS-02 7단계: "운영자가 CSC-09 API를 통해 특정 job_id 재처리 트리거" */
  job_id: string;

  /** 재처리 시작 레벨 (선택). 미지정 시 처음부터 재처리
   * ICD OPS-03 1단계: "target_level 파라미터로 시작 레벨 지정" */
  target_level?: 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';
}

/**
 * Alert 조회 필터.
 * 운영자가 수신된 Alert 목록을 조회할 때 사용한다.
 */
export interface AlertFilter {
  /** 조회할 Alert 유형. 미지정 시 전체 조회
   * ICD UI-03: "alert_type — Alert 유형 필터" / 성숙도: TBC
   * @status TBC — Alert 유형 코드 체계 미확정 */
  alert_type?: string;

  /** 미해제(unresolved) Alert만 조회 여부
   * ICD UI-03: "unresolved_only — 미해제 Alert 필터" / 성숙도: TBC */
  unresolved_only?: boolean;
}
```

---

## CSU 인터페이스

> **ICD 출처:** 5.4절 UI-03 운영자 콘솔 기능 테이블, 3.2절 OPS-02 5~7단계

| 메서드               | ICD 근거 문장                                                            | 결론                                                         |
| -------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `login()`            | UI-03: "운영자 인증 — 로컬 또는 LDAP 기반 (인증 방식 TBC)" / 성숙도: TBC | 로그인 후 JWT 또는 세션 토큰 발급                            |
| `getJobList()`       | OPS-02 5단계: "운영자가 콘솔에서 현재 처리 현황 모니터링" / 성숙도: 확정 | job 상태 목록 조회 (CSU-09.01 REST API 경유)                 |
| `getJobDetail()`     | OPS-02 6단계: "운영자가 CSC-07.06 Audit Log 조회, CSC-07.08 성능 분석"   | 단건 job 상세 및 감사 로그 조회                              |
| `triggerReprocess()` | OPS-02 7단계: "운영자가 CSC-09 API를 통해 특정 job_id 재처리 트리거"     | 수동 재처리 트리거 (CSU-09.01 POST /v1/processing/jobs 경유) |
| `getAlertList()`     | UI-03: "Alert 조회 — CSC-07.07이 발행한 Alert 목록 표시" / 성숙도: TBC   | 수신된 Alert 목록 조회                                       |
| `resolveAlert()`     | UI-03: "Alert 해제 — 운영자가 확인 후 해제 처리" / 성숙도: TBC           | 특정 Alert를 해제(acknowledged) 상태로 변경                  |

```typescript
export interface IOperatorConsole {
  /**
   * 운영자 자격 증명으로 콘솔에 로그인한다.
   * 인증 성공 시 세션 토큰을 발급하여 이후 API 호출에 사용한다.
   *
   * ICD 근거: UI-03 — "운영자 인증 — 로컬 또는 LDAP 기반 (인증 방식 TBC)"
   *
   * @throws UnauthorizedError  자격 증명 불일치
   * @status TBC — 인증 방식(로컬/LDAP) 미확정
   */
  login(request: ConsoleLoginRequest): Promise<{ session_token: string }>;

  /**
   * 필터 조건에 맞는 처리 작업 목록을 반환한다.
   * CSU-09.01 GET /v1/products 및 job 레코드를 통해 현황을 조회한다.
   *
   * 처리 순서:
   *   1. session_token 유효성 검증
   *   2. CSU-09.01을 통해 job 상태 목록 조회
   *   3. 필터 조건 적용 후 목록 반환
   *
   * ICD 근거: OPS-02 5단계 — "운영자가 콘솔에서 현재 처리 현황 모니터링"
   *
   * @throws UnauthorizedError  세션 만료 또는 인증 실패
   */
  getJobList(filter: JobStatusFilter, sessionToken: string): Promise<unknown[]>; // 응답 스키마: TBC

  /**
   * 특정 job의 상세 정보, 감사 로그, 성능 분석 데이터를 반환한다.
   *
   * 처리 순서:
   *   1. session_token 유효성 검증
   *   2. CSU-09.01을 통해 job 기본 정보 조회
   *   3. CSU-07.06 Audit Log 데이터 조회 (CI-03 경유)
   *   4. CSU-07.08 성능 분석 데이터 조회
   *   5. 통합된 상세 정보 반환
   *
   * ICD 근거:
   *   - OPS-02 6단계 — "운영자가 CSC-07.06 Audit Log 조회"
   *   - OPS-02 6단계 — "CSC-07.08 Performance Analyzer에서 처리 시간·병목 분석"
   *
   * @throws UnauthorizedError  세션 만료 또는 인증 실패
   * @throws NotFoundError      해당 job_id 없음
   */
  getJobDetail(jobId: string, sessionToken: string): Promise<unknown>; // 응답 스키마: TBC

  /**
   * 특정 job의 수동 재처리를 트리거한다.
   * CSU-09.01 POST /v1/processing/jobs 엔드포인트로 위임한다.
   *
   * ICD 근거:
   *   - OPS-02 7단계 — "운영자가 CSC-09 API를 통해 특정 job_id 재처리 트리거.
   *     CSC-07이 신규 job 생성 후 CSC-04에 작업 재할당 (retry_count 초기화)"
   *   - OPS-03 1단계 — "target_level 파라미터로 시작 레벨 지정"
   *
   * @throws UnauthorizedError  세션 만료 또는 인증 실패
   * @throws NotFoundError      job_id에 해당하는 job 없음
   */
  triggerReprocess(request: ManualReprocessRequest, sessionToken: string): Promise<{ new_job_id: string }>;

  /**
   * 수신된 Alert 목록을 반환한다.
   * CSC-07.07이 발행한 Alert 레코드를 조회한다.
   *
   * ICD 근거: UI-03 — "Alert 조회 — CSC-07.07이 발행한 Alert 목록 표시"
   *
   * @throws UnauthorizedError  세션 만료 또는 인증 실패
   * @status TBC — Alert 응답 스키마 미확정
   */
  getAlertList(filter: AlertFilter, sessionToken: string): Promise<unknown[]>; // 응답 스키마: TBC

  /**
   * 특정 Alert를 해제(acknowledged) 상태로 변경한다.
   * 운영자가 확인 후 조치 완료 시 호출한다.
   *
   * ICD 근거: UI-03 — "Alert 해제 — 운영자가 확인 후 해제 처리"
   *
   * @throws UnauthorizedError  세션 만료 또는 인증 실패
   * @throws NotFoundError      alertId에 해당하는 Alert 없음
   * @status TBC — Alert 해제 처리 흐름 미확정
   */
  resolveAlert(alertId: string, sessionToken: string): Promise<void>;
}
```

---

## 예외 타입

> **ICD 출처:** 5.4절 UI-03

| 예외                | ICD 근거 문장                                                  | 결론                            |
| ------------------- | -------------------------------------------------------------- | ------------------------------- |
| `UnauthorizedError` | UI-03: "운영자 인증" (인증 실패 가능성)                        | 자격 증명 불일치 또는 세션 만료 |
| `NotFoundError`     | UI-03: "job 상세 조회, Alert 해제" (미존재 리소스 요청 가능성) | 미존재 리소스 요청              |

```typescript
export class UnauthorizedError extends Error {} // 인증 실패 또는 세션 만료
export class NotFoundError extends Error {} // 미존재 리소스
```

---

## 의존 관계

> **ICD 출처:** 3.2절 OPS-02 5~7단계, 5.4절 UI-03

| 의존 대상                  | 호출 목적                                | ICD 근거 문장                                                        | 결론                 | 정의 위치            |
| -------------------------- | ---------------------------------------- | -------------------------------------------------------------------- | -------------------- | -------------------- |
| **CSU-09.01**              | job 목록/상세 조회, 재처리 트리거        | OPS-02 7단계: "운영자가 CSC-09 API를 통해 특정 job_id 재처리 트리거" | REST API 경유        | CSU-09.01 인터페이스 |
| **CSU-01.01** DB Interface | Alert 레코드 및 감사 로그 읽기 전용 조회 | UI-03 Alert 조회: "CSC-07.07이 발행한 Alert 목록" (DB 기록 기반)     | DB 접근은 CI-03 경유 | CI-03                |

---

## 미확정 항목

> **ICD 출처:** 5.4절 UI-03 미결 항목, 8.4절

| 우선순위 | 항목                                 | 상태 | ICD 근거 문장                                                              | 결론                                              | 해결 조건     |
| -------- | ------------------------------------ | ---- | -------------------------------------------------------------------------- | ------------------------------------------------- | ------------- |
| P1       | 운영자 인증 방식 (로컬 vs LDAP)      | TBC  | UI-03: "운영자 인증 — 로컬 또는 LDAP 기반 (인증 방식 TBC)"                 | 인증 방식 확정 전 login() 구현 불가               | 팀 내부 결정  |
| P1       | 운영자 계정 관리 체계                | TBC  | 8.4절: "운영자 계정 생성·비밀번호 정책·역할(Role) 정의 미확정"             | 계정 체계 확정 전 권한 제어 구현 불가             | 팀 내부 결정  |
| P2       | Alert 응답 스키마 및 Alert 유형 코드 | TBC  | UI-03 미결: "Alert 응답 JSON 스키마 및 alert_type 코드 목록 확정 필요"     | 스키마 확정 전 getAlertList() 응답 파싱 불가      | 팀 내부 결정  |
| P2       | job 상세 응답 스키마                 | TBC  | UI-03 미결: "job 상세 화면 표시 필드 목록 (감사 로그 포함 범위) 협의 필요" | 스키마 확정 전 getJobDetail() 통합 응답 구현 불가 | 팀 내부 결정  |
| P2       | Electron 패키징 및 배포 방식         | TBD  | 8.4절: "Electron 앱 빌드·배포 파이프라인 및 자동 업데이트 정책 미확정"     | 배포 방식 미확정 시 운영 환경 설치 절차 미결      | 팀 내부 결정  |
| P3       | 성능 리포트 UI 연동                  | TBD  | CSU-07.08 미확정 항목: "UI-03(운영자 콘솔)과의 연동 여부 결정 필요"        | CSU-07.08 연동 구현 여부 미결                     | UI-03 설계 후 |

---

## 관련 문서

- **UI-03** — 운영자 콘솔 기능 목록, 인증 방식, 배포 형태 (ICD 5.4절)
- **SI-06** — Alert 레코드 및 job 데이터 읽기 전용 조회 (ICD 6.7절)
- **CI-03** — CSU-01.01 DB Interface 사용 (ICD 6.8절)
- **CSU-09.01** — REST API 위임 (job 조회 및 재처리 트리거)
- **CSU-07.07** — Alert 발행 주체 (OPS-02 5단계)
- **CSU-07.08** — 성능 분석 데이터 조회 (OPS-02 6단계)
