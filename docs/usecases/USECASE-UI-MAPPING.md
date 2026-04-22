# SDPE Frontend — 유즈케이스 ↔ 화면/컴포넌트 매핑

**문서 번호**: SDPE-UC-MAP-001
**버전**: v1.0
**작성일**: 2026-04-22
**분류**: 내부 기술문서

본 문서는 `docs/usecases/USECASE.md`(UC01~UC52)에 정의된 유즈케이스가 SDPE 운영자 콘솔 프론트엔드의 어느 페이지와 컴포넌트로 구현되는지를 정리한다.

- 프론트엔드 실제 구현 경로: `frontend/src/app/(planning)/plan/<name>/<Name>Page.tsx`
- `(current)` route group은 `plan/`의 페이지 컴포넌트를 그대로 재사용하므로, 본 문서는 `plan/` 기준으로 기술한다.
- 화면 경로는 `/plan/*`(mock) 과 `/current/*`(real API) 두 가지로 동시 접근 가능하다.

---

## 1. 네비게이션 및 라우트 맵

LeftSidebar 기반 상위 메뉴와 담당 유즈케이스 카테고리.

| # | 메뉴 (LeftSidebar) | 라우트 | 페이지 컴포넌트 | 담당 UC 카테고리 |
| - | ------------------- | ------ | --------------- | ---------------- |
| 1 | 대시보드           | `/plan`                | `HomePage.tsx`                      | UC42, UC01, UC21, UC26 |
| 2 | Raw Data 목록       | `/plan/raw-data`       | `RawDataPage.tsx`                   | (UC 정의 외 — EI-01 수신 이벤트 조회) |
| 3 | 파이프라인 관리     | `/plan/console`        | `ConsolePage.tsx` (+ `PipelineManagementPage.tsx` 탭 래퍼) | UC01~UC16, UC09, UC23~UC25, UC41, UC51~UC52 |
| 4 | 파이프라인 실행 관리 | `/plan/deployed`      | `PipelineExecutionManagementPage.tsx` / `DeployedPipelinesPage.tsx` | UC21, UC22, UC51, UC52 |
| 5 | Production 목록     | `/plan/products`       | `ProductsPage.tsx`                  | UC27~UC32 |
| 6 | 시스템 운영 모니터링 | `/plan/queues`        | `QueueDashboardPage.tsx`            | UC33~UC37 |
| 7 | 알림                | `/plan/alerts`         | `AlertsPage.tsx`                    | UC38, UC39 |
| 8 | 감사 로그 (Admin)    | `/plan/audit`          | `AuditPage.tsx`                     | UC40 |
| 9 | 사용자 관리 (Admin) | `/plan/users`          | `UsersPage.tsx`                     | UC47~UC50 |
| - | 처리 프로파일 관리  | `/plan/profiles` (`PipelineManagementTabs` 탭) | `ProcessingProfilesPage.tsx` | UC17~UC20 |
| - | 아카이브 목록       | `/plan/archive` (탭)   | `ArchivePage.tsx`                   | UC07, UC08 |
| - | 설정                | `/plan/settings`       | `SettingsPage.tsx`                  | (개인 환경 설정) |
| - | 로그인              | `/login`               | `LoginPage.tsx`                     | UC43 |
| - | 비밀번호 강제 변경  | `/login/reset`         | `PasswordResetRequiredPage.tsx`     | UC46 (최초 로그인 강제) |

> **LeftSidebar (`components/panels/LeftSidebar.tsx`)** — 좌측 네비게이션 + 프로필 메뉴(로그아웃 UC44, 비밀번호 변경 UC46) + 콘솔/Jobs 모드에서는 파이프라인·Job 목록과 필터·페이징을 제공 (UC01, UC21의 일부 구현).

---

## 2. 페이지별 유즈케이스 매핑

### 2.1 HomePage (`/plan`)

**목적**: 전체 파이프라인 운영 현황을 한 화면에서 파악.

