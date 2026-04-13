# SDPE Pipeline Console — 설계서

> CSC-08 Pipeline Orchestrator를 중심으로 SDPE(SAR Data Process Element) 전체 CSC를
> "한 눈에" 관리하기 위한 n8n 스타일 운영 콘솔의 설계 문서입니다.
>
> 작성일: 2026-04-10 / 대상 브랜치: `interface/명세-정의`

---

## 1. 목적과 범위

### 1.1 목적
- 위성 수신 → L0~L3 처리 → 등록까지의 **파이프라인 전 구간을 시각화**한다.
- CSC-02~07이 발행/소비하는 메시지(SI-01·SI-03·SI-04·SI-05·SI-07·SI-08)와 작업(Job) 상태를
  운영자가 **그래프 형태로 즉시 파악**할 수 있게 한다.
- 자동 재시도 / 수동 재처리 / 부분 재처리(OPS-05·OPS-06) 등 운영 시나리오를
  **클릭 몇 번으로 안전하게 수행**할 수 있게 한다.
- ICD에서 TBC/TBD로 남아 있는 항목에 대해 **운영자가 보조 입력으로 메우는 UI**를 제공한다.

### 1.2 범위 (In)
- 파이프라인 토폴로지 뷰 (n8n 스타일 노드 그래프)
- Job/Step 실시간 상태 모니터링
- Alert·실패 큐 처리, 수동 재처리(SI-07) 발행
- 처리 프로파일·DAG 정의의 읽기/검토 (편집은 v2)
- 감사 로그(CSU-08.06)·성능 분석(CSU-08.08) 뷰

### 1.3 비범위 (Out, v1)
- 실제 SAR 알고리즘 파라미터 튜닝 UI (FI 시그니처 미확정)
- CSC-09 Data API 카탈로그 검색 UI (CSC-09 자체 콘솔로 이관 예정)
- 사용자 셀프 가입 (운영자 계정은 CSC-01 IAM 모듈에서 발급)

---

## 2. 사용자 & 핵심 시나리오

| 페르소나 | 일상 업무 | 콘솔에서 가장 자주 보는 것 |
|---|---|---|
| **운영자(Operator)** | 파이프라인 상태 감시, 실패 대응 | 대시보드, Alert, Job 상세 |
| **분석가/LIID** | 부분 재처리 트리거, 산출물 점검 | 파이프라인 그래프, 재처리 폼 |
| **시스템 관리자(SA)** | 큐/DB/NAS 헬스 점검 | 인프라 헬스 패널, 감사 로그 |
| **알고리즘 담당자** | 처리 프로파일·DAG 검토 | 프로파일 상세, 처리 시간 분포 |

### 2.1 운영 시나리오 매핑 (ICD OPS와 1:1)
| OPS | 콘솔 화면 | 콘솔에서 발생하는 액션 |
|---|---|---|
| OPS-01 원시 데이터 수신 | 대시보드 / Inflight 그래프 | (자동) `sdpe.reception.events` 노드에 펄스 표시 |
| OPS-02 SAR 신호처리 | Job 상세 그래프 | 단계별 노드에 진행/완료/소요 시간 오버레이 |
| OPS-03 분석·등록 | Job 상세 그래프 | L1 이후 `catalog.registration` 트리거 노드 점등 |
| OPS-05 실패·재시도 | Alert 보드 + Job 상세 | 운영자가 원인 확인 → "수동 재처리" 버튼으로 SI-07 발행 |
| OPS-06 부분 재처리 | 재처리 다이얼로그 | `target_level` 선택 후 SI-07 발행 |

---

## 3. 아키텍처 개요

```
┌────────────────────────┐         REST/SSE/WS         ┌────────────────────────────┐
│ Next.js Frontend       │ ◀──────────────────────────▶│ pipeline-workflow-subsystem│
│ (frontend/, App Router)│                              │   csc08-orchestrator        │
└─────────┬──────────────┘                              └────────────┬───────────────┘
          │                                                          │ pgmq / TypeORM
          │                                              ┌────────────┴───────────────┐
          │                                              │ CSC-01 (DB/NAS/Geo)        │
          │                                              │ CSC-02..07 큐/이벤트       │
          ▼                                              └────────────────────────────┘
   브라우저 (운영자)
```

- **프론트는 직접 pgmq에 붙지 않는다.** 모든 데이터는 PWS(Pipeline Workflow Subsystem)가 노출한
  HTTP/SSE 게이트웨이를 통해서만 읽고/쓴다. (보안·DB 마이그레이션 역영향 최소화)
- 실시간성은 1차로 **SSE**(`text/event-stream`), 양방향 액션 필요 시 WebSocket으로 확장한다.
- 프론트 자체는 SSR이 거의 필요 없는 운영 콘솔이므로 **App Router + 서버 컴포넌트는 인증/초기 데이터 hydration용**에 한정하고, 노드 그래프·실시간 보드는 클라이언트 컴포넌트로 둔다.

