# Automatic Pipelines Satellite Scope

- **결정 일자**: 2026-05-08
- **최근 검토**: 2026-05-08
- **상태**: Active
- **관련 코드**:
  - `frontend/src/components/panels/SelectSatelliteDialog.tsx` — 위성 선택 모달
  - `frontend/src/app/(planning)/plan/deployed/DeployedPipelinesPage.tsx` — `selectedSatellite`, `satelliteDialogOpen`, `ruleMatchesSatellite`, 헤더 chip, 모달 마운트
  - `frontend/src/components/panels/LeftSidebar.tsx` — Pipeline Execution 항목 아래 위성 배지 (`executionSatellite`, `onChangeExecutionSatellite`)
- **트리거 키워드**: 위성 선택, satellite scope, SelectSatelliteDialog, satelliteIds, 자동 파이프라인 위성, automatic pipelines satellite, sat filter, LumirX 스코프
- **Supersedes**: (없음)
- **Superseded by**: (없음)
- **연관 결정**: [`automatic-pipelines-tabs-and-swap.md`](./automatic-pipelines-tabs-and-swap.md) 의 §1(탭 라벨), §3(행 안정 정렬) 위에 위성 스코프 한 축을 추가하는 확장. 두 결정은 supersede 관계가 아니다.

## 배경

`PipelineActivationRule.match.satelliteIds` 는 이미 모델에 존재하지만, Automatic Pipelines 화면은 모든 위성의 룰을 한 화면에 합쳐 `(eventType, sourceQueue)` 그룹으로 보여줬다. 결과적으로 운영자에게는:

- "지금 보고 있는 룰이 어느 위성 대상인지" 가 행 안의 작은 chip 으로만 보였고,
- 다른 위성 룰과 같은 큐를 공유하면 같은 그룹 카드 안에 섞여 의도(swap conflict 인지, 단순 다른 위성용인지) 가 흐려졌고,
- "이 화면이 통째로 한 위성을 보고 있다" 는 mental model 이 잡히지 않아 사용자는 화면이 "특정 위성에 국한된 느낌" 을 받았지만 실제로는 그렇지 않다는 모순이 생겼다.

같은 `(eventType, sourceQueue)` 키에서 swap 흐름을 결정하는 `automatic-pipelines-tabs-and-swap.md` 의 룰은 위성 축을 고려하지 않으므로, 운영자가 위성을 명시적으로 좁혀 본다는 전제를 컨텍스트로 깔아주면 swap 모달의 "이 active 룰이 그 룰이구나" 인식도 단순해진다.

## 결정

Automatic Pipelines 화면 진입 시 **위성 1개를 강제로 선택** 하게 하고, 이후 화면 전체를 그 위성으로 스코프한다.

### 1. SelectSatelliteDialog (강제 1회 선택)

`frontend/src/components/panels/SelectSatelliteDialog.tsx` 신설. 디자인 패턴은 `SelectStartNodeDialog` 를 차용 — 카드형 옵션 + 라디오 indicator + Confirm.

- 옵션은 `SATELLITE_OPTIONS` (`LumirX-1`, `LumirX-2`, `LumirX-3`) 단일 선택.
- `cancellable=false` 인 강제 모드: 오버레이 클릭/Esc/X 버튼 모두 비활성화. Confirm 만이 유일한 출구.
- `cancellable=true` 인 재선택 모드: 사이드바 배지 / 헤더 chip 으로 다시 띄울 때 사용. Cancel 로 현재 선택 유지.

### 2. localStorage 영속화 — 최초 1회만 강제

키 `sdpe.automatic-pipelines.satellite` 에 마지막 선택을 저장. 페이지 진입 시:

1. `localStorage` 에 유효한 값이 있으면 → 그 값을 `selectedSatellite` 로 세팅, 모달은 띄우지 않는다.
2. 없거나 유효하지 않으면 → 모달을 강제 노출(`cancellable=false`).

SSR 단계에서는 `window` 에 접근할 수 없어 첫 렌더에 모달이 안 뜬다. `satelliteHydrated` 플래그가 client-only effect 에서 true 로 바뀐 뒤에야 모달을 마운트해 깜빡임을 방지한다.

`(planning)/plan` 과 `(current)/current` 모두 같은 키를 공유한다 — 두 환경이 동일한 mock/실데이터를 보여주는 게 아니지만, 운영자가 두 환경에서 같은 위성을 따라가는 게 일반적이라 키 분리는 과잉 결정. 분리 필요가 생기면 `:plan` / `:current` suffix 추가로 확장.

### 3. 룰 필터링: 위성 매치 + 전역 룰 포함

`matchingRules` 계산 시:

```
ids = rule.match.satelliteIds
matches = ids === undefined || ids.length === 0 || ids.includes(selectedSatellite)
```

- `satelliteIds` 가 비어있는 룰은 "모든 위성 대상" 의미라 항상 포함한다. 위성 필터를 켰다고 전역 룰이 사라지면 운영자가 그 룰의 존재를 놓치는 사고가 가능 — 채택안에서 차단.
- swap 충돌 감지(`EventGroupCard` 의 `rulesAll`) 는 여전히 *전체 rules* 를 본다. 다른 위성의 같은 `(eventType, sourceQueue)` active 룰을 swap 후보로 인식하는 기존 동작은 의도적으로 유지(위성 축이 다르면 충돌이 아닌데도 보이는 부작용은 별도 결정 필요 — 미해결 사항으로 분리).

### 4. 위성 컨텍스트의 두 진입점

운영자는 "지금 어느 위성을 보고 있는지" 를 두 곳에서 즉시 보고, 두 곳에서 모두 다시 띄울 수 있다.