| UC | UC명 | 화면 요소 |
| -- | ---- | --------- |
| UC42 | 대시보드 통계 확인 | 상단 KPI (실행 중 Job 수, 24h 완료·실패, 실패율, 평균 처리 시간) |
| UC01 | 파이프라인 목록 조회 | 파이프라인별 품질 현황 매트릭스 카드 |
| UC21 | Job 목록 조회 | 최근 Job 집계(상태별) — 매트릭스 통계의 소스 |
| UC26 | Job SLA 확인 | 평균 처리 시간 표시, SLA 14,400초 비교 |

**주요 컴포넌트**: `PipelineFilterPanel`, `PipelineFlowDiagram`(ReactFlow), `MetricMatrixRow`, `PipelineQualityCard`

---

### 2.2 ConsolePage (`/plan/console`)

**목적**: 파이프라인 DAG 편집, 수동 실행, 배포 제어, Job 추적. **가장 많은 UC를 담는 메인 화면**.

| UC | UC명 | 화면 요소 / 인터랙션 |
| -- | ---- | -------------------- |
| UC01 | 파이프라인 목록 조회 | `LeftSidebar` 파이프라인 리스트 |
| UC02 | 파이프라인 생성 | "새 파이프라인" 버튼 → `CreatePipelineDialog` (2단계 마법사, 시작 노드 선택) |
| UC03 | 파이프라인 수정 | 좌상단 파이프라인 이름 Badge의 설정 아이콘 → `PipelineEditDialog` / `PipelineEditPanel` |
| UC04 | 파이프라인 삭제 | 파이프라인 컨텍스트 메뉴 → `PipelineDeleteConfirmDialog` |
| UC05 | 파이프라인 복제 | **미구현** (서비스 인터페이스에만 메서드 존재, UI 진입점 없음) |
| UC06 | 파이프라인 아카이브 | 파이프라인 컨텍스트 메뉴 → `PipelineArchiveConfirmDialog` |
| UC09 | 파이프라인 실행 | 하단 중앙 "파이프라인 실행" 부동 버튼 (MANUAL_REQUEST 트리거) |
| UC10 | 노드 추가 | 우측 상단 `AddNodeButton` → `AddStepPanel` (우측 패널) |
| UC11 | 노드 삭제 | 캔버스 노드 컨텍스트 메뉴 → 삭제 (TRIGGER/FILE_INPUT 제외) |
| UC12 | 노드 설정 | 노드 더블클릭 → `NodeDetailModal` (SAR 태스크 토글, `JobInitEditPanel`, `FileInputConfigDialog`) |
| UC13 | 노드 바이패스 | `NodeEditPanel`의 "비활성화" 토글 |
| UC14 | 엣지 추가 | 노드 핸들 드래그 → 연결 |
| UC15 | 엣지 삭제 | 엣지 우클릭 → `DeletableEdge` 삭제 버튼 |
| UC16 | 노드 상세 조회 | 노드 더블클릭 → `NodeDetailModal` 설정값·출력 확인 |
| UC23 | Job 전체 재처리 | Job 선택 시 `JobDetailPanel` → "재처리" → `ReprocessConfirmDialog` (Job ID 재입력) |
| UC24 | Job 부분 재처리 | `JobDetailPanel` → "부분 재처리" 드롭다운 (LEVEL_1~LEVEL_3 선택) |
| UC25 | Job 취소 | `JobDetailPanel` → "취소" → `CancelConfirmDialog` |
| UC26 | Job SLA 확인 | `JobDetailPanel` SLA 진행 바 (`slaMs = 14400 * 1000`) |
| UC41 | 실행 로그 조회 | 하단 `ExecutionLogPanel` (Job ID·로그 레벨·건수 필터) |
| UC51 | 배포 파이프라인 목록 조회 | 좌상단 "파이프라인 배포" 패널 — 규칙·조건 표시 |
| UC52 | 파이프라인 배포 상태 변경 | 배포 패널 "배포"/"배포 해제" 버튼 → `PipelineUndeployConfirmDialog` |

**주요 컴포넌트**: `CanvasGraph`, `PipelineGraph`, `PipelineNode`, `DeletableEdge`, `AddNodeButton`, `PipelineProgressStepper`, `RightTabbedPanel`, `ConsoleTab`, `TopBar`, `StepDetailPopover`

