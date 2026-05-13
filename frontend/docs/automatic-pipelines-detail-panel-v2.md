# Automatic Pipelines Detail Right Panel — v2 (tabbed)

- **결정 일자**: 2026-05-08
- **최근 검토**: 2026-05-08
- **상태**: Superseded by automatic-pipelines-detail-panel-v3.md
- **Superseded on**: 2026-05-08
- **관련 코드**:
  - `frontend/src/components/panels/AutomaticPipelineDetailPanel.tsx` — 우측 패널 컴포넌트 (탭 구조)
  - `frontend/src/components/panels/RightTabbedPanel.tsx` — 패널 컨테이너 (`title` 슬롯이 ReactNode 를 받아 파이프라인 컨텍스트 헤더를 그린다)
  - `frontend/src/app/(planning)/plan/deployed/DeployedPipelinesPage.tsx` — `RightTabbedPanel.title` 에 파이프라인 이름 + Active 배지 + sourceQueue 노드를 주입
  - `frontend/e2e/automatic-pipelines.spec.ts` — 5탭 노출/전환/콘텐츠 + 패널 헤더 컨텍스트 검증
- **트리거 키워드**: Automatic Pipelines 우측 패널, pipeline detail panel, detail tabs, 탭 패널, panel header pipeline name, sdpe.reception.events 헤더, Active 배지 헤더, Job history 탭, Latest execution 탭, Step progress 탭, Output products 탭, Error logs 탭, AutomaticPipelineDetailPanel, DETAIL_TABS, detail-tab-history, RightTabbedPanel title slot
- **Supersedes**: automatic-pipelines-detail-panel.md
- **Superseded by**: automatic-pipelines-detail-panel-v3.md

## 배경

이전 결정([v1](./automatic-pipelines-detail-panel.md))은 우측 패널을 5섹션 고정 순서의 세로 stack 으로 정의했다 — Header → Job history → Latest execution → Step progress · NAS outputs → Output products → Recent error logs. "패널 열자마자 4가지 운영 질문에 한눈에 답한다" 가 핵심 의도였다.

운영 중 다음 두 문제가 누적됐다:

1. **세로 길이가 폭발한다**. Job history 10건 + step 카드 7-8개 + product thumbnail 6개 + error log 8건 이 한 패널에 직렬로 쌓이면 패널 폭 420px × 세로 ~2200px. 운영자는 자기가 보는 섹션을 찾으려 매번 스크롤해야 했고, "한눈에" 의도가 도리어 "스크롤 사이로 흩어지는" 결과로 변질됐다.
2. **시선 우선순위가 흐려진다**. Step progress 카드들이 패널의 절반 이상 면적을 먹어, 그보다 위에 있는 Latest execution 의 Currently running 박스가 시선에서 묻혔다. 패널을 다시 위로 스크롤해야 "지금 어디?" 답을 받을 수 있었다.

V1 의 "고정 순서" 자체는 시선 흐름을 보장하기 위한 것이었지만, 화면 공간 제약 안에서 이 흐름이 작동하려면 동시에 보여야 하는 정보량을 줄여야 한다.

## 결정

V1 의 5섹션을 그대로 유지하되, **세로 stack → 5탭 strip** 으로 레이아웃만 변경한다. 4가지 운영 질문 ↔ 섹션의 1:1 매핑은 변경 없음.

### 1. 컨텍스트 헤더는 RightTabbedPanel 의 title 슬롯에 직접 주입

파이프라인 이름 + Active/Inactive 배지 + 트리거 큐(`sdpe.reception.events` 등)는 어떤 탭을 보고 있든 항상 노출. 어느 탭을 열어도 "지금 어떤 룰/파이프라인을 보고 있는지" 컨텍스트가 사라지지 않게 잠금.

렌더 위치는 `RightTabbedPanel` 의 `title` 슬롯 — 종전엔 `"Pipeline detail"` 라벨이 떠 있던 panel chrome 자리에 풍부한 컨텍스트 노드를 주입한다. 이로써 (a) panel chrome 의 정적 라벨 한 줄 + (b) 패널 본문 첫 섹션의 헤더 한 줄 이렇게 같은 정보가 두 번 나오는 시각 노이즈를 제거. `RightTabbedPanel.title` 의 타입은 `string → React.ReactNode` 로 확장됐고, 문자열을 넘기면 종전과 동일한 muted 라벨 스타일로 fallback.

