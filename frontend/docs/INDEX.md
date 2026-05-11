# Design Decisions Index

`frontend/docs/` 의 모든 design decision 문서를 한 곳에 압축. UI 변경 작업
전에 이 파일을 1회 읽고, "건드리는 코드/요청 키워드가 어떤 active 결정과
매치되는지" 를 판단한다.

각 항목 형식:
`[문서] — 한 줄 요약 — <관련 코드/심볼>`

## Active

- [raw-data-title-naming.md](./raw-data-title-naming.md) — Raw Data 파일명은 Sentinel-1 차용 9-슬롯 포맷 (`LX{n}_{Mode}_{Type}_{LSP}_{startUTC}_{stopUTC}_{Flight}_LA{angle}_{Hash}.h5`) — `pipeline.mock.ts:formatRawDataTitle`, `DataCatalogPage.tsx:RawDataList`
- [automatic-pipelines-tabs-and-swap.md](./automatic-pipelines-tabs-and-swap.md) — Pipeline 실행 컨텍스트는 `Automatic Pipelines` / `Manual Pipelines` 대칭 라벨, Auto-Run rule swap 은 deactivate→activate 순서로 라인 재연결, 행 순서 안정 정렬(sourceQueue→id) — `PipelineExecutionTabs.tsx`, `LeftSidebar.tsx`, `DeployedPipelinesPage.tsx:handleConfirmSwap`, `matchingRules`
- [automatic-pipelines-detail-panel-v3.md](./automatic-pipelines-detail-panel-v3.md) — Automatic Pipelines 우측 패널은 컨텍스트 헤더(`RightTabbedPanel.title` 슬롯) + 3탭(History / Execution=Latest+Steps+NAS / Outputs=Products+Errors). 기본 탭 execution. 카운트 배지는 history(jobs)/outputs(errors, destructive). NAS 경로는 Execution 탭의 step 카드 안 inline — `AutomaticPipelineDetailPanel.tsx`, `DETAIL_TABS`, `automatic-pipelines.spec.ts`
- [automatic-pipelines-satellite-scope.md](./automatic-pipelines-satellite-scope.md) — Automatic Pipelines 화면은 진입 시 위성 1개를 강제 선택하고 화면 전체를 그 위성으로 스코프, localStorage 영속화, 헤더 chip / 사이드바 배지로 재선택, 전역 룰(`satelliteIds` 비어있음)은 항상 포함 — `SelectSatelliteDialog.tsx`, `DeployedPipelinesPage.tsx:selectedSatellite`, `LeftSidebar.tsx:executionSatellite`
- [playwright-ui-verification.md](./playwright-ui-verification.md) — UI 기획 변경(탭/모달/정렬/토글/폼 흐름)은 마무리 전 `npm run e2e` 통과 필수. chromium 단일, baseURL=`http://localhost:3010` — `frontend/e2e/*.spec.ts`, `playwright.config.ts`, `AGENTS.md:Playwright UI 검증`

## Superseded / Deprecated

- [automatic-pipelines-detail-panel.md](./automatic-pipelines-detail-panel.md) — *Superseded by [automatic-pipelines-detail-panel-v2.md](./automatic-pipelines-detail-panel-v2.md) on 2026-05-08* — 우측 패널 5섹션 고정 세로 stack. v2 에서 동일 5섹션을 탭 strip 으로 변경.
- [automatic-pipelines-detail-panel-v2.md](./automatic-pipelines-detail-panel-v2.md) — *Superseded by [automatic-pipelines-detail-panel-v3.md](./automatic-pipelines-detail-panel-v3.md) on 2026-05-08* — 우측 패널 5탭(Jobs/Latest/Steps/Products/Errors) 분리. v3 에서 phase 기반 3탭(History / Execution / Outputs) 그루핑으로 재구성.

## 사용법

UI/식별자/레이아웃 관련 코드 수정 전:

1. 위 Active 목록을 훑어 영향 받는 항목이 있는지 확인.
2. 매치되면 해당 문서를 열고 "결정" 섹션을 사용자에게 인용.
3. 사용자에게 "이 결정을 바꾸는 변경인가?" 명시 확인.
4. 바꾸는 거라면 [README.md 의 Supersession 워크플로](./README.md#supersession-워크플로) 따라 처리.
5. 무관한 변경이면 그냥 진행.