1. **헤더 chip** — `PipelineExecutionTabs` 옆에 `Satellite: LumirX-N` chip. 클릭하면 `cancellable=true` 로 모달 재호출. 화면 시선의 1차 위치.
2. **사이드바 배지** — `LeftSidebar` 의 Pipeline Execution 항목 아래에 작은 mono 배지로 노출. 항목 자체에 "위성 컨텍스트" 가 묶여 있다는 걸 좌측 네비게이션에서도 즉시 인식. 클릭하면 동일하게 모달 재호출.
   - 단, 사이드바 배지는 `executionActive`(=deployed 또는 jobs 페이지) AND `executionSatellite` 가 set 된 경우에만 노출. 다른 페이지에서는 사이드바에 위성 컨텍스트가 들어오지 않게 한다 (위성 축은 자동 파이프라인 한정 결정).

### 5. 빈 상태 카피

- `selectedSatellite === null` (모달 첫 진입 직전) — "Select a satellite to inspect automatic pipelines"
- 위성은 골랐지만 그 위성용 룰이 0개 — "No automation rules scoped to {satellite}"

탭 카운터(`auto: matchingRules.length`) 도 필터링된 수가 보이도록 한다 — "지금 보고 있는 화면 = 카운터" 일치를 깨면 신뢰가 떨어진다.

## 대안과 트레이드오프

| 대안 | 장점 | 단점 / 채택하지 않은 이유 |
|---|---|---|
| 헤더에 위성 chip 그룹(All / LumirX-1 / 2 / 3) 인라인 노출 | 모달 없음, 한 번에 비교 가능 | "지금 어느 위성?" 이 화면 위쪽 chip 한 개를 *읽어야* 알 수 있고, "All" 이 기본이면 사용자 mental model 이 오히려 더 흐려짐. 다중 비교는 자주 일어나는 시나리오가 아님 |
| 다중 선택 (체크박스) | 두 위성 동시 비교 가능 | 룰 수가 많아지면 그룹 카드가 다시 섞여 "특정 위성에 국한" 문제로 회귀. 그룹 카드 헤더에 위성 배지 추가 등 부수 변경 비용 큼 |
| 첫 진입 시 자동으로 `SATELLITE_OPTIONS[0]` 선택 | 모달 없음 → 빠른 진입 | "지금 보는 게 LumirX-1" 임을 운영자가 인지 못하고 다른 위성 룰을 놓치는 사고 위험. 특히 다중 위성 운영 단계에서 위험 |
| URL 파라미터(`?sat=`) 로만 영속화 | 북마크 가능, 환경별 분리 자연스러움 | 현재 `/deployed` URL 은 다른 흐름에서도 쓰는 보편 경로 — 모든 진입 경로에 sat 파라미터를 붙이는 비용이 크고, 사용자가 매번 같은 위성을 보는 패턴에서 localStorage 가 더 가벼움 |
| Cancel 가능한 모달 (첫 진입에도) | 일관된 UX | "선택을 안 한 채로 화면 보기" 가 가능해져 위성 컨텍스트가 비어있는 정의되지 않은 상태가 생김. 그 상태의 빈 카피·동작을 또 정의해야 해 비용↑ |

**채택안의 트레이드오프**:

- 첫 진입 시 모달이 화면을 가리는 비용. Confirm 한 번이라 누르는 게 부담은 아니지만 e2e 등 자동화 흐름은 localStorage 를 미리 세팅해야 한다 (미해결 사항 아님 — 해당 e2e 스펙에서 처리).
- localStorage 키를 `(planning)`/`(current)` 가 공유. 두 환경에서 다른 위성을 보고 싶으면 별도 브라우저 프로필 필요. 분리 필요해지면 키에 환경 suffix 추가.
- "전역 룰(`satelliteIds` 비어있음)" 이 모든 위성 화면에 노출되어, 운영자가 같은 룰을 LumirX-1 / 2 / 3 화면 모두에서 보게 된다. 의도한 동작이지만, 룰 행에 "All satellites" 시각 표식을 넣을지는 별도 결정 사항으로 분리.

## 적용 범위 / 영향

- **현재**: `/plan/deployed` 와 `/current/deployed` 양쪽에 적용 (페이지 컴포넌트 공유). Manual Pipelines (`/jobs`) 는 위성 축을 가지지 않아 영향 없음.
- **e2e 영향**: 기존 `automatic-pipelines.spec.ts` 의 `beforeEach` 가 페이지 진입 직후 첫 그룹 카드를 기다리는데, 모달이 가리면 실패한다. 모든 deployed 진입 spec 은 `localStorage` 에 위성 키를 미리 세팅한 뒤 navigate 하도록 update — `frontend/e2e/automatic-pipelines-satellite-scope.spec.ts` 가 새로 모달 흐름을 검증하고, 기존 spec 들은 사전 세팅으로 모달을 우회한다.

## 미해결 사항

- **Cross-satellite swap conflict 표기**: 다른 위성의 같은 `(eventType, sourceQueue)` active 룰이 swap 후보로 잡히는 기존 동작을 위성 축을 고려해 분리할지. 현재는 그대로 둠 — 실제 운영에서 큐가 위성별로 분리되는 경향이라 부작용이 드물 것으로 판단.
- **전역 룰 시각 표식**: `satelliteIds` 비어있는 룰 행에 "All satellites" 배지 추가 여부. 현재는 행 안의 condition chip 영역에 "All conditions" 라벨로 묘사되지만 위성 한정 컨텍스트에서는 더 명시적으로 표기해야 할 수 있음.
- **`(planning)` / `(current)` 키 분리**: 두 환경에서 다른 위성을 보고 싶다는 요구가 들어오면 키에 환경 suffix 를 추가.