### 3.1 백엔드에 추가로 필요한 엔드포인트 (PWS에 신설 요청)

`apps/pipeline-workflow-subsystem`에 thin REST 레이어가 필요합니다. 현재
`csc08-orchestrator.interface.ts`에 정의된 `JobStatusResult`·`PipelineExecutionResult`·`ReprocessParams`를
그대로 직렬화해도 v1에 충분합니다.

| Method | Path | 용도 | 매핑되는 Use case / Handler |
|---|---|---|---|
| `GET`  | `/api/v1/pipelines` | 파이프라인 정의(DAG 템플릿) 목록 | (신설) 처리 프로파일 → DAG 변환 결과 |
| `GET`  | `/api/v1/jobs?status=&from=&to=&limit=` | Job 페이지네이션 조회 | `GetJobStatusHandler` 확장 |
| `GET`  | `/api/v1/jobs/{jobId}` | Job 단건 + 단계별 진행 | `GetPipelineExecutionHandler` |
| `POST` | `/api/v1/jobs/{jobId}/reprocess` | 수동 재처리 트리거 | `ReprocessPipelineHandler` (SI-07 경유) |
| `POST` | `/api/v1/jobs/reprocess` | scene_id 기반 재처리 | `ReprocessPipelineUseCase` |
| `GET`  | `/api/v1/alerts?ack=false` | 미확인 Alert | `JobFailedAlertHandler` 결과 저장소 조회 |
| `POST` | `/api/v1/alerts/{id}/ack` | Alert ack | (신설) |
| `GET`  | `/api/v1/audit?jobId=` | 감사 로그 | `StepCompletedAuditHandler` 결과 조회 |
| `GET`  | `/api/v1/queues/health` | 큐별 깊이/지연 | pgmq metrics view |
| `GET`  | `/api/v1/stream/jobs` (SSE) | Job/Step 이벤트 스트림 | `processing-event.message-handler` 관찰 |
| `GET`  | `/api/v1/stream/reception` (SSE) | 수신 이벤트 스트림 | `reception-event.message-handler` 관찰 |

> ⚠️ 위 엔드포인트는 **본 설계서가 PWS 측에 요구하는 항목**입니다. 실제 PR로 PWS에 추가될 때까지
> 프론트는 `frontend/src/lib/api/__mocks__` 의 fixture로 개발한다.

---

## 4. 화면 구성 (IA)

```
/ (대시보드)
├─ /pipelines
│   └─ /pipelines/[id]              # DAG 토폴로지 (n8n 스타일, 정의 뷰)
├─ /jobs
│   ├─ /jobs                        # Job 리스트 + 필터
│   └─ /jobs/[jobId]                # Job 그래프 (실시간 진행 오버레이)
├─ /alerts                          # Alert 큐 + ack
├─ /servers                         # CSC 서버/큐 헬스
├─ /audit                           # 감사 로그
└─ /settings
    ├─ /settings/profiles           # 처리 프로파일 (read)
    └─ /settings/access             # 사용자/권한 (read v1)
```

### 4.1 핵심 화면 — Job 그래프 (`/jobs/[jobId]`)
- 노드: `RAW_DATA_RECEIVED`, `CSC-02 수집`, `CSC-03 L0`, `CSC-04 L1`, `CSC-05 L2`, `CSC-06 L3`, `CSC-07 등록`
- 각 노드 상태: `pending` / `running(VT 진행률 바)` / `completed` / `failed(retry n/3)`
- 노드 클릭 → 우측 패널에 SI-03 이벤트 raw, error_code/error_message, NAS 경로 표시
- 헤더에 `job_id`, `scene_id`, `acquisition_*`, 누적 소요 시간 (목표 14,400초 대비)

### 4.2 핵심 화면 — 대시보드 (`/`)
- 좌측: Inflight Job 카운트, 최근 24h 성공/실패 추이
- 중앙: 큐별 깊이 바 (`reception.events`, `processing.events`, `jobs.csc03~06`, `catalog.registration`)
- 우측: 미확인 Alert 5개 + "수동 재처리" 바로가기

### 4.3 n8n 스타일 그래프 — 기술 선택
- 라이브러리: **`@xyflow/react` (React Flow)** — 노드/엣지/미니맵/줌 기본 제공, MIT
- 레이아웃: **`dagre`** 로 좌→우 자동 정렬
- 노드는 컴파운드 SVG 컴포넌트 (`status × csc × level`)로 정의
- 실시간 업데이트는 SSE 이벤트를 Zustand 스토어에 머지 → React Flow `nodes`/`edges` 셀렉터가 부분 리렌더

---

