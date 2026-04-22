# SDPE Frontend — 인증·사용자 관리 화면 기획서

**문서 번호**: SDPE-SCR-002
**버전**: v0.1
**작성일**: 2026-04-20
**관련 유즈케이스**: UC40(감사 로그), UC43~UC50
**관련 설계서**: SDPE-SAD-001 §14.2, REQ-SEC-002, REQ-SEC-005, AD-08

---

## 1. 문서 개요

본 문서는 USECASE.md 개정으로 신규 정의된 인증(UC43~UC46) 및 사용자 관리(UC47~UC50) 유즈케이스를 충족하기 위한 Frontend 화면 구성을 정의한다. 기존 `(planning)` / `(current)` Route Group 패턴과 LeftSidebar 내비게이션, Tailwind 디자인 토큰(`bg-card`, `border-border`, `text-muted-foreground`, `text-accent`, `text-[10px]~[12px]`)을 그대로 따른다.

### 1.1 SAD·ICD 교차 확인 결과 (2026-04-20)

본 기획은 SDPE-SAD-001, SDPE-ICD-001 v1.0 확인 결과를 반영한다.

| 교차 확인 항목 | SAD·ICD 기준 | 본 기획서에의 영향 |
| --- | --- | --- |
| 역할 체계 (AD-08) | Administrator / Operator / Analyst / Public 4역할. 콘솔 접근은 Operator 이상 | 콘솔 사용자 관리(UC48)는 Administrator / Operator 2역할만 생성 대상. Analyst·Public 은 SDPE 소비자 측 계정으로 별도 관리 |
| 감사 로그 (SAD CSU-08.06, REQ-SEC-005) | Administrator 전용. 서비스 로직은 CSC-08 소속 | UC40 이벤트 타입 확장은 CSC-08 측 스키마 변경 수반 — 백엔드 ICD 반영 필요 |
| CSC-09 API 표면 (SAD §14.4) | `/v1/products/*`, `/v1/stac/*`, `/v1/ogc/*`, `/v1/pipeline/*`, `/v1/audit/logs`, `/v1/processing/jobs` 만 정의. **인증·사용자 관리 엔드포인트 미정의** | UC43~UC50 충족을 위해 CSU-09.05 API Auth Manager 의 API 표면 확장 또는 신규 CSU 도입 필요. 제안 엔드포인트: `/v1/auth/login`, `/v1/auth/logout`, `/v1/auth/refresh`, `/v1/auth/password`, `/v1/admin/users`, `/v1/admin/users/{id}`, `/v1/admin/users/{id}/password-reset`. **ICD 개정 요청 항목** |
| 운영자 콘솔 구현체 (SAD AD-09 / ICD UI-03) | Electron + TypeScript + React. JWT 를 `safeStorage`(OS 키체인) 저장, 오프라인 부분 동작 지원 | 현재 저장소는 Next.js 웹 구현. **프레임워크 전제 불일치**로 본 기획서는 두 가지 배포 프로파일을 모두 수용:  ① Electron: `safeStorage`,  ② Next.js(사내망): httpOnly + Secure + SameSite=Strict 쿠키 (XSS 시 토큰 노출 방지). `localStorage` 저장은 금지 |
| 오프라인 동작 (ICD UI-03) | 서버 미연결 시 캐시 기반 읽기 전용 부분 동작 | 로그인 화면에 “서버 연결 불가 — 캐시된 데이터로 읽기 전용 모드 진입” 전환 버튼 추가 (§4.4) |
| JWT 알고리즘 (ICD UI-01) | RS256, Authorization: Bearer | 토큰 갱신 실패 판정 시 401 + `WWW-Authenticate: Bearer error="invalid_token"` 감지 후 `/login?redirect=...` 리디렉션 |
| 비밀번호 정책 (REQ-SEC-002) | 세부 수치 미정의(TBC) | 최소 12자·대/소/숫/특 1종씩은 기획서 제안치. 확정 시 본 문서 §5.2 업데이트 |
| 계정 잠금 정책 (REQ-SEC-002) | SAD·ICD 미정의 | 연속 5회 실패 시 임시 잠금을 제안치로 명시. 운영 정책 확정 시 업데이트 |

