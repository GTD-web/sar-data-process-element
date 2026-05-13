# Automatic Pipelines Detail Right Panel — v3 (3-tab grouping)

- **결정 일자**: 2026-05-08
- **최근 검토**: 2026-05-08
- **상태**: Active
- **관련 코드**:
  - `frontend/src/components/panels/AutomaticPipelineDetailPanel.tsx` — 우측 패널 컴포넌트 (3탭 구조)
  - `frontend/src/components/panels/RightTabbedPanel.tsx` — 패널 컨테이너 (`title` 슬롯에 컨텍스트 헤더 주입; v2 와 동일)
  - `frontend/src/app/(planning)/plan/deployed/DeployedPipelinesPage.tsx` — `RightTabbedPanel.title` 에 파이프라인 이름 + Active 배지 + sourceQueue 노드 주입 (v2 와 동일)
  - `frontend/e2e/automatic-pipelines.spec.ts` — 3탭 노출/전환 + 탭 안 sub-section 헤딩 검증
- **트리거 키워드**: Automatic Pipelines 우측 패널, pipeline detail panel, detail tabs, 3탭, History 탭, Execution 탭, Outputs 탭, AutomaticPipelineDetailPanel, DETAIL_TABS, detail-tab-history, detail-tab-execution, detail-tab-outputs, panel header pipeline name, sdpe.reception.events 헤더
- **Supersedes**: automatic-pipelines-detail-panel-v2.md
- **Superseded by**: (없음)

## 배경

[v2](./automatic-pipelines-detail-panel-v2.md) 는 5섹션을 5탭으로 1:1 분리했다 (`Jobs / Latest / Steps / Products / Errors`). 의도는 "세로 stack 으로 폭주하던 정보량을 잘게 쪼개 한 번에 한 가지 답만 본다" 였지만, 운영 중 두 문제가 보고됐다:

1. **연관 정보가 떨어져 있다**. "지금 어디서 돌고 있나?(Latest)" 와 "어느 단계?(Steps)" 는 항상 같이 보고 싶은 정보다 — 운영자는 Latest 의 *Currently running* 박스에서 단계 이름을 보고, 그 단계의 NAS 경로/duration/에러 메시지를 Steps 카드에서 즉시 확인하고 싶은데, 두 탭이 분리되니 매번 탭 전환이 필요했다.
2. **에러 ↔ 산출물 비교**. 잡이 실패했을 때 "에러는 무엇이고, 그래도 어디까지 산출물이 떨어졌나?" 를 같이 본다. v2 에서 Products 와 Errors 가 별 탭이라 두 곳을 왔다 갔다 해야 했다.

5탭의 "한 가지 답" 분해가 오히려 "관련된 답을 묶어 보지 못한다" 로 변질된 것. v2 의 핵심 의도(세로 폭주 회피)는 유지하되, 그루핑은 "운영자가 한 번에 보고 싶은 묶음" 기준으로 다시 잡는다.

## 결정

3탭으로 재구성. 각 탭이 *연관 sub-section 묶음* 을 담는다.

### 1. 3탭 구성 (좌→우)

| 탭 ID | 라벨 | 담는 sub-section | 답하는 운영 질문 묶음 |
|---|---|---|---|
| `history` | History | Job history (1개) | "어느 잡을 볼지 고른다" — 컨텍스트 진입점 |
| `execution` | Execution | Latest execution + Step progress · NAS outputs | "지금 어디까지 갔고 / 단계는 어디고 / NAS 경로는?" — 한 잡의 *현재 상태* |
| `outputs` | Outputs | Output products + Recent error logs | "결과물 어디 있나 / 에러는 뭐가 떴나?" — 한 잡의 *결과* |

세 탭은 **운영 흐름의 phase** 와 1:1 — *컨텍스트 선택 → 진행 상황 추적 → 결과 점검*. v2 의 5섹션은 모두 보존되며, 시각 그루핑만 phase 기준으로 묶였다.

### 2. 기본 활성 탭은 `execution`

V2 의 기본 탭은 `history` 였다 — "잡 선택 진입점" 의 의도. V3 에서는 다음 이유로 `execution` 으로 변경:

