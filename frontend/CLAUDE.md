@AGENTS.md

# SDPE Frontend

Next.js 기반 Pipeline Console UI.

## 프로젝트 구조

```
src/
  app/
    (planning)/                    # Route group — Mock 데이터 기반 개발 환경
      _context/                    # React Context (서비스 주입)
        pipeline-service-context.tsx
      _services/                   # Planning 전용 서비스 (mock)
        pipeline.mock.ts
        pipeline.mock.service.ts
      _ui/                         # 공유 UI 컴포넌트 (current에서도 import)
        ConsolePage.tsx
      plan/                        # URL: /plan
        page.tsx                   # Provider(mockService) + ConsolePage
    (current)/                     # Route group — 실제 백엔드 API 연결
      _services/                   # Current 전용 서비스 (API fetch)
        pipeline.current.service.ts
      current/                     # URL: /current
        page.tsx                   # Provider(currentService) + ConsolePage
    layout.tsx                     # 루트 레이아웃
    globals.css
  components/                      # 공유 UI 컴포넌트
    graph/                         # 파이프라인 캔버스 그래프
    panels/                        # 패널 컴포넌트 (사이드바, 탭 등)
    ui/                            # 범용 UI (Card, StatusBadge)
  services/                        # 공유 서비스 인터페이스
    pipeline.service.interface.ts  # IPipelineUIService (planning/current 공통)
  types/                           # 공유 타입 정의
    pipeline.ts
  lib/                             # 유틸리티
    utils.ts
```

## (planning) / (current) 패턴

서비스 인터페이스(`IPipelineUIService`)를 공유하고, 구현체만 환경별로 분리하는 구조.

- **서비스 주입**: `PipelineServiceProvider` (React Context)로 page.tsx에서 서비스 구현체를 주입
- **UI 재사용**: `(planning)/_ui/`의 컴포넌트를 `(current)`에서 import하여 동일 UI 사용
- **Planning** (`/plan`): Mock 데이터로 UI 개발/테스트
- **Current** (`/current`): 실제 백엔드 API (`/api/pipeline/*`) 연결

### 새 페이지 추가 시

1. `(planning)/_ui/`에 UI 컴포넌트 작성 (서비스는 `usePipelineService()` hook 사용)
2. `(planning)/plan/` 하위에 page.tsx 생성 — `PipelineServiceProvider(mockService)` 래핑
3. `(current)/current/` 하위에 page.tsx 생성 — `PipelineServiceProvider(currentService)` 래핑

### 서비스 인터페이스 확장 시

1. `services/pipeline.service.interface.ts`에 메서드 추가
2. `(planning)/_services/pipeline.mock.ts`에 mock 구현 추가
3. `(current)/_services/pipeline.current.service.ts`에 API fetch 구현 추가
