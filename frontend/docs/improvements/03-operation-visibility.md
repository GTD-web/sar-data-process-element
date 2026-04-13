# 운영 가시성 — 실시간 모니터링

운영자가 파이프라인 현황을 즉시 파악할 수 있도록 하는 실시간 표시 항목입니다.

---

## V-01 · VT 카운트다운 (단계별 재출현 예정)

**우선순위:** 🟥 Critical  
**관련 파일:** `src/components/graph/PipelineNode.tsx`, `src/components/panels/JobDetailPanel.tsx`, `src/types/pipeline.ts`  
**DESIGN.md 근거:** §14.3 🟥 — "VT 카운트다운"

### 문제

DESIGN.md §14.3:

> **VT 카운트다운** — 각 단계 노드에 "큐 메시지가 N분 후 재출현" 카운트다운.
> CSC 처리기가 침묵하면 운영자가 *왜 진척이 없는지* 즉시 보여야 함.
> csc03=3,600 / csc04=9,000 / csc05=2,700 / csc06=1,800초 (ICD 6.6 확정값) 사용.

pgmq의 VT(Visibility Timeout)가 만료되기까지의 남은 시간을 각 노드에 표시합니다. 운영자는 이 값을 보고 "처리기가 죽었는지" vs "아직 처리 중인지"를 구분할 수 있습니다.

### 구현 지침

#### 1. VT 상수 정의

```ts
// src/types/pipeline.ts

/** ICD 6.6 확정값 — pgmq VT(Visibility Timeout) (초) */
export const VT_SECONDS: Partial<Record<TargetCsc, number>> = {
  'CSC-03': 3_600,
  'CSC-04': 9_000,
  'CSC-05': 2_700,
  'CSC-06': 1_800,
};
```

#### 2. `PipelineStep`에 VT 시작 시각 추가

```ts
// src/types/pipeline.ts
export interface PipelineStep {
  // 기존 필드...
  vtStartedAt?: string;   // RUNNING 상태에서 메시지가 큐에서 꺼내진 UTC 시각
}
```

#### 3. `PipelineNode` — RUNNING 노드에 카운트다운 오버레이

```tsx
// 노드 라벨 하단에 추가
{status === 'RUNNING' && vtStartedAt && VT_SECONDS[targetCsc] && (
  <VtCountdown
    vtStartedAt={vtStartedAt}
    vtSeconds={VT_SECONDS[targetCsc]}
  />
)}
```

#### 4. `VtCountdown` 컴포넌트

```tsx
// src/components/graph/VtCountdown.tsx
'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface VtCountdownProps {
  vtStartedAt: string;   // ISO 8601
  vtSeconds: number;
}

export function VtCountdown({ vtStartedAt, vtSeconds }: VtCountdownProps) {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    const calc = () => {
      const elapsed = (Date.now() - new Date(vtStartedAt).getTime()) / 1000;
      setRemaining(Math.max(0, vtSeconds - elapsed));
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [vtStartedAt, vtSeconds]);

  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60);
  const isExpired = remaining === 0;
  const isUrgent = remaining < vtSeconds * 0.1;  // 10% 미만

  return (
    <div className={cn(
      'flex items-center gap-0.5 text-[9px] font-mono',
      isExpired ? 'text-destructive font-bold' : isUrgent ? 'text-warning' : 'text-muted-foreground'
    )}>
      <Clock className="w-2.5 h-2.5" />
      {isExpired
        ? '재출현 대기중'
        : `재출현 ${minutes}:${String(seconds).padStart(2, '0')}`}
    </div>
  );
}
```

**상태별 표시:**
| 상태 | 표시 | 색상 |
|---|---|---|
| VT 여유 있음 (> 10%) | `재출현 45:23` | `text-muted-foreground` |
| VT 임박 (< 10%) | `재출현 01:30` | `text-warning` (주황) |
| VT 만료 (0초) | `재출현 대기중` | `text-destructive` (빨강) |

**VT 만료 = 처리기 무응답 의심** → 운영자는 Alert 또는 수동 개입 고려.

#### 5. Mock 데이터 업데이트

`buildSteps()`에서 RUNNING 스텝의 `vtStartedAt` 추가:
```ts
vtStartedAt: stepStatus === 'RUNNING' ? new Date(Date.now() - Math.random() * vtSec * 1000).toISOString() : undefined,
```

#### 6. JobDetailPanel — 스텝 행에도 표시

`JobDetailPanel`의 각 스텝 행에도 RUNNING 상태일 때 VT 카운트다운 표시.

### 완료 기준

- [ ] `VT_SECONDS` 상수가 ICD 6.6 값과 일치
- [ ] RUNNING 노드에 VtCountdown 오버레이 표시
- [ ] 1초마다 카운트다운 갱신
- [ ] VT 만료 시 빨간색 "재출현 대기중" 표시
- [ ] JobDetailPanel 스텝 행에도 동일 표시

---

## V-02 · SLA 바 실시간화 — RUNNING 경과 시간 반영

**우선순위:** 🟧 High  
**관련 파일:** `src/components/panels/JobDetailPanel.tsx`  
**DESIGN.md 근거:** §4.1, §14.3 🟥 — "파이프라인 SLA 카운트다운"

### 문제

```ts
// JobDetailPanel.tsx:16
const totalDuration = job.steps.reduce((s, st) => s + (st.durationMs ?? 0), 0);
```

RUNNING 상태의 스텝은 `durationMs`가 `undefined`이므로 0으로 계산됩니다. 현재 진행 중인 스텝의 경과 시간이 SLA 바에 반영되지 않아 진척도가 과소 표시됩니다.

### 구현 지침

#### 1. 실시간 경과 시간 계산