---

### 2.3 ArchivePage (`/plan/archive`, `PipelineManagementTabs`의 Archive 탭)

| UC | UC명 | 화면 요소 |
| -- | ---- | --------- |
| UC07 | 아카이브 파이프라인 목록 조회 | 좌측 아카이브 파이프라인 리스트 |
| UC08 | 파이프라인 복원 | 선택된 파이프라인의 "복원" 버튼 |

**주요 컴포넌트**: `LeftSidebar`(mode='archive'), `CanvasGraph`(읽기 전용 미리보기)

---

### 2.4 ProcessingProfilesPage (`/plan/profiles`)

| UC | UC명 | 화면 요소 |
| -- | ---- | --------- |
| UC17 | 처리 프로파일 목록 조회 | 프로파일 테이블(위성·모드 필터) |
| UC18 | 처리 프로파일 생성 | "새 프로파일" 버튼 → 생성 다이얼로그 |
| UC19 | 처리 프로파일 수정 | 행 수정 버튼 → 수정 다이얼로그 |
| UC20 | 처리 프로파일 삭제 | 행 삭제 버튼 + 참조 파이프라인 확인 팝오버 |

---

### 2.5 DeployedPipelinesPage / PipelineExecutionManagementPage (`/plan/deployed`)

**목적**: 배포된 파이프라인의 자동 실행 규칙과 수동 실행 Job을 통합 조회.

| UC | UC명 | 화면 요소 |
| -- | ---- | --------- |
| UC51 | 배포 파이프라인 목록 조회 | `Auto` 탭 — 이벤트 유형·pgmq 큐·매칭 조건(위성/모드/편파/레벨)·대상 파이프라인 테이블 |
| UC52 | 파이프라인 배포 상태 변경 | Auto 탭의 "배포"/"배포 해제" 버튼 (Admin 전용) |
| UC21 | Job 목록 조회 | `Manual` 탭 — 수동 실행 Job 리스트 |
| UC22 | Job 상세 조회 | Manual 탭 Job 선택 → DAG + `JobDetailPanel` |

**주요 컴포넌트**: `PipelineExecutionTabs`, `CanvasGraph`(미리보기), `JobDetailPanel`

---

### 2.6 JobsPage (`/plan/jobs`)

**목적**: 수동 실행 Job 전체 관리. ConsolePage보다 목록 중심.

| UC | UC명 | 화면 요소 |
| -- | ---- | --------- |
| UC21 | Job 목록 조회 | 상태별 필터(전체/CREATED/ASSIGNED/COMPLETED/FAILED/CANCELED), 페이징(10/20/50/100) |
| UC22 | Job 상세 조회 | Job 선택 → 중앙 DAG + 우측 `JobDetailPanel` (단계별 소요 시간, 오류) |
| UC23 | Job 전체 재처리 | `JobDetailPanel` → `ReprocessConfirmDialog` |
| UC24 | Job 부분 재처리 | `JobDetailPanel` → 부분 재처리 드롭다운 |
| UC25 | Job 취소 | `JobDetailPanel` → `CancelConfirmDialog` |
| UC26 | Job SLA 확인 | `JobDetailPanel` SLA 진행 바 |

**주요 컴포넌트**: `LeftSidebar`(mode='jobs'), `CanvasGraph`, `JobDetailPanel`, `PipelineProgressStepper`

---

### 2.7 ProductsPage (`/plan/products`)

| UC | UC명 | 화면 요소 |
| -- | ---- | --------- |
| UC27 | 제품 목록 조회 | 레벨·위성·모드·상태 필터 + 정렬 + 페이징 테이블 |
| UC28 | 제품 상세 조회 | 우측 패널 메타데이터(공간범위, 시간, 해상도, 편파, 모드) |
| UC29 | 제품 품질 검증 결과 확인 | 우측 패널 품질 지표(NESZ, PSLR, 기하 정확도, 방사 보정) |
| UC30 | 제품 다운로드 URL 발급 | 우측 패널 "다운로드" 버튼 (Presigned URL) |
| UC31 | 제품 미리보기 조회 | Quick-look 썸네일 이미지 |
| UC32 | 제품 기반 재처리 요청 | 테이블 행 "재처리" 버튼 / 우측 패널 `onReprocess` → `ReprocessDialog` (target_level 선택) |

