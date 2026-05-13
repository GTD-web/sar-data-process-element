<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Frontend Architecture Rules

## (planning) / (current) Route Group 패턴

이 프로젝트는 Lumir-ERP의 planning/current 패턴을 따른다.

### 핵심 원칙

- **페이지 컴포넌트 colocation**: 페이지 컴포넌트는 해당 라우트 폴더에 colocate 한다 (`(planning)/plan/<name>/<Name>Page.tsx`).
- **공통 레이아웃**: Provider 주입은 각 route group의 `layout.tsx`에서 한 번만 한다.
  - `(planning)/plan/layout.tsx` → `PipelineServiceProvider(pipelineMockService)`
  - `(current)/current/layout.tsx` → `PipelineServiceProvider(pipelineCurrentService)`
- **UI 재사용**: `(current)` 의 각 `page.tsx` 는 `(planning)/plan/<name>/<Name>Page` 를 직접 import 한다. `(current)` 에 별도의 페이지 컴포넌트 파일을 만들지 않는다.
- **서비스 인터페이스** (`services/pipeline.service.interface.ts`)는 공유한다.
- **서비스 구현체**는 환경별로 분리한다:
  - `(planning)/_services/` — Mock 데이터
  - `(current)/_services/` — 백엔드 API fetch
- UI 컴포넌트 내부에서는 `usePipelineService()` hook으로 서비스에 접근한다.

### URL 라우팅

- `(planning)/plan/...` → `/plan/...`
- `(current)/current/...` → `/current/...`
- Route group 괄호 `()` 는 URL에 포함되지 않고, 하위의 `plan/`, `current/` 폴더가 실제 URL segment가 된다.

### 금지 사항

- `(planning)` 에 `_ui/` 를 만들어 페이지 컴포넌트를 모아두지 않는다 — 각 라우트 폴더에 colocate 한다.
- `(current)` 에 페이지 컴포넌트 파일을 만들지 않는다 — `(planning)/plan/` 에서 가져온다.
- `page.tsx` 에서 Provider 를 직접 주입하지 않는다 — `layout.tsx` 가 담당한다.
- 서비스 구현체를 컴포넌트에 직접 import하지 않는다 — Context 를 통해 주입한다.
- `(planning)` 과 `(current)` 에서 같은 URL path 로 page.tsx 를 만들지 않는다.

## Design Decisions: frontend/docs

`frontend/docs/` 의 각 문서는 코드만 봐선 알 수 없는 UI/식별자/레이아웃
결정의 근거를 보존한다. UI/식별자/카드 레이아웃/네이밍 관련 코드를 수정하기
전에:

1. `frontend/docs/INDEX.md` 를 읽고 영향 받는 active 결정이 있는지 확인한다
   (관련 코드 경로 매치 또는 트리거 키워드 매치).
2. 매치되면 해당 문서의 "결정" 섹션을 사용자에게 인용해 보여주고
   "이 결정을 바꾸는 변경인가?" 명시적으로 확인을 받는다.
3. 사용자가 변경을 승인하면, `frontend/docs/README.md` 의 supersession
   워크플로에 따라 코드 변경과 함께 문서도 업데이트한다.
4. 결정과 무관한 변경(스타일 미세 조정, 버그 수정 등)이면 그냥 진행한다.

## Playwright UI 검증

`frontend/e2e/` 의 Playwright 스펙은 UI 기획 변경(탭/모달/리스트 정렬/상태 토글 등
사용자 흐름)을 마무리하기 전에 통과해야 하는 회귀 게이트다. 코드만 보고서는
검증할 수 없는 "흐름이 의도대로 도는가" 를 잡기 위함.

### 마무리 체크리스트 (UI 기획 변경 작업 시)

다음 중 하나라도 해당하는 변경이면 **사용자에게 최종 보고하기 전** 에 e2e
테스트를 실행하고 통과를 확인한다.

- 탭/메뉴 라벨, 사이드바 항목명, 페이지 타이틀 변경
- 모달 추가/제거, 모달 안의 동작 변경 (확인/취소/스왑/삭제 등)
- 리스트 정렬 기준, 행 순서, 행 안의 상태 토글 (Active/Inactive 등)
- 폼 필드 추가/제거, 필수 조건, 버튼 활성화 조건
- 탭 간 이동 / 라우팅 흐름

순수 스타일 미세 조정, 색상/여백 변경, 타입 시그니처 정리, 버그 수정 (UI
흐름과 무관) 은 e2e 게이트에서 제외한다.

### 실행 절차

1. 컨테이너가 `http://localhost:3010` 에 떠 있는지 확인 (재배포 직후라면 자동 충족).
2. `cd frontend && npm run e2e` — 모든 스펙 실행. 실패 시 원인 분석 후 수정.
3. 변경한 흐름이 기존 스펙으로 커버되지 않으면 `frontend/e2e/<topic>.spec.ts` 를
   추가하거나 기존 스펙을 보강한 뒤 다시 실행.
4. 모두 통과해야 작업 종료. 실패한 채 응답을 마치지 않는다.

설정·관례·예시는 `frontend/docs/playwright-ui-verification.md` 참고.

## Post-change Deployment

- `frontend/` 변경 작업이 끝나면 최종 응답 전에 다음 명령을 실행해 프론트엔드 컨테이너를 재배포한다. 사용자가 명시적으로 하지 말라고 한 경우만 생략한다.
- **빌드 컨텍스트는 repo root** (CSC natives 를 컨테이너에 동봉하기 위함). H5 입력은 컨테이너로 직접 업로드(multipart)하므로 호스트 볼륨 마운트는 불필요.
- `docker rm -f sdpe-frontend 2>nul & docker build -t sdpe-frontend:latest -f "C:\Users\USER\dev\sar-data-process-element\frontend\Dockerfile" "C:\Users\USER\dev\sar-data-process-element" && docker run -d --name sdpe-frontend -p 3010:3000 sdpe-frontend:latest`
- 재배포 후 위 "Playwright UI 검증" 체크리스트 적용 대상이면 `npm run e2e` 통과까지 확인한다.
- CSC-03/04 시연 통합 전체는 `frontend/docs/csc-demo-integration.md` 참고.