룰 미선택 상태에서는 title 이 그대로 `"Pipeline detail"` 문자열 — 컨텍스트가 없으니 일반 라벨로 회귀.

### 2. 5탭 구성 (좌→우 순서)

| 탭 ID | 라벨(짧음) | 헤딩(원래 문구 보존) | 답하는 운영 질문 |
|---|---|---|---|
| `history` | Jobs | Job history | "이 파이프라인의 잡 이력은?" / 컨텍스트 잡 선택 |
| `execution` | Latest | Latest execution | "지금 어디서 돌고 있나?" |
| `steps` | Steps | Step progress · NAS outputs | "어느 단계? NAS 경로는?" |
| `products` | Products | Output products | "산출물 어디서 보나?" |
| `errors` | Errors | Recent error logs | "에러는 뭐가 떴나?" |

탭 라벨은 짧게(420px 폭에 5개 들어가야 함), 탭을 열면 보이는 섹션 헤딩은 원래 문구(`Job history`, `Latest execution`, ...) 그대로 유지. 탭 라벨과 헤딩의 매핑은 코드의 `DETAIL_TABS` 상수가 단일 소스.

탭 순서는 V1 의 vertical 순서를 그대로 따른다 — 운영 흐름(잡 선택 → 현재 상태 → 단계 → 산출물 → 에러) 이 좌→우 로 옮겨졌을 뿐 의미는 동일.

### 3. 기본 탭은 `history`

V1 에서 "Job history 가 가장 위 — 운영자가 잡을 골라 컨텍스트를 결정하면 아래 섹션들이 그 잡 기준으로 갱신되는 구조라, 선택 진입점을 패널 첫머리에 둔다" 의 의도를 그대로 보존: 패널을 처음 열면 Jobs 탭이 활성. 사용자가 다른 잡을 고르고 싶으면 바로 첫 탭에서 처리, 그 후 Latest/Steps 탭으로 이동해 그 잡의 디테일을 본다.

### 4. 탭 카운트 배지

다음 탭에는 카운트 배지를 붙여 "이 탭을 열기 전에 볼 게 있는지" 를 즉시 안내한다.

- `history` — `pipelineJobs.length`
- `products` — `products.length`
- `errors` — `errorLogs.length` (0 보다 클 때 destructive 색상)

`execution` 과 `steps` 는 카운트 배지 없음 — 항상 1개 컨텍스트(선택된 잡 1개)라 카운트가 의미 없다.

배지가 0 이면 노출하지 않는다 — "0 표시" 가 시각 노이즈가 되어 정작 1+ 일 때 눈에 안 들어오는 효과.

### 5. NAS 경로는 여전히 step 카드 안 inline

V1 의 §"NAS 경로는 단계와 강하게 결합 → step 카드 안에 inline" 결정은 그대로. 탭 분리로 Steps 탭 안에서만 NAS 경로가 보인다는 효과가 추가됐을 뿐, 단계와 경로의 시각적 1:1 결합은 유지.

### 6. 카피 정책

V1 의 §"패널 안 모든 라벨/안내/empty state/tooltip 은 영문" 결정 그대로. 탭 라벨도 영문(`Jobs`, `Latest`, `Steps`, `Products`, `Errors`).

### 7. 데이터 로딩 정책

V1 의 §"데이터 로딩 정책" 그대로 — `selectedRule` 변경 시 detail job override 갱신, product 클라이언트 필터 등. 탭 전환은 *순수 클라이언트 state 전환* 이라 추가 fetch 없음.

## 대안과 트레이드오프