**구현 확인**: `ProductsPage.tsx:200` `ReprocessDialog`, `:596` `handleReprocess`, `:598` `service.제품_재처리를_요청한다`.

---

### 2.8 QueueDashboardPage (`/plan/queues`)

| UC | UC명 | 화면 요소 |
| -- | ---- | --------- |
| UC33 | 큐 상태 조회 | 좌측 큐 리스트 — 큐 깊이, 컨슈머 수, 건강 상태 |
| UC34 | 큐 트렌드 확인 | 리스트 스파크라인(1h) + `QueueDetailPanel` 라인 차트 |
| UC35 | 대기 메시지 조회 | `QueueDetailPanel` 대기 메시지 테이블(우선순위) |
| UC36 | Dead Letter 조회 | `QueueDetailPanel` Dead Letter 섹션 |
| UC37 | 처리량 확인 | `QueueDetailPanel` 1h/24h 처리량 및 평균 처리 시간 |

---

### 2.9 AlertsPage (`/plan/alerts`)

| UC | UC명 | 화면 요소 |
| -- | ---- | --------- |
| UC38 | 알림 목록 조회 | 미확인/전체 필터 + 알림 리스트 (MAX_RETRY·PIPELINE_DELAY·QUALITY_FAIL·RESOURCE_THRESHOLD) |
| UC39 | 알림 확인 | 각 알림 행 확인 버튼 (ETag 낙관적 동시성 제어) — `AlertModal` / `AlertsTab` |

---

### 2.10 AuditPage (`/plan/audit`, Admin only)

| UC | UC명 | 화면 요소 |
| -- | ---- | --------- |
| UC40 | 감사 로그 조회 | 날짜 범위·Job ID·조작자·이벤트 타입 필터, 정렬, 테이블 |

> 이벤트 타입: JOB_CREATED/ASSIGNED/COMPLETED/FAILED, PIPELINE_STARTED/REPROCESSED, ALERT_DISPATCHED, LOGIN_SUCCEEDED/FAILED, USER_CREATED/UPDATED/ROLE_CHANGED/DEACTIVATED, PASSWORD_RESET/CHANGED.

---

### 2.11 UsersPage (`/plan/users`, Admin only)

| UC | UC명 | 화면 요소 |
| -- | ---- | --------- |
| UC47 | 사용자 목록 조회 | 역할·활성 상태·검색 필터 + 테이블 + 최근 로그인 |
| UC48 | 사용자 생성 | "새 사용자" 버튼 → `UserFormModal` |
| UC49 | 사용자 수정·비활성화 | 행 수정 버튼 → `UserFormModal` (역할/활성/프로필) |
| UC50 | 비밀번호 초기화 | 행의 "암호 초기화" 버튼 → `PasswordResetModal` (임시 비밀번호 1회 노출) |

**주요 컴포넌트**: `UserFormModal`, `PasswordResetModal`, `RolePreviewSelect`

---

### 2.12 LoginPage / PasswordResetRequiredPage / 공통 네비게이션

| UC | UC명 | 화면 요소 / 구현 위치 |
| -- | ---- | -------------------- |
| UC43 | 로그인 | `LoginPage.tsx` — 사용자명/비밀번호 입력, 오류 메시지, 계정 잠금 안내 |
| UC44 | 로그아웃 | `LeftSidebar` 프로필 메뉴 "로그아웃" — 토큰 폐기 후 `/login` 복귀 |
| UC45 | 토큰 갱신 | **암시적** — 서비스 레이어(`pipeline.current.service.ts`)에서 refreshToken 기반 자동 재발급, 실패 시 강제 로그아웃. UI 노출 요소 없음 |
| UC46 | 비밀번호 변경 (본인) | `LeftSidebar` 프로필 메뉴 "비밀번호 변경" → `PasswordChangeModal`. 최초 로그인 강제 변경은 `PasswordResetRequiredPage` |

