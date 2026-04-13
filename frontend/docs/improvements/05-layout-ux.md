# 레이아웃·UX

캔버스 레이아웃, 뷰 모드 구분, 폼 UI에 관한 항목입니다.

---

## L-01 · 파이프라인 정의 뷰 ↔ Job 실행 뷰 시각적 구분

**우선순위:** 🟧 High  
**관련 파일:** `src/app/(planning)/_ui/ConsolePage.tsx`, `src/components/graph/CanvasGraph.tsx`  
**DESIGN.md 근거:** §4.1 (Job 그래프), §4.3 (파이프라인 토폴로지)

### 문제

현재 캔버스는 하나이고, `selectedJob` 유무에 따라 `editable` 플래그만 바뀝니다. 운영자 관점에서:

- **파이프라인 정의 뷰**: DAG 구조 편집 가능, Job 상태 오버레이 없음
- **Job 실행 뷰**: 특정 Job의 실시간 진행 상태 오버레이, 편집 불가

두 모드가 시각적으로 구분되지 않아 운영자가 "지금 내가 편집 중인지, 모니터링 중인지" 혼동할 수 있습니다. 특히 FAILED Job을 바라보면서 파이프라인 정의를 수정하려 할 때 오조작이 발생할 수 있습니다.

### 구현 지침

#### 1. 캔버스 상단 모드 배너

```tsx
// src/components/graph/CanvasModeBanner.tsx
import { Eye, GitBranch, XCircle } from 'lucide-react';
import type { JobDetail } from '@/types/pipeline';

interface CanvasModeBannerProps {
  selectedJob: JobDetail | null;
  onExitJobView: () => void;
}

export function CanvasModeBanner({ selectedJob, onExitJobView }: CanvasModeBannerProps) {
  if (!selectedJob) {
    // 파이프라인 정의 편집 모드 — 배너 없음 (기본 상태)
    return null;
  }

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-card/90 backdrop-blur-sm border border-border rounded-full px-3 py-1.5 shadow-lg text-xs">
      <Eye className="w-3.5 h-3.5 text-accent" />
      <span className="text-foreground font-medium">Job 실행 뷰</span>
      <span className="text-muted-foreground font-mono">{selectedJob.jobId}</span>
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground">{selectedJob.sceneId}</span>
      <button
        onClick={onExitJobView}
        className="ml-1 p-0.5 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
        title="파이프라인 편집 뷰로 돌아가기"
        aria-label="Job 실행 뷰 종료"
      >
        <XCircle className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
```

#### 2. 캔버스 배경색 분기

Job 실행 뷰일 때 캔버스 배경에 미세한 색조 변화로 모드 구분:

```tsx
// CanvasGraph.tsx 또는 ConsolePage.tsx
<div className={cn(
  'flex-1 relative overflow-hidden',
  selectedJob ? 'bg-background' : 'bg-background',  // 필요시 subtle 색조 추가
)}>
  <CanvasModeBanner selectedJob={selectedJob} onExitJobView={handleExitJobView} />
  <CanvasGraph ... />
</div>
```

#### 3. "Job 실행 뷰 종료" 핸들러

```tsx
// ConsolePage.tsx
const handleExitJobView = useCallback(() => {
  setSelectedJob(null);
  setConsoleMode({ type: 'idle' });
}, []);
```

#### 4. 파이프라인 정의 편집 모드 툴팁 (editable = true)

노드 위에 마우스 올렸을 때 "클릭하여 편집" 커서 + 툴팁이 표시되도록 `title` 속성 추가. (이미 `cursor-grab`은 있지만 편집 의도 명시 필요)

### 완료 기준

- [ ] Job 실행 뷰에서 캔버스 상단에 모드 배너 표시
- [ ] 배너에 Job ID, Scene ID 표시
- [ ] 배너의 X 버튼으로 파이프라인 정의 뷰로 복귀
- [ ] 파이프라인 정의 뷰에서는 배너 미표시

---

## L-02 · 그래프 초기 중앙 정렬 (fitView)

**우선순위:** 🟨 Med  
**관련 파일:** `src/components/graph/CanvasGraph.tsx`, `src/components/graph/PipelineGraph.tsx`  
**DESIGN.md 근거:** §4.3 — React Flow + dagre 레이아웃

### 문제

현재 스크린샷(imgs/13-1)을 보면 6개 노드가 캔버스 왼쪽에 몰려 있고 오른쪽 공간이 비어 있습니다. 파이프라인이 바뀔 때마다 노드가 캔버스 중앙에 오도록 `fitView`가 실행되어야 합니다.

### 구현 지침

#### 1. `PipelineGraph.tsx` — fitView 트리거

```tsx
// PipelineGraph.tsx
import { useReactFlow } from '@xyflow/react';

const { fitView } = useReactFlow();

// 노드/엣지가 바뀔 때 fitView 실행
useEffect(() => {
  if (nodes.length === 0) return;
  // 레이아웃 계산 후 fitView (dagre가 비동기로 처리되는 경우 requestAnimationFrame)
  requestAnimationFrame(() => {
    fitView({ padding: 0.15, duration: 300 });
  });
}, [pipelineId]);  // 파이프라인 변경 시에만 실행 (매 노드 변경 시 실행하면 UX 방해)
```

#### 2. `ReactFlow` 초기 설정 확인