> **ICD 개정 요청 요약** — 본 기획서 구현을 위해 ICD 에 다음이 추가되어야 한다.  (1) UI-04 또는 UI-01 확장으로 `/v1/auth/*`, `/v1/admin/users*` 엔드포인트 정의,  (2) 인증 실패·사용자 관리 관련 SI-03 감사 이벤트 타입 추가,  (3) 계정 잠금·비밀번호 정책 수치 확정.

## 2. 화면 목록

| 화면 ID        | 화면명                   | 경로                                | 접근 권한           | 관련 UC       |
| -------------- | ------------------------ | ----------------------------------- | ------------------- | ------------- |
| SCR-AUTH-01    | 로그인                   | `/login`                            | 비인증(공개)        | UC43          |
| SCR-AUTH-02    | 비밀번호 변경 모달(본인) | 사이드바 프로필 영역 → 모달         | 인증 사용자         | UC46          |
| SCR-AUTH-03    | 최초 로그인 비밀번호 변경| `/login/reset` (강제 리디렉션)      | 임시 비밀번호 보유자 | UC50 후속      |
| SCR-USER-01    | 사용자 관리              | `/plan/users`, `/current/users`     | Administrator 전용  | UC47          |
| SCR-USER-02    | 사용자 생성/수정 모달    | SCR-USER-01 내                      | Administrator 전용  | UC48, UC49    |
| SCR-USER-03    | 비밀번호 초기화 확인     | SCR-USER-01 내                      | Administrator 전용  | UC50          |

---

## 3. 라우팅·권한 가드

- **로그인 화면** (`/login`)은 `(planning)` / `(current)` route group 외부에 둔다. LeftSidebar 및 PipelineServiceProvider 가 주입되지 않는 독립 레이아웃.
- **사용자 관리 페이지**는 기존 `(planning)/plan/<name>/<Name>Page.tsx` + `(current)/current/<name>/page.tsx` 래퍼 패턴을 따른다 (`AGENTS.md` 규칙 준수).
- Administrator 전용 페이지 가드는 감사 로그 페이지와 동일한 패턴으로 구현한다:
  - 현재: `RolePreviewSelect` + `useMockRole()` 로 역할 시뮬레이션
  - `role !== 'Administrator'` 시 Audit 페이지와 동일한 “권한 없음” 안내 화면(`FileText` 대신 `Users` 아이콘)을 표시
- LeftSidebar nav 항목 추가: 기존 배열 끝(`archive` 아래)에 `users` 항목을 추가하되, 현재 역할이 Administrator 일 때만 렌더링.

```ts
// LeftSidebar.tsx navItems 추가 예시
{ id: 'users', icon: Users, label: '사용자 관리', href: `${base}/users` },
```

- 토큰 만료(UC45 실패) 또는 비인증 접근 시 `/login?redirect=<원경로>` 로 리디렉션.

---

## 4. SCR-AUTH-01 로그인

### 4.1 레이아웃

LeftSidebar 없음. 뷰포트 전체 중앙 정렬. 기존 Audit 페이지의 “권한 없음” 블록과 동일한 카드 톤을 사용한다.

```
┌─────────────────────────────────────────────┐
│                                             │
│        [Activity icon · text-accent]        │
│           SDPE Pipeline Console             │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │  사용자명                              │  │
│  │  [ input ]                             │  │
│  │  비밀번호                              │  │
│  │  [ input ] [eye toggle]                │  │
│  │                                        │  │
│  │  [ 로그인 ]  ← accent, full-width      │  │
│  │                                        │  │
│  │  (실패 시) ⚠ 사용자명 또는 비밀번호 오류 │  │
│  └───────────────────────────────────────┘  │
│                                             │
│          v0.1.0 · Mock / Current            │
└─────────────────────────────────────────────┘
```