## 5. 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | **Next.js 16 (App Router)** | `frontend/`에 scaffold 완료. 서버 컴포넌트는 인증·초기 hydration 한정 |
| 언어 | TypeScript strict | 루트 모노레포와 동일 ESLint/Prettier 규칙 적용 (5장 6절) |
| 스타일 | Tailwind CSS v4 | scaffold 기본값 |
| UI 컴포넌트 | **shadcn/ui** | 다이얼로그/테이블/토스트 등. Radix 기반 접근성 |
| 그래프 | `@xyflow/react` + `dagre` | n8n 스타일 토폴로지 |
| 상태 | **Zustand**(클라이언트 UI 상태) + **TanStack Query**(서버 상태) | SSE 머지가 쉬운 조합 |
| 폼 | `react-hook-form` + `zod` | 재처리·필터 폼의 강타입 검증 |
| 차트 | `Recharts` | 처리 시간/큐 깊이 |
| 실시간 | **SSE** (1차) / WebSocket (확장) | 운영망 프록시 호환성 우선 |
| i18n | `next-intl` | **한국어 1차**, 영어 2차 |
| 인증 | OIDC (CSC-01 IAM) → `next-auth` provider | v1: 단일 SSO |
| 테스트 | Vitest + React Testing Library, Playwright(E2E) | 모노레포 Jest와 분리 |
| 패키지 | npm (모노레포 정책 유지) | `npm install` 은 `frontend/`에서 별도 실행 |

### 5.1 모노레포 통합 메모
- `frontend/`는 NestJS 모노레포(`nest-cli.json`)와 **분리된 별도 프로젝트**로 둔다.
  → Nest CLI가 frontend 디렉터리를 빌드 타깃으로 잡지 않게 하기 위함.
- 루트 `package.json`의 lint/test 스크립트는 frontend를 재귀 호출하지 않는다.
  → CI에서는 별도 job (`frontend-ci`)으로 분리해 Node 22에서 실행한다.
- 공유 타입(`@sdpe/shared`의 csc08 message interface)을 재사용하려면
  - (a) `tsconfig.json` paths 로 직접 참조 (모노레포 경계 위반)
  - (b) **권장**: `libs/sdpe-shared` 의 csc08 메시지 타입을 별도 npm 패키지(`@sdpe/contracts`)로 분리해 frontend에서도 import
  - v1은 (a) 미적용 + 수기 복제 → v2에서 (b)로 정리

---

## 6. 데이터 모델 & API 계약 (프론트 관점)

`libs/sdpe-shared/src/csc08/message/*.interface.ts`의 타입을 그대로 따라간다.
프론트는 **Job + Step + Event** 세 도메인만 안다.

```ts
// frontend/src/types/job.ts (수기 복제 v1)
// 백엔드(libs/sdpe-shared)와 일치시킬 것
// 백엔드: CREATED → ASSIGNED → COMPLETED | FAILED
// 프론트는 표시 편의상 매핑: CREATED→PENDING, ASSIGNED→RUNNING
export type JobStatus = 'CREATED' | 'ASSIGNED' | 'COMPLETED' | 'FAILED' | 'CANCELED';
export type StepStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
export type ProductLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';
// CSC-02(수집)~CSC-07(등록)까지 DAG 전체 단계 포함
export type TargetCsc = 'CSC-02' | 'CSC-03' | 'CSC-04' | 'CSC-05' | 'CSC-06' | 'CSC-07';

// UI 표시용 매핑 (백엔드 상태 → 운영자 친화 라벨)
export const JOB_STATUS_DISPLAY: Record<JobStatus, string> = {
  CREATED: 'PENDING',
  ASSIGNED: 'RUNNING',
  COMPLETED: 'DONE',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
};

export interface JobSummary {
  jobId: string;
  sceneId: string;
  status: JobStatus;
  currentLevel: ProductLevel | null;
  currentTargetCsc: TargetCsc | null;
  retryCount: number;
  startedAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
}

export interface PipelineStep {
  order: number;
  targetCsc: TargetCsc;
  productLevel: ProductLevel;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  outputPath?: string;
}

export interface JobDetail extends JobSummary {
  steps: PipelineStep[];
  acquisitionStart: string;
  acquisitionEnd: string;
  receivedAt: string;
}
```

### 6.1 SSE 이벤트 스키마
```
event: job.updated
data: { "jobId": "...", "status": "RUNNING", "currentLevel": "LEVEL_1" }

event: step.updated
data: { "jobId": "...", "order": 2, "status": "COMPLETED", "durationMs": 5421000 }

event: alert.created
data: { "id": "...", "jobId": "...", "kind": "MAX_RETRY", "message": "..." }
```
- 백프레셔: 클라이언트가 200ms 간격으로 머지(throttle)하여 React Flow를 갱신.
- 재연결: `Last-Event-ID` 헤더로 중복 없이 이어받는다.

---

## 7. 디렉터리 구조 (frontend/)

