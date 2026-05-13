# Automatic Pipelines Detail Right Panel

- **결정 일자**: 2026-05-07
- **최근 검토**: 2026-05-08
- **상태**: Superseded by automatic-pipelines-detail-panel-v2.md
- **Superseded on**: 2026-05-08
- **관련 코드**:
  - `frontend/src/components/panels/AutomaticPipelineDetailPanel.tsx` — 우측 패널 컴포넌트
  - `frontend/src/app/(planning)/plan/deployed/DeployedPipelinesPage.tsx` — `selectedRule`, `latestJobDetail`, `pipelineProducts`, `automaticPipelineErrorLogs`, `RightTabbedPanel` 통합
  - `frontend/src/components/panels/RightTabbedPanel.tsx` — 공용 우측 패널 컨테이너 (Manual Pipelines 와 공유)
- **트리거 키워드**: Automatic Pipelines 우측 패널, pipeline detail panel, currently running, NAS output, outputPath, output products, 산출물 미리보기, error logs, Job history, Job 이력, scene 파일명, formatProductTitleFromRaw
- **Supersedes**: (없음)
- **Superseded by**: automatic-pipelines-detail-panel-v2.md

## 배경

Automatic Pipelines 탭은 "이벤트 → 자동 트리거 → 파이프라인 실행" 매핑을 정의하는
관리 화면이지만, 룰을 만들고 활성화한 뒤에 운영자가 알고 싶은 것은 "이 자동
파이프라인이 지금 어디까지 갔는가" 다. 정작 그 정보를 같은 탭에서 볼 수 없으면
운영자는:

- 각 룰 행을 매번 펼쳐서 미니 그래프만 보거나,
- Manual Pipelines 탭으로 이동해 jobId 를 손으로 찾거나,
- Data Catalog 로 들어가 파이프라인 ID 로 다시 필터링한다.

자동 트리거된 흐름이라고 해도 운영자는 여전히 동일한 4가지 질문을 즉시 답해야
한다.

1. 지금 이 파이프라인은 어느 단계에서 돌고 있는가?
2. 어떤 에러 로그가 발생했는가?
3. 산출물이 NAS의 어느 경로에 저장되는가?
4. 처리된 이미지(산출물)는 어디에서 보고 받을 수 있는가?

Manual Pipelines 탭은 같은 질문을 우측 `RightTabbedPanel + JobDetailPanel` 조합으로
답한다. Automatic Pipelines 탭에도 동일한 우측 패널 슬롯을 두되, 컨텍스트가 "선택된
Job" 이 아니라 "선택된 자동화 룰" 임을 반영한 전용 컴포넌트가 필요하다.

## 결정

`AutomaticPipelineDetailPanel` 을 신설하고 `RightTabbedPanel` 로 감싸 Automatic
Pipelines 화면 우측에 항상 노출(접기/펼치기 가능)한다. 패널은 "선택된 룰 1개" 를
컨텍스트로 받아 다음 4개 섹션을 고정 순서로 렌더링한다 — 4가지 운영 질문에 1:1로
대응하는 골자.

### 섹션 구조 (위→아래, 고정 순서)

1. **Header** — 파이프라인 이름 + Active/Inactive 배지 + 트리거 큐. 외부
   페이지(Manual Pipelines `/jobs`) 로 이탈하는 링크는 두지 않는다 — Automatic
   Pipelines 컨텍스트의 잡 정보는 이 패널 안에서 완결되어야 한다.
2. **Job history** — 이 파이프라인이 자동 트리거로 만든 잡들의 리스트(최대 10건).
   행 클릭 → 아래 "Latest execution" / "Step progress" 섹션이 그 잡 기준으로 다시
   렌더. 다시 한 번 클릭(또는 다른 룰 선택)으로 기본값(가장 최근 잡)으로 복귀.
   **Manual Pipelines 탭으로 이동하지 않는다** — Automatic 컨텍스트의 잡 이력은
   여기서 끝낸다.
3. **Latest execution** — 현재 선택된 잡의 `jobId`, 상태 배지, scene, started/updated,
   누적 Job 카운트.
   - **Currently running** 강조 박스: 해당 Job 의 `RUNNING` 단계가 있으면 표시.
   - 그게 없고 `FAILED` 단계가 있으면 **Last failure** 박스로 대체.
4. **Step progress · NAS outputs** — 선택 잡의 모든 step 을 단계별 카드로. 각 카드:
   - 단계 라벨 + status badge + level + duration + (있으면) VT 초과 경고
   - `step.outputPath` 가 있으면 `font-mono` 박스로 NAS 경로 그대로 노출
     (운영자가 SSH 로 그대로 붙여넣을 수 있게 truncate 없이 break-all)
   - `errorMessage` 가 있으면 destructive 컬러로
   - 경로 파일명은 placeholder(예: `scene_xxx.h5`) 가 아닌 raw 파일 stem 에서
     파생된 구체 이름이다 — 자세한 슬롯 규칙은 `raw-data-title-naming.md` 참고.