- 패널은 룰 클릭으로 열리고, 최신 잡이 자동 선택된다 (`effectiveDetailJobId = selectedDetailJobId ?? latestJobId`). 즉 패널 진입 시점의 컨텍스트 잡은 이미 결정돼 있고, 운영자가 가장 자주 답을 받고 싶은 질문은 "지금 그 잡 어디?" 다.
- "다른 잡으로 컨텍스트를 바꾸고 싶다" 는 빈도가 더 낮은 시나리오 — 그 경우에만 History 탭으로 이동하면 된다 (한 번의 탭 클릭).
- v2 는 진입 직후 *Currently running* 박스를 보려면 운영자가 항상 Latest 탭으로 한 번 이동해야 했다. v3 의 default `execution` 은 그 클릭을 제거.

### 3. 탭 안 sub-section 시각 분리

Execution / Outputs 탭은 sub-section 2개씩을 세로로 쌓는다. 각 `Section` 은 `border-b border-border/60` 로 옅은 분리선, `last:border-b-0` 로 마지막 섹션은 분리선 없음. 헤딩(uppercase, tracking-wider, muted) 은 v1/v2 그대로 — 분리선과 헤딩이 같이 작용해 "한 탭 안의 두 묶음" 임을 시각적으로 즉시 인지.

V1 의 "5섹션 stack" 회귀처럼 보일 수 있으나 결정적 차이: 한 탭 안 sub-section 은 **최대 2개**. v1 의 *6섹션 일괄 stack* 의 정보량 폭주 문제는 재현되지 않는다.

### 4. 탭 카운트 배지

V2 와 동일한 정책 (0 이면 숨김), 단 카운트 대상이 줄었다:

- `history` — `pipelineJobs.length`
- `outputs` — `errorLogs.length`. 0 보다 클 때 destructive 색상 — "여기 에러가 있다" 는 *탭을 열기 전에* 인지 가능 (v3 에서도 핵심 안전장치).

`execution` 은 카운트 배지 없음 — 단일 잡 컨텍스트라 카운트 의미가 없다. Currently running / Last failure 박스 자체가 시선 신호 역할.

산출물 카운트는 outputs 탭 안에서 레벨별 chip 으로 노출되므로 탭 배지 중복 회피.

### 5. History → Execution 자동 전환

History 탭에서 Job 행 클릭 시:

1. `onSelectJob(jobId)` 호출 — 부모의 `selectedDetailJobId` state 갱신
2. `setActiveTab('execution')` — 같은 컴포넌트 내부 state 변경으로 자동 탭 전환

운영자의 클릭 의도("이 잡의 디테일을 보고 싶다") 에 즉시 응답한다. v3 초기에는 두 탭이 분리돼 있어 "잡 클릭 → 결과를 보려면 또 Execution 탭 클릭" 의 두 번 동작이 필요했다 — 그 분리감을 제거.

같은 잡을 다시 클릭하면 v2 와 동일한 토글 동작(`isSelected && pipelineJobs.length > 1` 일 때 `null` 로 deselect, fallback 으로 latest 선택) 을 유지하되, 그 경우에도 Execution 탭으로 전환 — "다시 latest 를 보겠다" 의도와 일치.

### 6. Step 카드 UI 재설계

V1/V2 의 step 카드는 `bg-muted/25` + 연속 텍스트 라인 구조라 (a) status 가 시각적으로 약하게 드러났고 (b) NAS 경로/duration/level 이 dot-구분 한 줄로 압축돼 가독성이 떨어졌다. V3 에서 카드를 4-zone 구조로 분리:

```
┌──────────────────────────────────────────┐
│ [01]  step label                  [Status]│  header (border-l 색은 status)
├──────────────────────────────────────────┤
│ [Level chip] [duration chip] [VT exceeded]│  meta chips
├──────────────────────────────────────────┤
│ NAS OUTPUT                                │  zone label (uppercase muted)
│ /mnt/nas/sdpe/output/...path...h5         │  font-mono break-all
├──────────────────────────────────────────┤
│ ⚠ ERROR                                   │  destructive zone label
│ error message text                        │
└──────────────────────────────────────────┘
```