```
frontend/
├─ docs/
│  └─ DESIGN.md              # ← 본 문서
├─ public/
├─ src/
│  ├─ app/
│  │  ├─ (dashboard)/page.tsx
│  │  ├─ jobs/page.tsx
│  │  ├─ jobs/[jobId]/page.tsx
│  │  ├─ pipelines/[id]/page.tsx
│  │  ├─ alerts/page.tsx
│  │  ├─ servers/page.tsx
│  │  ├─ audit/page.tsx
│  │  ├─ layout.tsx
│  │  └─ globals.css
│  ├─ components/
│  │  ├─ graph/             # React Flow 노드/엣지/오버레이
│  │  ├─ layout/            # 사이드바, 헤더, 토스트
│  │  └─ ui/                # shadcn/ui 래핑
│  ├─ features/
│  │  ├─ jobs/              # 쿼리·뮤테이션·셀렉터
│  │  ├─ alerts/
│  │  ├─ pipelines/
│  │  └─ audit/
│  ├─ lib/
│  │  ├─ api/               # fetch 래퍼, SSE 클라이언트
│  │  │  └─ __mocks__/      # PWS 미배포 시 fixture
│  │  ├─ auth/              # next-auth + OIDC provider
│  │  └─ format/            # 시간/바이트/한국어 로케일
│  ├─ store/                # Zustand
│  └─ types/                # 도메인 타입 (수기 복제 v1)
├─ tests/
│  ├─ unit/
│  └─ e2e/
├─ next.config.ts
├─ tsconfig.json
└─ package.json
```

---

## 8. 보안 / 인증 / 권한

- **단일 SSO**: CSC-01 IAM이 발급하는 OIDC 토큰을 next-auth로 검증한다.
- **권한 모델 (v1)**:
  - `viewer` — 읽기 전용
  - `operator` — Alert ack, 수동 재처리 발행
  - `admin` — 처리 프로파일 조회, 사용자 관리
- **모든 mutation 엔드포인트는 CSRF 토큰 + RBAC 게이트** 통과 필수.
- 운영망은 외부망과 분리되어 있으므로 next-auth 콜백 URL은 내부 도메인만 허용.
- **민감 정보 마스킹**: NAS 절대 경로의 사용자명/호스트는 표시 시 마스킹(`/mnt/.../scene_xxx.h5`).

---

## 9. 운영·관측성

| 항목 | 방식 |
|---|---|
| 프론트 로깅 | 구조화 로그 (`pino-browser`) → 백엔드 `/api/v1/clientlog` 수집 |
| 에러 트래킹 | Sentry self-hosted (운영망), 소스맵 업로드는 CI에서 |
| 사용자 액션 감사 | 모든 mutation은 `X-Operator-Id` 헤더로 백엔드 audit에 기록 |
| 성능 측정 | Web Vitals → 자체 수집 (외부 SaaS 비사용) |
| Health check | `/api/v1/queues/health` 와 동일 데이터를 우상단 글로벌 배지로 노출 |

---

## 10. 접근성·UX

- **WCAG 2.1 AA** 목표. shadcn/ui + Radix 기본 준수, 추가로
  - 그래프 노드는 키보드 포커스 가능 (`tabindex`, `aria-label`)
  - 상태 색상은 색맹 안전 팔레트 + 아이콘 병기
  - 모든 토스트는 `aria-live="polite"`
- 다크 모드 1차 (운영실 야간 근무)
- 한국어 1차, 시간은 KST 표시 + 호버 시 UTC 툴팁

---

## 11. 테스트 전략

| 레벨 | 도구 | 무엇을 |
|---|---|---|
| 유닛 | Vitest + RTL | 셀렉터/리듀서/포매터 |
| 컴포넌트 | RTL + MSW | 쿼리 훅 + SSE 머지 동작 |
| 그래프 | Playwright 컴포넌트 모드 | React Flow 렌더링 + 키보드 탐색 |
| E2E | Playwright | OPS-02 정상 흐름, OPS-05 재시도 흐름, OPS-06 부분 재처리 |
| 시각 회귀 | Playwright snapshot | 노드 상태 8종 |
| 접근성 | `@axe-core/playwright` | 페이지별 위반 0건 게이트 |

---

## 12. 단계별 로드맵

| Phase | 산출물 | 의존성 |
|---|---|---|
| **P0 (이번 PR)** | `frontend/` scaffold, 본 설계서 | — |
| **P1** | 대시보드 + Job 리스트 (mock 데이터) | mock fixture |
| **P2** | Job 그래프 + SSE 실시간 머지 | PWS REST/SSE 게이트웨이 |
| **P3** | Alert ack / 수동 재처리 / 부분 재처리 | SI-07 전달 매체 확정 (TBC) |
| **P4** | 감사 로그·성능 분석·큐 헬스 | StepCompletedAuditHandler 결과 저장소 |
| **P5** | RBAC + i18n + 다크 모드 | CSC-01 IAM OIDC |
| **v2** | 처리 프로파일 편집, DAG 시뮬레이션 | FI 시그니처 확정 |

---

