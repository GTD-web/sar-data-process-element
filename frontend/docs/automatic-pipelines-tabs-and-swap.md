# Pipeline Execution Tabs / Auto-Run Rule Swap

- **결정 일자**: 2026-05-07
- **최근 검토**: 2026-05-07
- **상태**: Active
- **관련 코드**:
  - `frontend/src/components/panels/PipelineExecutionTabs.tsx` — 탭 라벨/순서
  - `frontend/src/components/panels/LeftSidebar.tsx` — Manual Pipelines 사이드바 섹션
  - `frontend/src/app/(planning)/plan/deployed/DeployedPipelinesPage.tsx` — `handleSaveRule`, `handleConfirmSwap`, swap 모달
- **트리거 키워드**: Automatic Pipelines, Manual Pipelines, Job Execution History, Auto-Run Mapping, swap, Swap the active automation rule, deactivate, activate, 라인 연결, automation rule, matchingRules, 행 순서, 안정 정렬
- **Supersedes**: (없음)
- **Superseded by**: (없음)

## 배경

Pipeline Console 의 실행 컨텍스트는 두 개로 나뉜다.

1. **Auto-Run Mapping Rule** — pgmq 이벤트가 도착했을 때 자동으로 파이프라인을 트리거하는 규칙 (1:1, 같은 event·queue 키에 동시에 active 가능한 rule 은 하나).
2. **수동 실행** — 사용자가 직접 파이프라인을 트리거해 생긴 Job 들 (수동 트리거의 결과물).

이전 라벨 `Job Execution History` 는 수동 실행 컨텍스트를 "Job 이력" 으로 표현해 자동(Automatic Pipelines) 과의 대칭이 약했다. 또한 한 event·queue 키에 다른 active rule 이 있을 때 새 rule 을 활성화하려 하면 모달은 떴지만 실제 swap 이 클라이언트측 duplicate guard 의 stale closure 로 인해 거부되어 라인이 갱신되지 않는 버그가 있었다.

## 결정

### 1. 탭/사이드바 라벨 통일

- 자동 트리거 컨텍스트: **Automatic Pipelines**
- 수동 트리거 컨텍스트: **Manual Pipelines** (이전: Job Execution History)

대칭 라벨링으로 두 탭이 동일 도메인(파이프라인 실행)의 두 트리거 모드임을 즉시 드러낸다. Job 은 실행 단위가 아니라 결과물이라는 인식 정렬.

적용 위치:

- `PipelineExecutionTabs.tsx` 의 `tabs[1].label`
- `LeftSidebar.tsx` 의 Jobs mode 섹션 헤더

### 2. Swap the active automation rule 모달의 deactivate→activate 시퀀스 보장

같은 `(eventType, sourceQueue)` 키에 active rule 이 있는 상태에서 사용자가 다른 파이프라인의 Activate 를 누르면 swap 모달을 띄우고, 확인 시 다음을 순차 수행한다.

1. 기존 active rule 을 `active=false` 로 저장 (deactivate)
2. 새 rule 을 `active=true` 로 저장 (activate)

두 호출 모두 `handleSaveRule` 의 클라이언트측 duplicate guard 를 `skipDuplicateCheck: true` 로 우회한다. Guard 는 React state `rules` 의 closure 를 참조하는데 1번 직후 2번이 실행될 때 state 가 아직 갱신되지 않아 옛 active rule 을 duplicate 로 오인하던 버그를 차단하기 위함. Mock/Current 서비스 레이어가 자체 duplicate 검증을 수행하므로 안전성은 유지된다.

성공하면 `refresh()` 결과로 `rules` state 가 갱신되어 EventGroupCard 의 라인 표시(어떤 rule 이 어떤 event·queue 에 active 로 연결되어 있는지)가 새 파이프라인으로 다시 그려진다. SVG path 재계산은 `useLayoutEffect` 의 의존성에 `rules` 의 (id, active, pipelineId) 시그니처를 포함해 active 플래그 변경만으로도 트리거되도록 한다.

### 3. 행 순서는 안정 정렬로 보존

`matchingRules` 정렬 키는 `sourceQueue → id` 순서 (active 우선 정렬 X). swap
으로 active 플래그가 변해도 행이 위·아래로 튀지 않고 자리에 머무른 채 라인과
배지만 바뀌어, 사용자 시선이 같은 위치를 추적할 수 있다. 사용자 mental
model 은 "파이프라인 A 가 거기에 있다" 이지 "active 인 게 위에 있다" 가 아니다.

## 대안과 트레이드오프

| 대안 | 장점 | 단점 / 채택하지 않은 이유 |
|---|---|---|
| `Job Execution History` 유지 | 변경 비용 0 | Automatic 과의 대칭성 부재. 사용자가 두 탭을 같은 축의 모드로 인식하기 어려움 |
| 탭명을 `Auto / Manual` 단어만 사용 | 매우 짧음 | 컨텍스트(파이프라인) 가 빠져 사이드바 다른 섹션과 혼동 가능 |
| Swap 시 `rules` state 를 ref 로 보관 | guard 로직 재사용 | 단발성 swap 흐름을 위해 전역 상태 패턴을 추가하는 복잡도. 서비스 레이어가 이미 검증을 수행하므로 과잉 |
| Swap 시 두 호출을 한 atomic API 로 묶기 | 트랜잭션 보장 | 백엔드 API 추가/계약 변경 비용. 현재 mock/current 서비스 모두 단일 rule 저장 단위라 구조 변경이 큼 |

**채택안의 트레이드오프**:

- 클라이언트 duplicate guard 우회는 swap 흐름 한정. 일반 저장 경로(`handleAutomate`, `handleConfirmToggleRuleActive`) 는 여전히 guard 를 통과하므로 사용자가 같은 키에 의도치 않게 두 개의 active rule 을 만드는 것은 차단된다.
- Activate 전에 Deactivate 가 실패하면 활성화는 진행되지 않는다 (`offResult` null 체크). 양쪽이 모두 일시적으로 inactive 인 상태가 짧게 존재할 수 있으나, `(eventType, sourceQueue)` 가 같은 두 rule 모두 active 가 되는 경우는 없다.

## 적용 범위 / 영향

- 두 탭 라벨은 `(planning)` 와 `(current)` 에 동일하게 적용된다 (탭 컴포넌트가 공유됨).
- Swap 모달의 헤더 카피("Swap the active automation rule?", "Continuing will deactivate the previous rule and activate the selected one.") 는 그대로 유지 — 현재 카피가 결정 의도와 일치하기 때문.
- 라인 시각화는 `EventGroupCard` 가 `rules` 를 source 로 렌더링하므로 swap 후 별도 재구성 코드 없이 자동 갱신된다.

## 미해결 사항

- **Swap 진행 중 실패 복구**: 1번(deactivate) 성공 후 2번(activate) 가 서버에서 실패하면, 사용자는 양쪽 모두 inactive 인 상태로 남는다. 자동 롤백(원래 rule 재-activate) 은 미구현 — 실패율이 낮고 사용자가 모달에서 즉시 재시도 가능하므로 현시점은 수용.
- **Manual Pipelines 탭의 정의 확장**: 향후 "수동 트리거로 실행된 파이프라인 인스턴스" 를 Job 단위가 아닌 파이프라인 단위로 그룹핑할지 여부는 별도 결정 필요.