---

## 3. 주요 공통 컴포넌트 요약

| 컴포넌트 | 경로 | 역할 | 관련 UC |
| -------- | ---- | ---- | ------- |
| `LeftSidebar` | `components/panels/LeftSidebar.tsx` | 네비게이션 + 파이프라인/Job 목록 + 프로필 메뉴 | UC01, UC07, UC21, UC44, UC46 |
| `TopBar` | `components/panels/TopBar.tsx` | 페이지 상단 제목·액션 영역 | — |
| `CanvasGraph` | `components/graph/CanvasGraph.tsx` | ReactFlow 기반 DAG 편집 캔버스 | UC10~UC16, UC22, UC51 |
| `PipelineGraph` | `components/graph/PipelineGraph.tsx` | 읽기 전용 DAG 렌더링 | UC16, UC22, UC51 |
| `PipelineNode` | `components/graph/PipelineNode.tsx` | DAG 노드 렌더러 (상태 색상·바이패스 표시) | UC10~UC13 |
| `DeletableEdge` | `components/graph/DeletableEdge.tsx` | 삭제 가능한 엣지 | UC14, UC15 |
| `AddNodeButton` | `components/graph/AddNodeButton.tsx` | 노드 추가 진입점 | UC10 |
| `PipelineProgressStepper` | `components/graph/PipelineProgressStepper.tsx` | Job 진행 단계 스테퍼 | UC22, UC26 |
| `CreatePipelineDialog` | `components/panels/CreatePipelineDialog.tsx` | 파이프라인 생성 마법사 | UC02 |
| `PipelineEditDialog` / `PipelineEditPanel` | `components/panels/` | 파이프라인 속성 수정 | UC03 |
| `PipelineDeleteConfirmDialog` | `components/panels/` | 삭제 확인 | UC04 |
| `PipelineArchiveConfirmDialog` | `components/panels/` | 아카이브 확인 | UC06 |
| `PipelineUndeployConfirmDialog` | `components/panels/` | 배포 해제 확인 | UC52 |
| `SelectStartNodeDialog` | `components/panels/` | 시작 노드(TRIGGER/FILE_INPUT) 선택 | UC02 |
| `NodeDetailModal` | `components/panels/NodeDetailModal.tsx` | 노드 상세 설정 모달 | UC12, UC13, UC16 |
| `NodeEditPanel` | `components/panels/NodeEditPanel.tsx` | 노드 설정 패널 + 바이패스 토글 | UC12, UC13 |
| `JobInitEditPanel` | `components/panels/JobInitEditPanel.tsx` | JOB_INIT 프로파일/우선순위 편집 | UC12 |
| `FileInputConfigDialog` | `components/panels/FileInputConfigDialog.tsx` | FILE_INPUT 파일 경로 설정 | UC12 |
| `AddStepPanel` | `components/panels/AddStepPanel.tsx` | 노드 추가 패널 | UC10 |
| `StepDetailPopover` | `components/panels/StepDetailPopover.tsx` | 단계 상세 팝오버 | UC22 |
| `JobDetailPanel` | `components/panels/JobDetailPanel.tsx` | Job 상세 + 재처리/취소/SLA | UC22~UC26 |
| `ReprocessConfirmDialog` | `components/panels/ReprocessConfirmDialog.tsx` | 재처리 확인 (ID 재입력) | UC23, UC24, UC32 |
| `CancelConfirmDialog` | `components/panels/CancelConfirmDialog.tsx` | 취소 확인 | UC25 |
| `ExecutionLogPanel` | `components/panels/ExecutionLogPanel.tsx` | 실행 로그 하단 패널 | UC41 |
| `QueueDetailPanel` | `components/panels/QueueDetailPanel.tsx` | 큐 상세(메시지·Dead Letter·처리량) | UC33~UC37 |
| `AlertsTab` / `AlertModal` | `components/panels/` | 알림 리스트/상세 | UC38, UC39 |
| `AuditTab` | `components/panels/AuditTab.tsx` | 감사 로그 탭 형태 표시 | UC40 |
| `PipelineManagementTabs` / `PipelineExecutionTabs` | `components/panels/` | 탭 컨테이너 | — |
| `ConsoleTab` | `components/panels/ConsoleTab.tsx` | 콘솔 우측 탭 전환 | UC10, UC12 |
| `RightPanel` / `RightTabbedPanel` / `BottomPanel` | `components/panels/` | 레이아웃 패널 | — |
| `UserFormModal` | `components/auth/UserFormModal.tsx` | 사용자 생성/수정 | UC48, UC49 |
| `PasswordResetModal` | `components/auth/PasswordResetModal.tsx` | 비밀번호 초기화 | UC50 |
| `PasswordChangeModal` | `components/auth/PasswordChangeModal.tsx` | 본인 비밀번호 변경 | UC46 |
| `RolePreviewSelect` | `components/auth/RolePreviewSelect.tsx` | 역할 선택 미리보기 | UC48, UC49 |