## 13. 리스크 & 미확정 항목

| ID | 항목 | 원인 | 대응 |
|---|---|---|---|
| R-1 | SI-07 전달 매체 미확정 (REST vs pgmq) | ICD 8절 TBC | v1은 REST 가정, 추후 어댑터 분리 |
| R-2 | SI-08 스키마 미설계 | sar_products 선행 | 등록 완료 노드는 상태 미표시(회색)로 노출 |
| R-3 | error_code 체계 부재 | 각 CSC 취합 필요 | 프론트는 `error_message`만 표시, code는 raw 보기 |
| R-4 | satellite_id/mode/polarization 코드 미정 | 위성팀 협의 | 표시는 raw, 필터는 자유 텍스트 |
| R-5 | PWS REST 레이어 부재 | 본 설계가 신설 요청 | mock 우선, P2 진입 전 PWS 합의 필요 |
| R-6 | 운영망 외부 SaaS 차단 | 보안 정책 | Sentry self-hosted, 폰트/아이콘 self-host |

---

## 14. 검토 보강 — 누락 / 개선 항목

> 본 섹션은 13장 리스크 외에 **superpowers 검토 관점**(데이터 흐름, 실시간성, 권한,
> 운영 실수 방지, 관측성, 접근성, 배포)에서 1~13장에서 빠졌거나 더 정교화가 필요한 항목을
> 정리합니다. 각 항목에 우선순위를 표기합니다.
> **🟥 Critical** = P1~P2 진입 전 결정 필요 / **🟧 High** = P3 전 / **🟨 Med** = P4~P5 / **🟩 Low** = v2

### 14.1 신뢰성·실수 방지 (운영자 액션의 안전성)
- **🟥 Idempotency-Key 필수화** — `POST /jobs/{id}/reprocess` 등 모든 mutation은
  클라이언트가 UUID를 생성해 `Idempotency-Key` 헤더로 보낸다. 더블클릭/재전송 시 백엔드가
  동일 키를 1회만 처리. 미구현 시 운영자가 같은 재처리를 두 번 트리거할 수 있음.
- **🟥 위험 액션 2단계 확인** — 부분 재처리(target_level = LEVEL_0)·전체 큐 비우기·
  대량 재처리는 *입력 확인 다이얼로그*(Job ID 직접 타이핑)로 두 번 확인.
- **🟧 Optimistic concurrency** — Alert ack/Job 취소 시 백엔드에 `If-Match: <version>`
  헤더 동반. 동시 두 운영자 ack 충돌을 409로 거절하고 토스트로 알린다.
- **🟧 Stale data banner** — SSE가 15초 이상 끊기면 화면 상단에 "데이터가 N초 전입니다"
  배너 + 재연결 카운트다운. 운영자가 죽은 화면을 살아 있는 줄 착각하지 않도록.
- **🟨 권한 미달 시 사유 표시** — 비활성화된 버튼에 호버 시 "operator 권한 필요"처럼
  *왜* 막혔는지 표시. 권한 모델 학습 곡선 단축.
- **🟨 액션 취소 (Undo 토스트)** — Alert ack/Job 취소 후 5초 동안 "되돌리기" 토스트.
  실수 ack 빈도가 높을 것으로 예상되는 새벽 근무 시간대에 특히 유효.

### 14.2 데이터 흐름·일관성
- **🟥 Schema version negotiation** — 프론트는 `schema_version: '1.0'`만 처리.
  미래 버전 수신 시 그래프 노드에 `schema mismatch` 배지 표시 + raw 보기 강제.
  무지성 파싱으로 잘못된 상태가 그래프에 그려지는 사고를 차단.
- **🟥 SSE 이벤트 순서 보장** — `Last-Event-ID` 재전송으로 누락은 막지만 *순서 역전*은
  남는다. 클라이언트 머지 시 `(jobId, order, updatedAt)` 단조 증가만 적용 (역행 무시).
- **🟧 Clock skew 표시** — 서버 응답의 `Date` 헤더와 브라우저 시각의 차이가 5초 이상이면
  하단 상태바에 표시. SAR 운영실은 NTP 동기화가 필수이므로 가시화 자체가 안전장치.
- **🟧 시각 표시 규약** — 모든 타임스탬프는 KST 표시 + 호버 시 UTC + epoch ms.
  `acquisition_*`(촬영)과 `received_at`(수신)·`updatedAt`(처리)을 색상으로 구분.
- **🟧 NAS 경로 마스킹 토글** — 기본은 마스킹, 권한자가 명시적으로 토글해야 풀 경로 노출.
  shoulder surfing 방지.

### 14.3 운영 가시성 (현재 화면에 빠진 데이터)
- **🟥 VT 카운트다운** — 각 단계 노드에 "큐 메시지가 N분 후 재출현" 카운트다운.
  CSC 처리기가 침묵하면 운영자가 *왜 진척이 없는지* 즉시 보여야 함.
  csc03=3,600 / csc04=9,000 / csc05=2,700 / csc06=1,800초 (ICD 6.6 확정값) 사용.