### 4.2 구성 요소

| 요소        | 스타일·동작                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------- |
| 컨테이너    | `min-h-screen flex items-center justify-center bg-background`                                 |
| 카드        | `w-full max-w-sm bg-card border border-border rounded-xl p-6 space-y-4`                       |
| 헤더        | `Activity` 아이콘(`w-6 h-6 text-accent`) + `text-sm font-bold tracking-tight`                 |
| Input       | `bg-background border border-border rounded-md px-3 py-2 text-xs focus:ring-1 focus:ring-accent` |
| 비밀번호 토글 | 우측 `Eye`/`EyeOff` 아이콘 버튼(`text-muted-foreground`)                                      |
| 제출 버튼   | `bg-accent text-background font-semibold rounded-md py-2 text-xs hover:opacity-90`            |
| 오류 배너   | `bg-destructive/15 text-destructive text-[11px] rounded-md px-3 py-2`                         |
| 푸터        | `text-[9px] text-muted-foreground` — 버전·환경(Mock/Current) 표시                             |

### 4.3 동작

1. 제출 → `service.로그인한다({ username, password })` 호출
2. 성공 → `redirect` 쿼리 파라미터로 원래 경로 복귀(기본 `/plan` 또는 `/current`)
3. 실패 → 오류 배너 표시. 연속 5회 실패 시 “계정 잠금 — 관리자에게 문의” 안내 (REQ-SEC-002, 5회 수치는 제안치)
4. 서버가 `requires_password_reset: true` 응답 시 SCR-AUTH-03 으로 리디렉션
5. 모든 시도는 감사 로그(LOGIN_SUCCEEDED / LOGIN_FAILED)로 기록

### 4.4 오프라인 모드 진입 (ICD UI-03 대응)

서버 연결 실패 시(타임아웃 또는 네트워크 오류), 로그인 카드 하단에 아래 경로를 제공한다. 캐시된 JWT 가 유효 기간 내일 때만 활성.

```
⚠ 서버에 연결할 수 없습니다.
[ 캐시 모드로 진입 (읽기 전용) ]
```

- 캐시 모드에서는 `RolePreviewSelect` 가 캐시된 Session 의 role 로 고정되고, 상단에 `bg-destructive/15` 배너 표시: “오프라인 모드 — 변경 작업은 재연결 후 가능합니다.”
- Next.js 배포 프로파일에서는 Service Worker 캐시 기반으로 제품 목록·Job 목록만 읽기 허용. Electron 배포 프로파일에서는 NAS 직접 마운트 기반 제품 확인 기능도 허용.

---

## 5. SCR-AUTH-02 비밀번호 변경 모달(본인)

### 5.1 진입점

`LeftSidebar.tsx` 하단 프로필 영역(현재 `operator-01` 고정 표시)을 버튼화하여 클릭 시 드롭다운:

- 비밀번호 변경 → 모달 SCR-AUTH-02
- 로그아웃 → UC44

### 5.2 구성

| 필드              | 비고                                   |
| ----------------- | -------------------------------------- |
| 현재 비밀번호     | 필수                                   |
| 새 비밀번호       | 정책 힌트 표시(최소 12자, 대/소/숫/특) |
| 새 비밀번호 확인  | 일치 검증                              |

- 모달 스타일: 파이프라인 생성 모달과 동일한 `bg-card border-border rounded-lg shadow-xl w-96 p-5`
- 성공 시 토스트 “비밀번호가 변경되었습니다” + 세션은 유지(선택적으로 재로그인 요구 정책은 백엔드 판단)
- 감사 로그 PASSWORD_CHANGED

---

## 6. SCR-AUTH-03 최초 로그인 비밀번호 변경