5. **Output products** — `Product` 들을 thumbnail 6개 그리드 + 레벨별 카운트 chip +
   "Open Data Catalog" 링크. 각 thumbnail 카드는 클릭 시 `/data-catalog?productId=...`
   로 이동하고, 호버 시 영문 안내(`Click to open <id> on the Data Catalog page` +
   "Open in Data Catalog" 링크 텍스트) 가 나타난다.
6. **Recent error logs** — `automaticPipelineLogs` 중 `level === 'ERROR'` 만 추려 8개.
   `jobId` + 시각 + 메시지.

### 섹션 우선순위와 그루핑 근거

- "지금 어디?" 와 "에러" 는 **위쪽** — 운영자가 패널 열자마자 대답 받아야 함.
- "Job history" 가 가장 위 — 운영자가 잡을 골라 컨텍스트를 결정하면 아래 섹션들이
  그 잡 기준으로 갱신되는 구조라, 선택 진입점을 패널 첫머리에 둔다.
- "NAS 경로" 는 단계와 강하게 결합 (단계별로 다른 경로) → 단계 리스트 안에
  inline 으로. 별도 섹션이 아니라 step 카드 안에 둠으로써 "이 단계의 산출물이
  여기에 있다" 라는 1대1 대응을 시각적으로 보장.
- "산출물 미리보기" 는 step 보다 한 단계 위 추상화 (전체 Job 의 결과물) → 별도
  섹션. 미리보기 자체는 카드에서 placeholder thumbnail 만 보여주고, 본격 미리보기는
  Data Catalog 에 위임 (이중 구현 회피). 카드 호버 시 "Click to open … on the Data
  Catalog page" 영문 안내가 나타나 이동 의도를 명확히 한다.
- "에러 로그" 는 가장 아래 — 평소엔 비어있는 상태가 정상이므로 패널 시선 흐름의
  꼬리에 둠.

### 카피 정책: 영문 통일

패널 안의 모든 라벨, 안내, 빈 상태 메시지, tooltip 은 영문으로 통일한다. 한글/영문
혼용은 정보 위계가 흔들리는 원인이라 피한다 — 운영자가 SSH/JIRA 의 영문 환경과 같이
사용하는 패널이라 컨텍스트 비용도 줄어든다. 화면 외부의 design decision 문서는 한글
유지(작업자/리뷰어 가독성)지만, 사용자에게 노출되는 UI 텍스트는 영문이다.

### 데이터 로딩 정책

`DeployedPipelinesPage` 에서:

- 페이지 mount 시 jobs(100) + executionLogs(300) + pipelines/rules 로딩.
- `selectedRule` 변경 시 사용자 선택 잡(`selectedDetailJobId`) 은 자동으로 초기화 →
  기본값(가장 최근 잡) 으로 복귀. 다른 파이프라인의 잡을 가리킨 채 남지 않게 잠금.
- 패널의 detail 잡은 `selectedDetailJobId ?? latestJobId` 로 결정되고, 잡 ID 변경 시
  `Job_상세를_조회한다(jobId)` 로 step 상세를 다시 조회 (`outputPath`,
  `errorMessage` 등 detail 한정 필드 때문에 summary 만으로는 부족).
- `제품_목록을_조회한다({ limit: 50 })` 후 클라이언트에서 `pipelineId` 의 Job 들의
  `jobId` 로 필터. 백엔드에 `jobId` 필터가 아직 없어서 임시로 클라이언트 필터.
- `selectedRule = null` (선택 해제) 시 패널은 "Select a rule to inspect" 안내 표시.

### NAS 출력 파일명: raw stem 기반 파생

mock 의 step `outputPath` 는 더 이상 placeholder(`scene_xxx.h5`) 를 쓰지 않는다.
`pipeline.mock.ts` 의 `formatProductTitleFromRaw(rawTitle, level)` 가 raw 파일명의
ProductType 슬롯과 Level digit 만 교체한 stem-preserving 이름을 만든다 — Sentinel-1
컨벤션을 차용한 raw 네이밍 결정(`raw-data-title-naming.md`) 의 확장이다. 이렇게
하면 패널에 표시되는 NAS 경로가 그대로 SSH 로 붙여넣을 수 있는 실제 파일 경로가
되고, lineage 추적도 stem 으로 단순해진다.

### 우측 패널 토글

- 기본 펼친 상태. `RightTabbedPanel` 의 X 버튼으로 접을 수 있고, 접힌 상태에서는
  플로팅 `PanelRightOpen` 버튼으로 다시 펼친다 — Manual Pipelines 와 동일 UX.
- 패널 폭 420px 고정 (Manual Pipelines 와 동일). 더 줄이면 NAS 경로가 너무 잘리고,
  더 늘리면 메인 컨텐츠가 좁아진다.