| 대안 | 장점 | 단점 / 채택하지 않은 이유 |
|---|---|---|
| V1(5섹션 stack) 유지 + 각 섹션을 collapsible 로 | 변경 폭 최소 | 운영자가 매번 5번 펼치기/접기를 결정해야 해 인지 부담↑. 같은 정보량 문제는 해소 안 됨 |
| 2탭 (Job history / 나머지 4 합친 탭) | 탭 전환 비용 적음 | "나머지 4" 가 다시 v1 처럼 세로 stack 으로 길어진다 — 정보량 폭주 문제가 부분적으로만 해소 |
| 3탭 (Jobs / Execution(=Latest+Step) / Outputs(=Products+Errors)) | 시선 우선순위(현재 상태 vs 결과물) 그루핑이 자연스러움 | Latest execution 의 Currently running 박스와 Step progress 의 Currently running step 표시가 한 탭에서 중복돼 시선이 두 번 분산 |
| Vertical tab strip (좌측 세로 탭) | 탭 라벨이 길어도 OK | 패널 폭 420px 에서 좌측 80px 를 또 빼면 컨텐츠 영역이 좁아져 NAS 경로 break-all 가독성↓. shadcn 기본 가로 탭 strip 패턴과의 일관성도 깨짐 |
| 패널 폭을 540px+ 로 확장하고 stack 유지 | 정보량 다 보임 | 메인 컨텐츠 폭 침식. `MAPPING_CONTENT_MIN_WIDTH = 1180` + 540 = 1720px 미만 화면에서 가로 스크롤 발생. 채택안과 비교해 일반 화면에서의 손해가 큼 |

**채택안의 트레이드오프**:

- 한 번에 한 탭만 보이므로 "패널 열자마자 4가지 답을 받는다" 의 1번 흐름은 약화. Mitigation: Header 에 active/queue 컨텍스트 상시 노출, errors 탭 카운트 배지(destructive 색)로 "지금 에러가 있는가?" 는 탭을 열지 않아도 인지 가능.
- 탭 전환은 한 번의 클릭이지만 마우스 이동 비용이 추가. 패널 안에서만 일어나므로 클릭당 거리가 짧아 실제 비용은 작다.
- 탭 전환 시 스크롤 위치는 탭 단위로 리셋된다 (각 탭이 자체 컨테이너라 자연스러움). V1 의 한 패널 내 스크롤 위치 기억은 사라지지만, 잡 선택을 바꾸지 않는 한 탭 안에서 스크롤은 짧아 영향 미미.

## 적용 범위 / 영향

- **현재**: `/plan/deployed` 와 `/current/deployed` 양쪽에 적용 (페이지 컴포넌트 공유). props 변경 없음, 컴포넌트 내부 구조만 변경.
- **e2e 영향**: `automatic-pipelines.spec.ts` 의 두 케이스 update.
  - "5섹션 모두 보이는지" 케이스 → "5탭 모두 노출 + 각 탭 전환 시 해당 헤딩만 보이는지" 로 변경.
  - Step progress / Output products 검증 케이스 → 검증 전에 해당 탭 클릭 단계 추가.
  - 새 케이스: 기본 탭은 history, 다른 탭의 헤딩은 처음에 안 보임.
- **다른 결정에 영향 없음**: `automatic-pipelines-tabs-and-swap.md`(상위 페이지 탭/스왑), `automatic-pipelines-satellite-scope.md`(위성 스코프 모달) 모두 우측 패널과 직교한 결정.

## 미해결 사항

- **에러 탭 자동 활성화**: 새 에러가 들어왔을 때 Errors 탭 자체를 깜빡이거나 자동 활성화할지. 현재는 카운트 배지 destructive 색만으로 감지. 강한 알람이 필요하다는 피드백이 들어오면 별도 결정.
- **활성 탭 상태 영속화**: 룰을 바꿔도 마지막에 보던 탭을 유지할지(현재는 컴포넌트 unmount 가 아니라 props 변경이라 state 유지됨), 또는 룰 변경 시 history 로 reset 할지. 현재 동작은 "유지" — 운영자가 같은 탭 컨텍스트로 룰을 비교하기 좋다는 판단. 다른 룰을 보면 다시 history 부터 시작하는 게 맞다는 피드백이 오면 변경.
- **모바일/좁은 폭 대응**: 패널 폭 320px 미만에서는 5탭이 가로로 스크롤된다 (`overflow-x-auto`). UI 폭 가이드라인이 모바일을 다루기 시작하면 별도 결정.