- **🟥 파이프라인 SLA 카운트다운** — Job 헤더에 14,400초 대비 경과/잔여 + 진행률 바.
  "2시간 이상 지연" Alert 임계값(ICD 3.7)을 동일 바에 표시.
- **🟧 CSC 처리기 버전·인스턴스 ID** — Job 상세에 "CSC-04 v1.4.2 / pod-7"처럼
  실제 처리한 인스턴스를 노출. 회귀 발생 시 어느 빌드가 원인인지 즉시 추적.
- **🟧 Data lineage 트리** — `raw_data_path` → `output_path(L0)` → `output_path(L1)` …
  파일 단위 계보를 트리/그래프로. 산출물 회수·재처리 영향 범위 계산에 필수.
- **🟧 큐 백프레셔 가시화** — 큐 깊이가 임계값 초과 시 토폴로지 엣지 굵기/색 변경.
  처리 병목이 어느 단계인지 한눈에 보이게.
- **🟨 처리량 대비 잔여 시간 예측** — 최근 1h 평균 throughput 기반 "현재 백로그
  소진까지 N시간". capacity planning에 도움.
- **🟨 Run diff** — 같은 scene 의 두 Job(원본 vs 재처리)을 좌우 그래프로 비교.
  단계별 소요 시간/error_message diff.

### 14.4 검색·필터·대량 작업
- **🟧 통합 검색** — `job_id`·`scene_id`·`file_path`·`error_message` 부분일치 검색
  (서버측 인덱스 가정). 단축키 `⌘K`/`Ctrl+K`.
- **🟧 저장된 뷰 (Saved Views)** — "오늘 실패한 L2", "재시도 중인 모든 Job" 같은
  필터 조합을 사용자별 저장. 새벽 인계 시 즉시 동일 화면 복원.
- **🟧 대량 재처리** — Job 리스트에서 다중 선택 → "선택된 N개 재처리". Idempotency-Key는
  Job마다 별개로 발급. 부분 재처리 시 target_level 일괄 지정.
- **🟨 시간 범위 비교** — "이번 주 vs 지난 주 처리량/실패율" 차트.

### 14.5 Alert·인시던트 대응
- **🟧 Alert에 Runbook 링크** — Alert 종류(`MAX_RETRY`, `PIPELINE_DELAY`, `QUALITY_FAIL`)
  마다 docs/runbooks/<kind>.md를 링크. 신규 운영자도 즉시 절차 수행 가능.
- **🟧 Alert 메모/태깅** — Alert 카드에 운영자 코멘트, 인시던트 번호 태그.
  postmortem 작성 시 입력값으로 export.
- **🟧 야간 알림 채널** — 브라우저 Notification API + 사운드. 사용자별 ON/OFF.
  운영실 무인 시간대에 모니터링 인계.
- **🟨 인시던트 리포트 export** — Job 상세 + Alert + 단계별 raw 이벤트를 PDF/MD로 내보내기.
  외부 보고용.

### 14.6 백엔드/계약 보강 (PWS에 추가 요청)
- **🟥 `GET /api/v1/health/live`, `/health/ready`** — 프론트 자체 헬스체크와 별개로,
  PWS·pgmq·DB·NAS 도달성을 묶은 단일 엔드포인트. 우상단 글로벌 배지 데이터 소스.
- **🟥 `POST /api/v1/jobs/{id}/cancel`** — 운영자가 hung Job을 명시적으로 취소.
  현재 use-case에는 없으므로 신설 요청.
- **🟧 `GET /api/v1/dlq?queue=`** — DLQ 정책이 TBC지만 viewer만이라도 P3까지 합의 필요.
- **🟧 `GET /api/v1/jobs/{id}/lineage`** — 14.3의 lineage 트리용.
- **🟧 SSE 채널 인증** — `EventSource`는 헤더 못 붙이므로 짧은 수명 토큰을 쿼리스트링으로.
  URL 로깅 시 토큰 노출되지 않도록 PWS는 토큰을 path 가 아닌 cookie로도 받게 둔다.

### 14.7 보안·컴플라이언스 (8장 보강)
- **🟥 운영자 액션 감사 영속화** — 프론트의 mutation은 백엔드 audit에 *append-only* 저장
  + 해시 체인. UI에서 수정/삭제 불가.
- **🟧 세션 타임아웃** — idle 30분 → 잠금 화면. 토큰 만료 시 사일런트 갱신 실패하면
  로그인으로 리다이렉트하면서 현재 화면 상태 deep link 보존.
- **🟧 CSP / SRI** — `next.config.ts`에서 strict CSP 헤더, 외부 CDN 미사용.
  Tailwind/폰트는 self-host (이미 6장에서 일부 언급).