---

## 4. 유즈케이스 커버리지 요약

| UC | UC명 | 상태 | 주 담당 화면 | 비고 |
| -- | ---- | ---- | ----------- | ---- |
| UC01 | 파이프라인 목록 조회 | ✅ | `HomePage`, `ConsolePage`, `LeftSidebar` | |
| UC02 | 파이프라인 생성 | ✅ | `ConsolePage` + `CreatePipelineDialog` | 2단계 마법사 |
| UC03 | 파이프라인 수정 | ✅ | `ConsolePage` + `PipelineEditDialog` | |
| UC04 | 파이프라인 삭제 | ✅ | `ConsolePage` + `PipelineDeleteConfirmDialog` | |
| UC05 | 파이프라인 복제 | ⚠️ **미구현** | — | 서비스 인터페이스에는 `파이프라인을_복제한다`가 있으나, UI 진입점 없음. **추가 구현 필요** (콘솔 컨텍스트 메뉴에 "복제" 추가 권장) |
| UC06 | 파이프라인 아카이브 | ✅ | `ConsolePage` + `PipelineArchiveConfirmDialog` | |
| UC07 | 아카이브 파이프라인 목록 | ✅ | `ArchivePage` | |
| UC08 | 파이프라인 복원 | ✅ | `ArchivePage` | |
| UC09 | 파이프라인 실행 | ✅ | `ConsolePage` 하단 "파이프라인 실행" 버튼 | |
| UC10 | 노드 추가 | ✅ | `ConsolePage` + `AddStepPanel` | |
| UC11 | 노드 삭제 | ✅ | `CanvasGraph` 노드 컨텍스트 메뉴 | 시작 노드 제외 로직 포함 |
| UC12 | 노드 설정 | ✅ | `NodeDetailModal`, `NodeEditPanel`, `JobInitEditPanel`, `FileInputConfigDialog` | |
| UC13 | 노드 바이패스 | ✅ | `NodeEditPanel` 토글 | ICD/SAD 미정의 — 프론트엔드 자체 기능 |
| UC14 | 엣지 추가 | ✅ | `CanvasGraph` 드래그 연결 | |
| UC15 | 엣지 삭제 | ✅ | `DeletableEdge` | |
| UC16 | 노드 상세 조회 | ✅ | `NodeDetailModal` | |
| UC17 | 처리 프로파일 목록 | ✅ | `ProcessingProfilesPage` | |
| UC18 | 처리 프로파일 생성 | ✅ | `ProcessingProfilesPage` | |
| UC19 | 처리 프로파일 수정 | ✅ | `ProcessingProfilesPage` | |
| UC20 | 처리 프로파일 삭제 | ✅ | `ProcessingProfilesPage` | 참조 확인 포함 |
| UC21 | Job 목록 조회 | ✅ | `JobsPage`, `ConsolePage`, `DeployedPipelinesPage` | |
| UC22 | Job 상세 조회 | ✅ | `JobDetailPanel` + `CanvasGraph` | |
| UC23 | Job 전체 재처리 | ✅ | `ReprocessConfirmDialog` (Job ID 재입력) | |
| UC24 | Job 부분 재처리 | ✅ | `JobDetailPanel` 부분 재처리 드롭다운 | |
| UC25 | Job 취소 | ✅ | `CancelConfirmDialog` | |
| UC26 | Job SLA 확인 | ✅ | `JobDetailPanel` SLA 진행 바 (14,400초 기준) | |
| UC27 | 제품 목록 조회 | ✅ | `ProductsPage` | |
| UC28 | 제품 상세 조회 | ✅ | `ProductsPage` 우측 패널 | |
| UC29 | 제품 품질 확인 | ✅ | `ProductsPage` 우측 패널 (NESZ/PSLR 등) | |
| UC30 | 제품 다운로드 URL | ✅ | `ProductsPage` "다운로드" 버튼 | Presigned URL |
| UC31 | 제품 미리보기 | ✅ | `ProductsPage` Quick-look 썸네일 | |
| UC32 | 제품 기반 재처리 | ✅ | `ProductsPage` + `ReprocessDialog` | |
| UC33 | 큐 상태 조회 | ✅ | `QueueDashboardPage` | |
| UC34 | 큐 트렌드 확인 | ✅ | `QueueDashboardPage` 스파크라인 + `QueueDetailPanel` | |
| UC35 | 대기 메시지 조회 | ✅ | `QueueDetailPanel` | |
| UC36 | Dead Letter 조회 | ✅ | `QueueDetailPanel` | |
| UC37 | 처리량 확인 | ✅ | `QueueDetailPanel` | |
| UC38 | 알림 목록 조회 | ✅ | `AlertsPage` | |
| UC39 | 알림 확인 | ✅ | `AlertsPage` / `AlertModal` | ETag 동시성 제어 |
| UC40 | 감사 로그 조회 | ✅ | `AuditPage` | Admin 전용 |
| UC41 | 실행 로그 조회 | ✅ | `ConsolePage` + `ExecutionLogPanel` | |
| UC42 | 대시보드 통계 | ✅ | `HomePage` | |
| UC43 | 로그인 | ✅ | `LoginPage` | 계정 잠금 표시 |
| UC44 | 로그아웃 | ✅ | `LeftSidebar` 프로필 메뉴 | |
| UC45 | 토큰 갱신 | ⚠️ **암시적 구현** | 서비스 레이어 | UI 표시 없음. 자동 갱신 및 실패 시 강제 로그아웃으로 동작 |
| UC46 | 비밀번호 변경 (본인) | ✅ | `PasswordChangeModal` / `PasswordResetRequiredPage` | |
| UC47 | 사용자 목록 조회 | ✅ | `UsersPage` | Admin 전용 |
| UC48 | 사용자 생성 | ✅ | `UserFormModal` | |
| UC49 | 사용자 수정·비활성화 | ✅ | `UserFormModal` | |
| UC50 | 비밀번호 초기화 | ✅ | `PasswordResetModal` | 임시 비밀번호 1회 노출 |
| UC51 | 배포 파이프라인 목록 | ✅ | `DeployedPipelinesPage` Auto 탭, `ConsolePage` 배포 패널 | |
| UC52 | 파이프라인 배포 상태 변경 | ✅ | `ConsolePage` 배포 패널 + `PipelineUndeployConfirmDialog` | Admin 전용 |

