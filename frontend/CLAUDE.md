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
      plan/                        # URL: /plan
        layout.tsx                 # Provider(mockService) 공통 주입
        page.tsx                   # 홈 (HomePage 래퍼)
        HomePage.tsx               # 홈 페이지 컴포넌트
        audit/
          page.tsx                 # AuditPage 래퍼
          AuditPage.tsx            # 감사 로그 페이지 컴포넌트
        console/
          page.tsx
          ConsolePage.tsx
        ...                        # alerts, archive, products, profiles, queues
    (current)/                     # Route group — 실제 백엔드 API 연결
      _services/                   # Current 전용 서비스 (API fetch)
        pipeline.current.service.ts
      current/                     # URL: /current
        layout.tsx                 # Provider(currentService) 공통 주입
        page.tsx                   # (planning)/plan/HomePage 재사용
        audit/
          page.tsx                 # (planning)/plan/audit/AuditPage 재사용
        ...
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

- **서비스 주입**: `layout.tsx`에서 `PipelineServiceProvider`로 구현체를 공통 주입
  - `plan/layout.tsx` → `pipelineMockService`
  - `current/layout.tsx` → `pipelineCurrentService`
- **페이지 컴포넌트 colocation**: 각 라우트 폴더(`plan/<name>/`)에 페이지 컴포넌트(`<Name>Page.tsx`)를 page.tsx와 함께 배치
- **UI 재사용**: `(current)/current/<name>/page.tsx`는 `(planning)/plan/<name>/<Name>Page` 를 직접 import
- **Planning** (`/plan`): Mock 데이터로 UI 개발/테스트
- **Current** (`/current`): 실제 백엔드 API (`/api/pipeline/*`) 연결

### 새 페이지 추가 시

1. `(planning)/plan/<name>/<Name>Page.tsx` 작성 (서비스는 `usePipelineService()` hook 사용)
2. `(planning)/plan/<name>/page.tsx` — `<Name>Page`를 import하는 경량 래퍼
3. `(current)/current/<name>/page.tsx` — `@/app/(planning)/plan/<name>/<Name>Page` 를 import하는 경량 래퍼
4. Provider 주입은 불필요 — 이미 `layout.tsx`에서 공통 처리됨

### 서비스 인터페이스 확장 시

1. `services/pipeline.service.interface.ts`에 메서드 추가
2. `(planning)/_services/pipeline.mock.ts`에 mock 구현 추가
3. `(current)/_services/pipeline.current.service.ts`에 API fetch 구현 추가