- **Status-aware border**: RUNNING → `border-accent/40 + ring-1 ring-accent/15` (가벼운 글로우), FAILED → `border-destructive/40`, COMPLETED → `border-success/30`, 그 외 → `border-border`. 한 화면에 여러 카드가 있을 때 어느 단계가 진행/실패인지 한 눈에 잡힘.
- **Step number badge**: 헤더 좌측에 `01, 02, ...` mono 원형 배지. 단계 순서가 명시되어 운영자가 "어느 단계까지 갔나" 를 즉시 셀 수 있다.
- **Zone 분리선**: 각 zone (header / meta / NAS / error) 사이에 옅은 `border-t` 로 구분. zone label (uppercase tracking-wider muted) 이 zone 의 의미를 명시.
- **NAS 경로 가독성 개선**: 폰트 크기 9.5px → 10.5px, line-height `leading-relaxed`. 카드 폭 안에서 break-all 로 자연스럽게 줄바꿈.

### 7. CANCELED 잡은 자동 파이프라인 컨텍스트에서 제외

자동 트리거된 잡(`PIPELINE_AUTO`, `PARTIAL_REPROCESS`)은 운영 흐름상 cancel 되지 않는다 — cancel 은 운영자의 명시적 manual 액션이고, 자동 컨텍스트에 노출될 의미가 없다. `DeployedPipelinesPage.selectedPipelineJobs` 에 `job.status !== 'CANCELED'` 필터를 추가해 다음을 한 번에 차단:

- Job history 탭의 잡 리스트
- History 탭 카운트 배지(`pipelineJobs.length`)
- Latest execution 의 jobId/status (latest fallback 도 CANCELED 가 아닌 잡으로)
- Output products / Recent error logs (둘 다 `selectedPipelineJobIds` 로 잡 필터)

가능한 잡 상태: `CREATED`(대기) / `ASSIGNED`(실행 중) / `COMPLETED`(성공) / `FAILED`(실패, retryCount 표기로 "재시도 실패" 인지 가능). UI 잡 카드는 `JobStatusBadge` 가 status + retryCount 를 그대로 받아 표시 — "재시도 실패" 는 별도 status 가 아닌 `FAILED + retryCount > 0` 의 시각적 표현.

이 결정은 mock data 의 CANCELED 발생을 막지 않고 *UI 측에서 가린다* — 같은 파이프라인이 manual 로도 트리거돼 CANCELED 잡이 들어오는 시나리오에 대비한 방어. 자동 패널이 책임지는 컨텍스트는 "자동 트리거된 잡들의 상태" 라는 의미상의 일관성을 유지.

### 8. Job 이력의 시간 정합성

같은 파이프라인의 잡들은 같은 CSC 큐(`sdpe.jobs.csc03~06`) 를 통해 시간 순서대로 dispatch 된다 (`interfaces/csc-8/README.md`). 과거 잡이 PENDING/RUNNING 인데 신규 잡이 COMPLETED/FAILED 인 시퀀스는 정상 운영에서 anomaly — 워커 stuck / 큐 막힘의 시그널이지 정상 상태가 아니다.

Mock 의 `generateJobs` 는 이를 재현하지 않도록 status 할당을 시간 정합성에 맞춰 강제한다:

- `p === 0` (가장 오래된 primary 잡): 항상 `COMPLETED` (RAW 처리의 첫 결과 보장)
- `p >= primaryCount - 2` (최신 2개 잡): `pickStatus()` — `CREATED`/`ASSIGNED`/`COMPLETED`/`FAILED`/`CANCELED` 모든 상태 가능 (transient window)
- 그 외(중간 잡들): `pickTerminalStatus()` — `COMPLETED` 85% / `FAILED` 15% 만 (이미 끝난 잡)

partial 파이프라인 loop 도 동일한 윈도우 적용. 결과적으로 패널의 Job history 탭은 과거 → 종료, 최신 1~2개만 진행 중/대기 중인 자연스러운 시퀀스를 보여준다. Display 정렬(updatedAt desc) 과 결합하면 사용자에게 "위에서 아래로 갈수록 오래된 잡, 모두 완료/실패" 가 보이고 상단 1~2 슬롯만 RUNNING/PENDING 일 수 있다.

### 9. 변경되지 않은 결정

V2 에서 그대로 가져온다:

- 컨텍스트 헤더(파이프라인 이름 + Active 배지 + sourceQueue) 는 `RightTabbedPanel` 의 `title` 슬롯에 직접 주입. 룰 미선택 시엔 `"Pipeline detail"` 문자열 fallback.
- 패널 안 모든 라벨/안내/empty state/tooltip 은 영문.
- NAS 경로는 step 카드 안 inline (`outputPath` 박스). raw-data-title-naming.md 의 stem-preserving 파일명.
- 데이터 로딩 정책: page mount 시 jobs+logs+pipelines+rules, `selectedRule` 변경 시 `selectedDetailJobId` 초기화, products 클라이언트 필터.