**총 52개 UC 중 50개 완전 구현, 1개 암시적 구현(UC45), 1개 미구현(UC05).**

---

## 5. 점검 결과 — 화면 기획 vs 유즈케이스 정합성

### 5.1 정합한 항목

- **역할 분리(RBAC)**: Admin/Operator 가시성이 `UsersPage`, `AuditPage`의 Admin 전용 제한과 `LeftSidebar` 메뉴 노출 규칙으로 반영됨.
- **파이프라인 편집(UC10~UC16)**: DAG 편집의 모든 UC가 `CanvasGraph` + 노드/엣지 컴포넌트로 1:1 대응.
- **Job 운영(UC21~UC26)**: `JobDetailPanel` 하나로 상세 조회, 전체/부분 재처리, 취소, SLA 확인을 통합 제공. `ReprocessConfirmDialog`의 Job ID 재입력 검증은 ICD SI-04(is_retry_reset=true) 요건을 반영.
- **제품(UC27~UC32)**: `ProductsPage`가 목록·상세·품질·다운로드·썸네일·재처리를 완전히 커버.
- **큐 모니터링(UC33~UC37)**: `QueueDashboardPage` + `QueueDetailPanel` 조합으로 전체 커버.
- **배포 운영(UC51~UC52)**: 유즈케이스 문서에서 새로 추가된 배포 개념이 `ConsolePage`의 배포 패널과 `DeployedPipelinesPage`의 Auto 탭 두 진입점으로 반영됨.