- 임시 비밀번호로 로그인한 사용자는 다른 어떤 경로로도 이동할 수 없으며, `/login/reset` 에 고정된다.
- SCR-AUTH-02 와 동일한 카드 UI. 단, “현재 비밀번호” 자리에 임시 비밀번호를 입력.
- 변경 완료 시 `/plan` 또는 `/current` 로 이동.

---

## 7. SCR-USER-01 사용자 관리

감사 로그 페이지(`AuditPage.tsx`)와 동일한 3단 구조를 차용한다: **상단 헤더 + Stats + 필터 → 테이블 + 우측 상세 패널 → 하단 Pagination**.

### 7.1 레이아웃

```
┌─ LeftSidebar (nav) ─┬──────────────── 메인 ────────────────────────┐
│ 오버뷰               │ ┌ Users 아이콘  사용자 관리  n건  ·  [+ 추가] │
│ 파이프라인           │ ├───────────────────────────────────────────┤
│ 실행 작업            │ │ [전체 n]  [활성 n]  [비활성 n]  [Admin n]  │  ← StatCard (4개)
│ 처리 프로파일        │ │ [Operator n]                               │
│ 제품                 │ ├───────────────────────────────────────────┤
│ 큐 모니터링          │ │ [검색 input] [역할 select] [상태 select]  │  ← 필터
│ 알림                 │ ├───────────────────────────────┬────────── │
│ 감사 로그            │ │ 사용자명 │ 이메일 │ 역할 │ 상태 │ 최근 로그인│  ← 테이블
│ ★ 사용자 관리 (Admin)│ │ ...                          │ (상세 패널)│
│ 아카이브             │ ├───────────────────────────────┤           │
│                      │ │ Pagination                    │           │
└──────────────────────┴───────────────────────────────────────────┘
```

### 7.2 헤더

- 아이콘: `Users` (lucide) `w-4 h-4 text-accent`
- 타이틀: `text-sm font-semibold text-foreground` — “사용자 관리”
- 건수: `text-[10px] text-muted-foreground font-mono` — `{total}건`
- 우측: `RolePreviewSelect` + 조건부 `필터 초기화` + **`+ 사용자 추가`** primary 버튼 (`bg-accent text-background px-2.5 py-1 rounded-md text-[11px] font-semibold`)

### 7.3 Stats 카드

감사 로그의 `StatCard` 컴포넌트를 재사용. 5개 카드:

| 라벨         | count 계산              | 아이콘        | 색상            |
| ------------ | ----------------------- | ------------- | --------------- |
| 전체         | 전체 사용자 수          | `Users`       | `text-accent`   |
| 활성         | `active === true`       | `UserCheck`   | `text-success`  |
| 비활성       | `active === false`      | `UserX`       | `text-muted-foreground` |
| Administrator| `role === 'Administrator'` | `Shield`   | `text-accent`   |
| Operator     | `role === 'Operator'`   | `UserCog`     | `text-muted-foreground` |

클릭 시 해당 필터 토글.

### 7.4 필터 바

감사 로그와 동일한 `flex items-center gap-3 px-5 py-2.5 border-b border-border` 레이아웃.

- 검색: 사용자명/이메일 `input`
- 역할 `select`: 전체 / Administrator / Operator
- 상태 `select`: 전체 / 활성 / 비활성

### 7.5 테이블 컬럼

| 컬럼          | 렌더링                                                       |
| ------------- | ------------------------------------------------------------ |
| 사용자명      | `font-mono text-accent` 링크 — 클릭 시 상세 패널 열림         |
| 이메일        | `text-muted-foreground`                                       |
| 역할          | Badge: Administrator → `bg-accent/15 text-accent`, Operator → `bg-muted/50 text-muted-foreground` |
| 상태          | Badge: 활성 → `bg-success/15 text-success`, 비활성 → `bg-destructive/15 text-destructive` |
| 최근 로그인   | `formatKST(lastLoginAt)` (미로그인 시 `—`)                   |
| 생성일        | `formatKST(createdAt)`                                        |