```tsx
// JobDetailPanel.tsx

function useLiveDuration(steps: PipelineStep[]): number {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return steps.reduce((sum, step) => {
    if (step.durationMs !== undefined) return sum + step.durationMs;
    if (step.status === 'RUNNING' && step.startedAt) {
      return sum + (now - new Date(step.startedAt).getTime());
    }
    return sum;
  }, 0);
}
```

#### 2. SLA 바에 적용

```tsx
const totalDuration = useLiveDuration(job.steps);
const slaMs = 14_400 * 1000;
const slaPct = Math.min((totalDuration / slaMs) * 100, 100);

// 경고 임계값 — ICD 3.7: 2시간 이상 지연
const warningMs = 2 * 3600 * 1000;
const isWarning = totalDuration > warningMs;
const isCritical = slaPct > 80;
```

#### 3. SLA 바 개선

현재: 단색 바  
개선: 경고 임계값 마커 추가

```tsx
<div className="relative h-1.5 bg-muted rounded-full overflow-visible">
  {/* 2시간 경고 마커 */}
  <div
    className="absolute top-0 w-0.5 h-full bg-warning/60 z-10"
    style={{ left: `${(warningMs / slaMs) * 100}%` }}
    title="2시간 경고 임계값"
  />
  {/* 진행 바 */}
  <div
    className={`h-full rounded-full transition-all ${isCritical ? 'bg-destructive' : isWarning ? 'bg-warning' : 'bg-accent'}`}
    style={{ width: `${Math.max(slaPct, 1)}%` }}
  />
</div>
```

#### 4. 헤더에 잔여 시간 표시

```tsx
// SLA 잔여 시간
<span className="text-[10px] font-mono text-muted-foreground">
  잔여 {formatDuration(Math.max(0, slaMs - totalDuration))}
</span>
```

### 완료 기준

- [ ] RUNNING 스텝의 경과 시간이 SLA 바에 실시간 반영 (1초 갱신)
- [ ] 2시간 경고 마커가 SLA 바에 표시
- [ ] 80% 초과 시 바 색상이 destructive로 전환
- [ ] 잔여 시간이 헤더에 표시

---

## V-03 · SSE stale 배너

**우선순위:** 🟧 High  
**관련 파일:** `src/components/panels/TopBar.tsx`, `src/lib/sse/` (신설)  
**DESIGN.md 근거:** §14.1 🟧 — "Stale data banner"

### 문제

DESIGN.md §14.1:

> SSE가 15초 이상 끊기면 화면 상단에 "데이터가 N초 전입니다" 배너 + 재연결 카운트다운. 운영자가 죽은 화면을 살아 있는 줄 착각하지 않도록.

현재 SSE 연결이 mock 환경에서 구현되어 있지 않지만, 연결 상태를 감지하는 UI는 실제 SSE 없이도 구조를 갖춰 놓을 수 있습니다.

### 구현 지침

#### 1. SSE 연결 상태 스토어 (Zustand)

```ts
// src/store/sse-status.store.ts
import { create } from 'zustand';

interface SseStatusState {
  lastEventAt: number | null;   // 마지막 이벤트 수신 timestamp
  connected: boolean;
  onEvent: () => void;
  onDisconnect: () => void;
}

export const useSseStatus = create<SseStatusState>((set) => ({
  lastEventAt: null,
  connected: false,
  onEvent: () => set({ lastEventAt: Date.now(), connected: true }),
  onDisconnect: () => set({ connected: false }),
}));
```

#### 2. `StaleBanner` 컴포넌트

```tsx
// src/components/panels/StaleBanner.tsx
'use client';

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useSseStatus } from '@/store/sse-status.store';

const STALE_THRESHOLD_MS = 15_000;

export function StaleBanner() {
  const { lastEventAt, connected } = useSseStatus();
  const [staleSec, setStaleSec] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      if (lastEventAt === null) return;
      const elapsed = (Date.now() - lastEventAt) / 1000;
      setStaleSec(elapsed >= STALE_THRESHOLD_MS / 1000 ? Math.floor(elapsed) : null);
    }, 1000);
    return () => clearInterval(id);
  }, [lastEventAt]);

  // Mock 환경에서는 lastEventAt이 null → 배너 미표시
  if (staleSec === null && connected) return null;

  // SSE가 한 번도 연결 안 된 mock 환경 → 배너 미표시
  if (lastEventAt === null) return null;

  return (
    <div className="w-full bg-warning/10 border-b border-warning/30 px-4 py-1.5 flex items-center gap-2 text-xs text-warning">
      <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
      <span>데이터가 {staleSec}초 전입니다 — 연결 재시도 중</span>
      <button
        className="ml-auto flex items-center gap-1 hover:text-warning/80"
        onClick={() => window.location.reload()}
      >
        <RefreshCw className="w-3 h-3" />
        새로고침
      </button>
    </div>
  );
}
```

#### 3. `ConsolePage`에 배너 삽입

```tsx
// ConsolePage.tsx — 캔버스 위
<div className="flex-1 relative overflow-hidden flex flex-col">
  <StaleBanner />
  <TopBar queues={queues} />
  {/* ... canvas ... */}
</div>
```

#### 4. 실제 SSE 연결 시 연동 (v2)

실제 SSE 클라이언트(`src/lib/sse/`)를 구현할 때 이벤트 수신마다 `useSseStatus.getState().onEvent()` 호출.

### 완료 기준

- [ ] `StaleBanner` 컴포넌트 존재
- [ ] SSE 연결 후 15초 이상 이벤트 없으면 배너 노출
- [ ] Mock 환경(SSE 미연결)에서는 배너 미표시 (운영자 혼란 방지)
- [ ] 배너에 경과 시간이 1초마다 갱신
