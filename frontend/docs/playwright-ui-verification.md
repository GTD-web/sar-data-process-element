# Playwright UI 검증 워크플로

- **결정 일자**: 2026-05-07
- **최근 검토**: 2026-05-07
- **상태**: Active
- **관련 코드**:
  - `frontend/playwright.config.ts` — 설정 (baseURL=`http://localhost:3010`, chromium only)
  - `frontend/e2e/*.spec.ts` — 스펙 (자연어 한글 describe/test 명)
  - `frontend/package.json` — `npm run e2e`, `npm run e2e:ui`, `npm run e2e:report`
  - `frontend/AGENTS.md` — Playwright UI 검증 섹션 (게이트 룰)
- **트리거 키워드**: playwright, e2e, UI 검증, 흐름 검증, smoke 테스트, regression, 회귀
- **Supersedes**: (없음)
- **Superseded by**: (없음)

## 배경

Frontend 작업은 빌드 통과 + 타입 체크 통과만으로는 "의도한 사용자 흐름이
도는가" 를 보장하지 못한다. 예시:

- 라벨 텍스트만 바꿨는데 잘못된 곳을 찾아 바꿨거나, 같은 라벨이 여러 곳에 있어서
  하나만 갱신된 경우.
- 모달 안의 두 단계 비동기 흐름 (deactivate → activate 같은 swap) 이 한 단계만
  성공하고 두 번째가 stale closure 로 거부되어 UI 가 절반만 갱신되는 경우.
- 리스트 정렬 키를 바꿨더니 active/inactive 가 토글될 때마다 행 순서가 흔들리는
  경우.

이런 류의 회귀를 사람이 매번 잡기에는 비용이 크고, 무엇보다 LLM 에이전트가
"빌드 통과 = 작업 완료" 로 오인하는 패턴을 반복한다. Design decision 문서가
"왜 이 결정을 했는가" 를 보존하는 것처럼, e2e 스펙은 "이 흐름은 이렇게
돌아야 한다" 를 실행 가능한 형태로 보존한다.

## 결정

### 도구 선택

- **@playwright/test (chromium 전용)** 을 표준으로 사용한다.
- WebKit/Firefox 추가는 모바일/사파리 호환 문제가 실제로 발생할 때까지 보류
  (브라우저 바이너리 다운로드 비용 회피).
- 별도 테스트 러너 (Vitest + RTL 등) 는 도입하지 않는다 — 컴포넌트 단위 테스트는
  현재 ROI 가 낮고 e2e 가 흐름 보존 측면에서 더 큰 가치를 준다.

### 디렉토리/네이밍

- `frontend/e2e/<topic>.spec.ts` — 토픽 단위로 한 파일.
- `describe` / `test` 이름은 한글 자연어로 작성. 사용자에게 무슨 흐름인지
  바로 읽히는 게 우선.
- 셀렉터는 가능한 한 사용자가 보는 텍스트 (`getByRole`, `getByText`) 기반.
  `data-testid` 는 텍스트로 잡기 어려운 경우에만 추가하고, 추가 시 컴포넌트
  파일에 함께 커밋한다.

### 실행 환경

- baseURL 은 `http://localhost:3010` (재배포된 Docker 컨테이너) 기본.
- 변경 시 `E2E_BASE_URL` 또는 `E2E_PORT` 환경변수로 덮어쓸 수 있다.
- `playwright.config.ts` 에 webServer 자동 기동 옵션은 두지 않는다 — 컨테이너
  재배포 흐름과 충돌 방지. e2e 실행 전 컨테이너가 떠 있어야 한다.

### 게이트 (Definition of Done)

UI 기획 변경 작업이 다음 중 하나라도 해당하면, **사용자 보고 전에**
`npm run e2e` 통과가 필수다 (자세한 분류는 `frontend/AGENTS.md` 참고).

- 탭/메뉴 라벨/사이드바 항목명/페이지 타이틀 변경
- 모달 추가·제거, 모달 안 동작 변경 (swap, 확인/취소, 삭제 등)
- 리스트 정렬 기준, 행 순서, 행 안 상태 토글
- 폼 필드 추가/제거, 필수 조건, 버튼 활성화 조건
- 탭 간 이동 / 라우팅 흐름

순수 시각 미세 조정, 타입/로직 리팩터, UI 흐름과 무관한 버그 수정은 게이트
적용 제외.

### 새 흐름 커버 절차

1. 변경한 흐름이 기존 스펙으로 커버되는지 확인. 안 되면 새 `*.spec.ts` 추가
   또는 기존 스펙 보강.