정렬: 사용자명, 역할, 상태, 최근 로그인, 생성일. `AuditPage` 의 `SortIcon` 재사용.

Pagination 컴포넌트: `AuditPage` 의 `Pagination` 재사용.

### 7.6 상세 패널 (우측)

감사 로그의 DetailPanel과 동일한 슬라이드 패턴(`w-95 transition translate-x`).

```
┌─ 이벤트 상세 ────────────────── [X]┐
│ [역할 Badge]                        │
│ 사용자명 · 이메일 · 상태            │
│                                     │
│ ─────────── 기본 정보 ───────────── │
│ 사용자 ID       생성일              │
│ 역할            최근 로그인         │
│ 활성 상태       최근 IP             │
│                                     │
│ ─────────── 액션 ─────────────────  │
│ [ 편집 ]   [ 비밀번호 초기화 ]       │
│ [ 비활성화 ]  (Admin 본인 제외)      │
│                                     │
│ ─────────── 최근 활동 ────────────  │
│ · 2026-04-20 10:21 LOGIN_SUCCEEDED  │ ← 감사 로그 중 operatorId = 본 사용자인 최근 10건
│ · ...                               │
│                                     │
│ [ 감사 로그에서 전체 보기 → ]        │
└─────────────────────────────────────┘
```

- 본인 비활성화/역할 변경은 UI에서 차단 (“본인 계정은 수정할 수 없습니다” 툴팁)
- 마지막 Administrator 비활성화 차단 (“최소 1명의 Administrator 가 필요합니다”)

### 7.7 권한 없음 안내(Operator 접근 시)

감사 로그 페이지와 1:1 패턴 매칭:

```tsx
<div className="flex-1 flex items-center justify-center bg-background">
  <div className="max-w-sm text-center">
    <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
    <h2 className="text-sm font-semibold text-foreground">사용자 관리는 Administrator 전용입니다</h2>
    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
      Operator 역할은 본인 비밀번호 변경은 가능하지만, 다른 사용자 계정 관리 권한은 없습니다.
    </p>
  </div>
</div>
```

---

## 8. SCR-USER-02 사용자 생성/수정 모달

생성/수정 공용. 파이프라인 생성 모달과 동일한 톤.

| 필드              | 생성 | 수정 | 비고                                                        |
| ----------------- | ---- | ---- | ----------------------------------------------------------- |
| 사용자명          | ✓    | ✗(읽기 전용) | 영문/숫자, 소문자 kebab-case 권장                      |
| 이메일            | ✓    | ✓    | 중복 검증                                                   |
| 역할              | ✓    | ✓    | `Administrator` / `Operator` 라디오                         |
| 초기 비밀번호     | ✓    | ✗    | 정책 힌트 표시. 서버 생성 옵션 가능                         |
| 활성 상태         | 기본 활성 | ✓ | 토글                                                        |

- 저장 버튼: `bg-accent text-background` primary
- 취소: `border border-border text-muted-foreground`
- 성공 시 토스트 + 목록·StatCard 갱신
- 감사 로그 USER_CREATED / USER_UPDATED / USER_ROLE_CHANGED / USER_DEACTIVATED

---

## 9. SCR-USER-03 비밀번호 초기화 확인

2단계 모달:

1. **확인 단계** — “{사용자명} 의 비밀번호를 초기화하시겠습니까? 기존 비밀번호는 즉시 폐기됩니다.” `bg-destructive/15 text-destructive` 경고 배너. 확인 입력(사용자명 재입력) → `초기화` 버튼 활성.
2. **결과 단계** — 생성된 임시 비밀번호를 **1회만** 노출. `font-mono text-base bg-background border border-border rounded-md px-3 py-2 select-all`. 복사 버튼 + “이 창을 닫으면 다시 볼 수 없습니다” 안내.