### 5.2 보완 필요 항목

| # | UC | 이슈 | 권장 조치 |
| - | -- | ---- | --------- |
| 1 | **UC05 (파이프라인 복제)** | 서비스 인터페이스에 `파이프라인을_복제한다`가 있으나 UI 진입점 없음 | `ConsolePage`의 파이프라인 컨텍스트 메뉴(또는 좌측 사이드바 아이템 메뉴)에 "복제" 항목 추가. 복제 시 이름에 "(복사)" 접미사 자동 부여 |
| 2 | **UC45 (토큰 갱신)** | 명시적 UI 피드백 없음 | 토큰 만료로 인한 강제 로그아웃 시 Toast나 리다이렉트 안내 메시지 추가 (세션 만료 알림) |
| 3 | **UC04 (파이프라인 삭제) 정책 명확화** | 현재 UI 상 "삭제" 와 "아카이브" 가 혼재. UC 문서에서는 삭제와 아카이브를 분리 정의함 | 기획 레벨에서 "하드 삭제" 시나리오가 실제 필요한지 재검토하고, 필요하면 Admin만 접근 가능한 영구 삭제 메뉴를 `ArchivePage`에 추가 |
| 4 | **UC41 (실행 로그 조회) 접근성** | 현재 `ConsolePage`에서만 하단 패널로 접근 가능 | `JobsPage`에도 Job 선택 시 실행 로그 탭 노출 고려 (조작 일관성) |
| 5 | **RawDataPage** | UC 목록에 대응되는 항목 없음 (EI-01 원시 데이터 수신 조회) | USECASE.md에 "원시 데이터 수신 이벤트 조회" UC 추가를 검토하거나, 페이지 존재 근거를 UC 문서로 재확인 |

### 5.3 UC 문서와 기획 간 경미한 불일치

- `USECASE.md`는 **UC52까지** 정의(배포 관련 UC 포함), `USECASE-REPORT.md`는 **UC50까지**만 정의. 리포트 문서에 UC51·UC52 추가 검토 필요.
- `USECASE-REPORT.md`의 UC01에서는 "처리 단계 수"를 기본 정보로 명시하지만, `HomePage`/`LeftSidebar`의 파이프라인 카드에 단계 수가 명시적으로 표시되지 않음. 필요 시 카드 메타에 Step count 추가.
- UC13(노드 바이패스)는 ICD/SAD 미정의라고 표기되어 있지만 UI 및 서비스 인터페이스에는 구현되어 있음. 향후 ICD 반영 시점에 스키마(필드명·전달 방식) 확정 필요.

---

## 6. 문서 유지 보수 가이드

- **페이지·컴포넌트 추가 시**: 섹션 1(라우트 맵), 2(페이지별), 3(컴포넌트), 4(커버리지)에 동시에 항목 추가.
- **유즈케이스 추가 시**: `USECASE.md`에 UC 정의 → 본 문서 섹션 4 커버리지 표에 구현 상태 기록 → 담당 페이지 섹션에 매핑 행 추가.
- **구현 상태 변경 시**: 섹션 4의 "상태" 컬럼(✅ / ⚠️ / ❌)과 섹션 5.2 보완 필요 항목 리스트를 갱신.
- 본 문서는 `docs/usecases/USECASE.md` 개정 시마다 동기화되어야 하며, 프론트엔드 구조 큰 변경(페이지 이동, 컴포넌트 리네이밍) 시에도 반영 필요.
