<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Frontend Architecture Rules

## (planning) / (current) Route Group 패턴

이 프로젝트는 Lumir-ERP의 planning/current 패턴을 따른다.

### 핵심 원칙

- **UI 컴포넌트**는 `(planning)/_ui/`에 작성한다. `(current)`에서는 import만 한다.
- **서비스 인터페이스** (`services/pipeline.service.interface.ts`)는 공유한다.
- **서비스 구현체**는 환경별로 분리한다:
  - `(planning)/_services/` — Mock 데이터
  - `(current)/_services/` — 백엔드 API fetch
- **서비스 주입**은 React Context (`PipelineServiceProvider`)를 통해 page.tsx에서 한다.
- UI 컴포넌트 내부에서는 `usePipelineService()` hook으로 서비스에 접근한다.

### URL 라우팅

- `(planning)/plan/...` → `/plan/...`
- `(current)/current/...` → `/current/...`
- Route group 괄호 `()` 는 URL에 포함되지 않고, 하위의 `plan/`, `current/` 폴더가 실제 URL segment가 된다.

### 금지 사항

- `(current)/_ui/`에 UI 컴포넌트를 작성하지 않는다 — `(planning)/_ui/`에서 가져온다.
- 서비스 구현체를 컴포넌트에 직접 import하지 않는다 — Context를 통해 주입한다.
- `(planning)`과 `(current)`에서 같은 URL path로 page.tsx를 만들지 않는다.
