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