감사 로그 PASSWORD_RESET.

---

## 10. 서비스 인터페이스 확장

`services/pipeline.service.interface.ts` (또는 새 파일 `services/auth.service.interface.ts`)에 다음 메서드를 추가한다. 네이밍 컨벤션은 기존 한글 동사형(`감사로그를_조회한다`)을 따른다.

```ts
// 인증
로그인한다(req: { username: string; password: string }): Promise<Result<Session>>;
로그아웃한다(): Promise<Result<void>>;
토큰을_갱신한다(): Promise<Result<Session>>;
본인_비밀번호를_변경한다(req: { currentPassword: string; newPassword: string }): Promise<Result<void>>;
현재_사용자를_조회한다(): Promise<Result<User>>;

// 사용자 관리 (Admin)
사용자목록을_조회한다(req: UserListQuery): Promise<Result<Page<User>>>;
사용자를_생성한다(req: CreateUserRequest): Promise<Result<User>>;
사용자를_수정한다(id: string, req: UpdateUserRequest): Promise<Result<User>>;
사용자를_비활성화한다(id: string): Promise<Result<void>>;
사용자_비밀번호를_초기화한다(id: string): Promise<Result<{ temporaryPassword: string }>>;
```

Mock 구현은 `(planning)/_services/` 에, 실제 API 구현은 `(current)/_services/` 에 추가한다 (기존 Split 유지).

## 11. 타입 정의

`src/types/user.ts` (신규):

```ts
export type Role = 'Administrator' | 'Operator';

export interface User {
  id: string;
  username: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  requiresPasswordReset: boolean;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
  expiresAt: string;
}
```

`src/types/pipeline.ts` 의 `AuditEventType` 에 다음을 추가:

```
| 'LOGIN_SUCCEEDED' | 'LOGIN_FAILED'
| 'USER_CREATED' | 'USER_UPDATED' | 'USER_ROLE_CHANGED' | 'USER_DEACTIVATED'
| 'PASSWORD_RESET' | 'PASSWORD_CHANGED'
```

그리고 `AuditPage.tsx` 의 `EVENT_CONFIG` 에 각 항목의 label/icon/color 를 추가한다 (예: LOGIN_FAILED 는 `Shield` + `text-destructive`).

---

## 12. 초기 관리자 부트스트랩

외부 가입 절차가 없으므로 최초 관리자 계정은 다음 중 한 가지 방식으로 생성한다. 프론트엔드 화면 범위 외이며, 백엔드/운영 문서에 별도 정의한다.

1. DB 마이그레이션 시드 — `sdpe-database` 패키지에 `seed-admin` 스크립트
2. 환경변수 기반 초회 부팅 — `ADMIN_BOOTSTRAP_USERNAME` 제공 시 미존재하면 생성
3. 운영 CLI — `npm run user:create --role=Administrator`

선택 결정은 SAD 14.2 / REQ-SEC-002 개정 시 명시한다.

---

## 13. 체크리스트

- [ ] LeftSidebar `users` nav 항목 추가 + Admin 전용 렌더 가드
- [ ] `/login`, `/login/reset` route group 외부 라우트 작성
- [ ] `(planning)/plan/users/UsersPage.tsx`, `(planning)/plan/users/page.tsx`
- [ ] `(current)/current/users/page.tsx` (UsersPage 래퍼)
- [ ] `IPipelineUIService` 또는 신규 `IAuthService` 인터페이스 확장 + Mock/Current 구현
- [ ] `AuditEventType` 확장 + `EVENT_CONFIG` 엔트리 추가
- [ ] 사이드바 하단 프로필 드롭다운 (비밀번호 변경 / 로그아웃)
- [ ] `useMockRole()` 훅을 실제 세션 역할로 치환 (Current 환경)
- [ ] 토큰 만료 시 `/login?redirect=...` 리디렉션 인터셉터 (Current fetch 래퍼)