- **🟧 PII 정의** — 운영자 ID, IP, 액션 로그가 PII에 해당하는지 보안팀과 합의 후 보존 기간 결정.
- **🟨 환경 배지** — `production` / `staging` / `dev`를 헤더 색상으로 구분. 운영자가
  staging에서 실제 큐를 비우는 사고 방지.

### 14.8 접근성 (10장 보강)
- **🟧 그래프 키보드 내비게이션 명세** — `Tab`으로 노드 순환, `Enter`로 상세,
  방향키로 토폴로지 이동, `Esc`로 패널 닫기. 별도 문서 `docs/A11Y.md` 작성.
- **🟧 스크린 리더 패턴** — 노드 상태 변화는 `aria-live="polite"`로 announce.
  실시간 변경은 throttling (3초당 1회)로 reader 스팸 방지.
- **🟨 색상+아이콘+텍스트 3중 인코딩** — 부록 14장 색상표는 모두 아이콘+텍스트 병기.

### 14.9 빌드/배포/CI
- **🟥 CI 파이프라인 분리** — `.github/workflows/ci.yml` 과 `.gitlab-ci.yml`에
  `frontend-ci` job 추가: `npm ci → lint → typecheck → test → build`.
  Node 22 + frontend 디렉터리에서만 실행. Nest 빌드 잡과 캐시 키 분리.
- **🟧 Dockerfile + `output: 'standalone'`** — 운영망 자체 호스팅. 멀티스테이지 빌드,
  비루트 사용자, healthcheck 포함. compose 파일은 `deploy/`에 추가.
- **🟧 Lighthouse 성능 게이트** — 메인 화면 LCP < 2.5s, TBT < 200ms, JS bundle < 300KB(gz).
  CI에서 회귀 방지.
- **🟧 한국어 폰트 self-host** — Pretendard 등 운영망 차단 환경에서도 동작하도록 정적 자산 동봉.
- **🟨 Feature flag** — 신규 화면을 단계적 노출. 단순 ENV 기반으로 v1 시작.

### 14.10 테스트 보강 (11장 보강)
- **🟧 SSE 머지 성질 테스트** — fast-check 기반 property test:
  "이벤트를 임의 순서로 주입해도 최종 상태는 동일해야 한다(commutative merge)".
- **🟧 시각 회귀 8 × 4** — 노드 상태 8종 × 다크/라이트 × ko/en = 32 스냅샷.
- **🟨 부하 스모크** — Playwright + 1,000개 Job mock 으로 그래프/리스트 렌더 30 FPS 이상.

### 14.11 운영 자료 / 온보딩
- **🟧 Runbook 연동** — `docs/runbooks/<alert-kind>.md`. 본 frontend 저장소가 아닌
  루트 `docs/`에 두고 Alert에서 외부 링크.
- **🟧 인앱 가이드 투어** — 첫 로그인 시 Job 그래프 핵심 요소 5단계 투어 (skipable).
- **🟨 Glossary** — CSC/CSU/SI/EI/CI/FI 용어 사전 페이지. ICD 절 번호 링크.

### 14.12 미해결로 남길 결정 사항
- 본 설계 단계에서 결정 불가하므로 별도 회의 안건:
  1. **SI-07 전달 매체** (REST vs pgmq) — CSC-09 팀 합의 필요.
  2. **DLQ viewer 권한 모델** — admin only 또는 operator 가능.
  3. **운영자 액션 감사 보존 기간** — 보안팀 + 법무 검토.
  4. **i18n 번역 1차 범위** — 한/영 이외 (위성팀 영문 보고 의무 여부에 따름).
  5. **OIDC provider 구체 구현** — CSC-01 IAM 모듈의 실제 spec 미공개.

### 14.13 에러 핸들링 전략
- **🟥 API 에러 분류 및 처리**:
  | HTTP 상태 | 프론트 동작 |
  |---|---|
  | 401/403 | 토스트 + 로그인 리다이렉트 (현재 URL deep link 보존) |
  | 404 | 해당 리소스 "찾을 수 없음" 빈 상태 표시 |
  | 409 (Conflict) | Optimistic concurrency 충돌 → 토스트 + 자동 리페치 |
  | 429 (Rate limit) | 재시도 큐잉 (exponential backoff, 최대 3회) |
  | 5xx | 에러 배너 + "재시도" 버튼, 3회 실패 시 수동 새로고침 안내 |
  | 네트워크 에러 | 오프라인 배너, 재연결 시 자동 리페치 |
- **🟥 TanStack Query 글로벌 에러 핸들러** — `QueryClient`에 공통 `onError` 등록.
  mutation 실패는 rollback + 토스트, query 실패는 stale 데이터 유지 + 배너.

### 14.14 페이지네이션·리스트 UX
- **🟧 Job 리스트** — 커서 기반(cursor) 페이지네이션 사용.
  `updatedAt` 기준 내림차순, 응답에 `nextCursor` 포함.
  프론트는 무한 스크롤 + "맨 위로" FAB.
  초기 로드 50건, 이후 25건씩 추가 로드.