2. 스펙은 사용자가 실제로 거치는 클릭 경로를 그대로 따라간다 — 직접 서비스
   레이어를 호출하거나 내부 state 를 조작하지 않는다.
3. 어설션은 "사용자가 화면에서 무엇을 보게 되는가" 단위. 토스트, 배지 텍스트,
   행 순서, 라인 스타일 (SVG `stroke-dasharray`) 등 시각 산출물 위주.
4. 통과 확인 후 코드와 같은 PR/커밋에 함께 들어간다.

## 대안과 트레이드오프

| 대안 | 장점 | 단점 / 채택하지 않은 이유 |
|---|---|---|
| 사람이 매번 수동 클릭 검증 | 도구 도입 비용 0 | 에이전트가 "빌드 통과=완료" 로 오인하는 패턴이 반복됨. 회귀 보존 불가 |
| Vitest + React Testing Library | 빠름, 컴포넌트 단위 | mock 의존도 높음. SVG 좌표 계산이나 모달 흐름 같은 통합 검증 어려움. 두 번째 러너 도입 부담 |
| Cypress | UI 디버깅 친화 | 멀티 탭/멀티 워커 약하고, Playwright 대비 최신 API 적응 비용 큼. AI 친화 도구 측면에서 Playwright 가 우세 |
| Storybook + interaction tests | 컴포넌트 시나리오 카탈로그화 | 유지비용 높음. 현재 페이지/흐름 단위가 더 가치 큼. 추후 컴포넌트 라이브러리 비대화되면 재고 |
| Webkit/Firefox 동시 검증 | 다중 브라우저 호환 | 바이너리 용량/CI 시간 증가. 현재까지 사파리 전용 회귀 사례 0건 — 발생 시 추가 |

**채택안의 트레이드오프**:

- chromium 전용이므로 사파리/파이어폭스 고유 회귀는 잡지 못한다. 로컬에서 사용자
  브라우저가 chromium 계열일 때 실효성 가장 높다는 가정.
- webServer 자동 기동을 끔으로써 e2e 실행 전 사용자가 컨테이너 상태를 직접
  관리해야 한다. 대신 재배포-검증 흐름이 단순하고 컨테이너 빌드/실행과 e2e
  실행이 명확히 분리된다.
- 게이트 적용 대상을 사람이 판단해야 한다 — 기계적 규칙으로 못 잡는 회색지대가
  존재 (ex: "텍스트만 바꾸는 것이지만 같은 텍스트가 다른 컴포넌트에서도 쓰임").
  의심스러우면 실행하는 쪽으로.

## 적용 범위 / 영향

- **현재 커버**: `frontend/e2e/automatic-pipelines.spec.ts`
  - 탭 라벨 (`Automatic Pipelines` / `Manual Pipelines`) 노출 검증
  - Auto-Run rule swap 흐름: 모달 → 확정 → 토스트 → Active 배지 갱신 → SVG
    라인 active 스타일 갱신 → 행 순서 보존
- **앞으로 커버되어야 할 영역** (미작성, 우선순위 순):
  - Manual Pipelines 탭 진입 흐름 (사이드바 → 탭 클릭 → URL 변경)
  - Pipeline Console 의 파이프라인 노드 추가/삭제 흐름
  - Job 실행 트리거 모달 (Run Pipeline)
  - Data Catalog 의 Raw Data 검색·필터링

새로운 흐름을 추가할 때마다 위 목록을 갱신하지는 않는다 — 실제 스펙 파일이
source of truth. 이 섹션은 "어떤 흐름까지 커버되었는가" 의 스냅샷일 뿐.

## 미해결 사항

- **CI 통합**: 현재는 로컬에서만 돌린다. GitHub Actions 에 e2e job 추가 시
  컨테이너 빌드 → 기동 → 테스트 실행 순서로 묶어야 한다. 별도 결정 필요.
- **데이터 시드 격리**: 현재 mock 서비스는 모듈 싱글톤이라 테스트 간 상태가
  공유된다. 테스트끼리 영향 주기 시작하면 `beforeEach` 에서 `localStorage` /
  쿠키 초기화 + 서비스 reset 메서드 추가 검토.
- **Visual regression**: 라인 좌표/색상 같은 시각적 회귀를 픽셀 단위로 잡는
  방식은 현재 미도입. 도입 시 Playwright 의 `expect(page).toHaveScreenshot()`
  활용 여지 있으나 flaky 위험.
- **Backend 연동 (`/current`)**: 현재 e2e 는 mock(`/plan`) 만 다룬다. 백엔드 연동
  검증은 별도 통합 환경 필요.