```tsx
<ReactFlow
  fitView                     // 초기 렌더링 시 자동 fitView
  fitViewOptions={{ padding: 0.15 }}
  minZoom={0.3}
  maxZoom={2}
  // ...
>
```

#### 3. dagre 레이아웃 — 노드 간격 조정

현재 노드 크기(64×64)에 비해 간격이 좁을 수 있습니다. dagre 레이아웃 옵션:

```ts
dagreGraph.setGraph({
  rankdir: 'LR',
  nodesep: 40,    // 같은 rank 내 노드 간격
  ranksep: 80,    // rank 간 간격 (엣지 길이)
  marginx: 20,
  marginy: 20,
});
```

#### 4. 미니맵 위치

미니맵이 우측 하단에 있다면 큰 파이프라인에서 유용. 현재 구현 여부 확인 후 필요시 `<MiniMap />` 추가.

### 완료 기준

- [ ] 파이프라인 선택 변경 시 노드가 캔버스 중앙에 fitView됨
- [ ] 초기 렌더링 시에도 노드가 중앙에 표시
- [ ] 애니메이션(duration: 300ms)으로 부드럽게 이동
- [ ] 줌 레벨이 노드 크기에 맞게 자동 조정

---

## L-03 · 파이프라인 생성 폼 — 위성/모드 선택

**우선순위:** 🟨 Med  
**관련 파일:** `src/app/(planning)/_ui/ConsolePage.tsx`, `src/components/panels/CreatePipelineDialog.tsx` (신설)  
**DESIGN.md 근거:** §2 (사용자 시나리오), §6 (데이터 모델)

### 문제

현재 파이프라인 생성이 `prompt()` 다이얼로그로만 구현되어 있고, 이름만 입력받습니다:

```tsx
// ConsolePage.tsx:254-270
const name = prompt('파이프라인 이름을 입력하세요:');
if (!name) return;
const res = await service.파이프라인을_생성한다({
  name, satelliteId: 'KS-5', mode: 'Stripmap',  // 하드코딩
  steps: [ ... ],  // 고정 스텝
});
```

위성/모드 선택에 따라 스텝 구성이 달라져야 합니다(`MODE_STEP_VARIANTS` 로직이 이미 mock에 구현되어 있음).

### 구현 지침

S-01에서 신설하는 `CreatePipelineDialog`와 통합합니다.

#### 1. `CreatePipelineDialog` 폼 필드

```tsx
// src/components/panels/CreatePipelineDialog.tsx
// react-hook-form + zod 사용 (DESIGN.md §5 기술 스택)

const schema = z.object({
  name: z.string().min(1, '이름을 입력하세요').max(50),
  satelliteId: z.enum(['KS-5', 'KS-6', 'KS-7']),
  mode: z.enum(['Stripmap', 'ScanSAR', 'Spotlight']),
});
```

폼 레이아웃:
```
파이프라인 이름 *
[____________입력____________]

위성            모드
[KS-5  ▼]      [Stripmap  ▼]

기본 스텝 구성 미리보기:
  CSC-02 → CSC-03 → CSC-04 → CSC-05 → CSC-06 → CSC-07
  (모드 변경 시 자동 업데이트)

[취소]  [생성]
```

#### 2. 스텝 미리보기

모드 선택 시 `MODE_STEP_VARIANTS`에서 해당 스텝을 가져와 텍스트로 미리보기:

```tsx
const modeSteps = MODE_STEP_VARIANTS[watchedMode] ?? PIPELINE_STEPS;

<div className="text-[10px] text-muted-foreground flex flex-wrap gap-1">
  {modeSteps.map((s, i) => (
    <span key={i}>
      <span className="text-foreground">{s.targetCsc}</span>
      {i < modeSteps.length - 1 && <span className="mx-0.5">→</span>}
    </span>
  ))}
</div>
```

#### 3. `ConsolePage`에서 `handleCreatePipeline` 수정

```tsx
const handleCreatePipeline = useCallback(() => {
  setCreatePipelineDialogOpen(true);
}, []);

const handleConfirmCreatePipeline = useCallback(async (data: {
  name: string; satelliteId: string; mode: string;
}) => {
  const modeSteps = MODE_STEP_VARIANTS[data.mode] ?? PIPELINE_STEPS;
  const res = await service.파이프라인을_생성한다({
    ...data,
    steps: modeSteps,
  });
  if (res.data) {
    setPipelines((prev) => [...prev, res.data!]);
    setSelectedPipelineId(res.data.id);
  }
  setCreatePipelineDialogOpen(false);
}, [service]);
```

> **참고:** `MODE_STEP_VARIANTS`는 현재 `pipeline.mock.ts`에 있습니다. `types/pipeline.ts` 또는 별도 `constants/pipeline.ts`로 이동하여 `ConsolePage`에서도 import 가능하게 해야 합니다.

### 완료 기준

- [ ] 파이프라인 생성 클릭 시 shadcn Dialog 열림
- [ ] 이름 / 위성 / 모드 입력 가능
- [ ] 모드 선택에 따라 스텝 미리보기 업데이트
- [ ] `MODE_STEP_VARIANTS` 상수가 `types/pipeline.ts` 또는 `constants/pipeline.ts`로 이동
- [ ] `prompt()` 코드 완전 제거