- **🟧 Alert 리스트** — 미확인 Alert은 전량 로드(통상 < 100건),
  확인 완료 Alert은 시간 범위 필터 + 페이지네이션.
- **🟧 감사 로그** — 시간 범위 + Job ID 필터 필수, 페이지 단위(page/size) 네비게이션.

### 14.15 로딩·빈·에러 상태 명세
- **🟧 각 화면별 3상태 디자인** 필수:
  | 화면 | 로딩 상태 | 빈 상태 | 에러 상태 |
  |---|---|---|---|
  | 대시보드 | 카드별 스켈레톤 | "아직 처리된 Job이 없습니다" | 개별 카드 에러 배지 |
  | Job 리스트 | 테이블 행 스켈레톤 (5행) | "조건에 맞는 Job이 없습니다" + 필터 초기화 버튼 | 재시도 배너 |
  | Job 그래프 | 노드 위치 잡힌 회색 스켈레톤 | — (jobId 404 시 "Job을 찾을 수 없습니다") | 그래프 영역 에러 오버레이 |
  | Alert 보드 | 카드 스켈레톤 | "미확인 Alert이 없습니다 ✓" (긍정 메시지) | 재시도 배너 |
  | 감사 로그 | 테이블 스켈레톤 | "해당 기간의 로그가 없습니다" | 재시도 배너 |

### 14.16 환경 변수 관리
- **🟥 환경별 설정**:
  ```
  # .env.local (gitignore)
  NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
  NEXT_PUBLIC_SSE_BASE_URL=http://localhost:3000/api/v1/stream

  # .env.production
  NEXT_PUBLIC_API_BASE_URL=/api/v1          # 동일 도메인 프록시
  NEXT_PUBLIC_SSE_BASE_URL=/api/v1/stream

  # 서버 전용 (NEXT_PUBLIC_ 없음)
  OIDC_CLIENT_ID=...
  OIDC_CLIENT_SECRET=...
  NEXTAUTH_SECRET=...
  NEXTAUTH_URL=https://sdpe-console.internal
  SENTRY_DSN=...
  ```
- **🟧 `next.config.ts` rewrites** — 개발 환경에서 `/api/v1/**`을 PWS 로컬 주소로 프록시.
  CORS 없이 개발 가능.

### 14.17 번들 최적화·코드 스플리팅
- **🟧 React Flow 동적 import** — `@xyflow/react`와 `dagre`는 Job 그래프 페이지에서만
  필요하므로 `next/dynamic`으로 lazy load. 대시보드·리스트 페이지 초기 번들에 미포함.
- **🟧 Recharts 동적 import** — 차트 컴포넌트도 동일하게 lazy load.
- **🟨 번들 사이즈 예산**:
  | 청크 | 목표 (gzip) |
  |---|---|
  | 공통 (framework + shadcn) | < 120KB |
  | 그래프 페이지 | < 150KB |
  | 차트 페이지 | < 80KB |
  | 기타 페이지 | < 50KB |

### 14.18 SSE 이벤트 스키마 보강 (6.1절 보강)
- 6.1절에 정의된 `job.updated`, `step.updated`, `alert.created` 외에 다음 이벤트 추가 필요:
  ```
  event: reception.created
  data: { "eventId": "...", "satelliteId": "...", "rawDataPath": "...", "receivedAt": "..." }

  event: pipeline.completed
  data: { "jobId": "...", "totalDurationMs": 12345000, "finalLevel": "LEVEL_3" }

  event: queue.depth
  data: { "queue": "sdpe.jobs.csc04", "depth": 12, "oldestMessageAge": 3600 }

  event: heartbeat
  data: { "serverTime": "2026-04-10T12:00:00Z" }
  ```
- `heartbeat` 이벤트는 30초 간격으로 발행. 14.1의 "Stale data banner" 판단 기준으로 사용.
- `queue.depth`는 60초 간격으로 발행. 대시보드 큐 깊이 바 갱신용.

---

## 15. 부록 — 화면별 상태→색상 매핑

| 백엔드 상태 | UI 표시 | 색 | 텍스트 | 비고 |
|---|---|---|---|---|
| CREATED | pending | slate-400 | PENDING | 아이콘: dot |
| ASSIGNED | running | blue-500 (펄스) | RUNNING (n%) | VT 대비 진행률 |
| COMPLETED | completed | emerald-500 | DONE (12m 04s) | 소요 시간 |
| FAILED (retry < 3) | retrying | amber-500 | RETRY 1/3 | 아이콘: refresh |
| FAILED (max retry) | failed | red-600 | FAILED | 아이콘: alert |
| — (부분 재처리) | skipped | zinc-400 | SKIP | 부분 재처리 시 건너뛴 단계 |
| CANCELED | canceled | zinc-500 | CANCELED | 운영자 취소 |