## 대안과 트레이드오프

| 대안 | 장점 | 단점 / 채택하지 않은 이유 |
|---|---|---|
| 2탭 (History / Detail = Latest+Step+Products+Errors) | 가장 단순, 탭 전환 비용 최소 | Detail 탭이 4 sub-section 을 세로로 쌓아 v1 의 "세로 폭주" 문제로 부분 회귀. 2번째 탭 안에서 다시 스크롤 비용 발생 |
| v2 5탭 유지 | 한 탭 = 한 sub-section 의 일관성 | 보고된 두 문제(Latest↔Steps 분리, Products↔Errors 분리) 미해결 |
| Phase 기반 3탭 (채택안) | "운영자가 한 번에 보고 싶은 묶음" 그루핑이 명시적 | sub-section 이 2개씩 쌓이는 탭에서는 작은 스크롤 발생 가능 (v1 같은 폭주는 아님) |
| 1탭 (= 무탭) + 기본 collapsed sections | 어느 sub-section 도 같이 보거나 따로 보기 자유로움 | 운영자가 매번 펼치기/접기를 결정하는 인지 부담. 탭 패턴과의 일관성도 깨짐 |
| Latest+Step 만 한 탭, 나머지는 v2 처럼 분리 (4탭) | 보고된 1번 문제만 해결 | 보고된 2번 문제(Products↔Errors) 미해결. 절반만 해결한 어중간한 안 |

**채택안의 트레이드오프**:

- Execution / Outputs 탭 안에서 두 sub-section 사이 스크롤이 필요할 수 있다. 단, 스크롤 거리는 최대 두 sub-section 분이라 v1 의 6sub-section 일괄 stack 보다 짧다.
- 기본 탭이 `execution` 으로 바뀌면서 v2 와 다르게 패널을 처음 열었을 때 보이는 화면이 다르다. v2 → v3 과도기에 운영자가 "Job history 가 안 보이네" 로 헷갈릴 수 있으나, History 탭이 leftmost 라 한 클릭으로 도달.
- "잡을 자주 바꾸는" 운영자에게는 v2 가 미세하게 더 효율적. 그러나 "최신 잡의 진행 상황을 모니터링" 이 메인 시나리오라 판단 — 잡 빈번 전환이 메인 시나리오로 바뀌면 default 재검토.

## 적용 범위 / 영향

- **현재**: `/plan/deployed` 와 `/current/deployed` 양쪽 (페이지 컴포넌트 공유). props 변경 없음, 컴포넌트 내부 구조만 변경.
- **e2e 영향**: `automatic-pipelines.spec.ts` 의 탭 testid 가 `detail-tab-{history|execution|steps|products|errors}` → `detail-tab-{history|execution|outputs}` 로 줄어든다. 헤딩 검증은 sub-section 단위 (탭을 열면 2개 헤딩이 같이 보여야 한다) 로 update.
- **다른 결정에 영향 없음**: `automatic-pipelines-tabs-and-swap.md`, `automatic-pipelines-satellite-scope.md`, RightTabbedPanel.title 슬롯 결정 모두 직교.

## 미해결 사항

- **Execution 탭 안 두 sub-section 간 결합 강화**: 현재는 단순히 세로로 쌓고 분리선만 그린다. Currently running 박스의 단계 이름을 클릭하면 아래 Step progress 의 해당 카드로 스크롤·하이라이트 하는 인터랙션 추가 검토 (v3 에 포함하지 않음 — 별도 검증 필요).
- **활성 탭 영속화**: 룰 변경 시 마지막에 보던 탭을 유지할지, default 로 reset 할지. 현재 동작은 컴포넌트 unmount 가 아닌 props 변경이라 *유지*. 운영자가 Outputs 탭에서 한 룰의 결과를 보다 다른 룰을 클릭하면 그 룰의 Outputs 탭이 바로 보임 — 의도된 동작이지만 새 룰의 Currently running 부터 봐야 한다는 의견이 들어오면 reset 으로 변경.
- **모바일/좁은 폭**: 3탭은 v2 의 5탭보다 폭 여유. 패널 폭 320px 미만에서도 가로 스크롤 없이 노출.