## 대안과 트레이드오프

| 대안 | 장점 | 단점 / 채택하지 않은 이유 |
|---|---|---|
| `JobDetailPanel` 그대로 재사용 | 코드 중복 0 | Job 컨텍스트가 아닌 "룰" 컨텍스트라 헤더 정보(rule, 큐, 활성 상태)가 안 맞음. NAS 경로/산출물 그리드/에러 로그 섹션은 Job 패널에 없음 — 어차피 추가 필요 |
| 룰 행 펼침 안에 모든 정보를 인라인 | 한 화면에서 다 보임 | 룰이 여러 개일 때 화면이 세로로 폭증. "지금 어디?" 가 즉시 안 보이고 스크롤 필요 |
| 별도 페이지(`/deployed/[ruleId]`) 로 분리 | 더 풍부한 정보 가능 | 룰 ↔ 현재 진행 상태를 빠르게 비교하려는 기본 시나리오에서 페이지 이동 비용. 자동 트리거 운영의 "지속적 모니터링" 성격과 안 맞음 |
| Data Catalog 에 모든 산출물 미리보기를 인라인 | 한 자리에서 본다 | Data Catalog 가 product 단일 정보 권한자라 패널에 같은 UI 를 또 두면 두 곳을 동기화 유지해야 함. 패널은 placeholder + 링크로만 |
| 자동 폴링으로 RUNNING 단계 실시간 갱신 | 라이브 보드 | 폴링 주기 결정·취소 처리·서버 부하 모두 별도 결정 필요. 현재는 룰 재선택/페이지 새로고침 시점에 갱신. 라이브 갱신은 미해결 사항으로 분리 |

**채택안의 트레이드오프**:

- 패널이 항상 오른쪽 420px 를 차지해 메인 컨텐츠 가로폭이 줄어든다. 룰 그룹 카드의
  `MAPPING_CONTENT_MIN_WIDTH = 1180` 와 합치면 1600px 미만 화면에서 가로 스크롤 발생.
  접기 버튼으로 회피 가능하므로 수용.
- 산출물 미리보기는 `<ImageIcon>` placeholder 만 — 실제 이미지를 패널에 띄우려면
  thumbnail 엔드포인트와 인증, 캐시 정책을 같이 결정해야 한다. 우선은 "어디서 볼 수
  있는가" 의 신호(레벨 chip + Data Catalog 링크) 만 제공.
- 클라이언트 측 product 필터링은 mock 환경에서만 안전. 실제 백엔드에서 product 수가
  많아지면 `jobId` 또는 `pipelineId` 필터를 서비스 인터페이스에 추가해야 한다 —
  미해결 사항에 적었다.

## 적용 범위 / 영향

- **현재**: `/plan/deployed` 와 `/current/deployed` 양쪽 모두에 적용 (페이지
  컴포넌트가 공유됨). Mock 환경에서는 mock 데이터 기반 렌더, current 환경에서는
  백엔드 API 응답 기반 렌더.
- **e2e 커버**: `frontend/e2e/automatic-pipelines.spec.ts` 의 "룰을 선택하면 우측
  패널에 진행 단계·NAS 경로·산출물·에러 로그 섹션이 보인다" 케이스로 4 섹션 노출
  계약을 잠갔다. 섹션 헤더 텍스트가 바뀌면 이 테스트가 깨진다 — 의도된 가드.
- **다른 탭에 영향 없음**: Manual Pipelines (`/jobs`) 의 `JobDetailPanel` 흐름은
  손대지 않음. 두 탭이 같은 우측 슬롯을 사용하지만 컴포넌트는 별도.

## 미해결 사항

- **Live progress 폴링**: 현재는 페이지 mount 또는 selectedRule 변경 시점에만
  fetch. RUNNING 단계의 실시간 진행을 보려면 폴링/SSE/WebSocket 결정 필요.
- **Thumbnail 실 이미지**: placeholder 가 아닌 실 이미지 노출 시점/형식. Data Catalog 의
  thumbnail 처리 결정과 묶어서 진행해야 함.
- **백엔드 product `jobId` 필터**: `IPipelineUIService.제품_목록을_조회한다` 시그니처에
  `jobId` 또는 `pipelineId` 파라미터 추가 검토. 클라이언트 필터는 mock 한정 임시.
- **에러 로그 정의**: 현재 ExecutionLog 의 `level === 'ERROR'` 만 추림. WARN 레벨도
  운영자가 봐야 할 수 있는데, 이 패널의 "Recent error logs" 가 strict ERROR 만인지,
  WARN 도 포함하는지 별도 합의 필요.
- **여러 Job 비교**: 현재는 가장 최근 Job 1건만. 같은 룰의 최근 N개 Job 을 패널에서
  스위치해 보고 싶은 요구가 발생하면 Job picker 추가 검토.
