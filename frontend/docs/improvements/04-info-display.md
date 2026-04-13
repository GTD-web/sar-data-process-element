# 정보 표시 품질

운영자에게 제공되는 정보의 정확성, 보안, 편의성에 관한 항목입니다.

---

## I-01 · NAS 경로 마스킹 토글

**우선순위:** 🟧 High  
**관련 파일:** `src/components/panels/JobDetailPanel.tsx`, `src/lib/utils.ts`  
**DESIGN.md 근거:** §14.2 🟧 — "NAS 경로 마스킹 토글"

### 문제

DESIGN.md §14.2:

> **NAS 경로 마스킹 토글** — 기본은 마스킹, 권한자가 명시적으로 토글해야 풀 경로 노출. shoulder surfing 방지.

현재 `JobDetailPanel`에서 `job.rawDataPath`와 `step.outputPath`가 그대로 노출됩니다:

```tsx
// JobDetailPanel.tsx:74
<InfoRow label="Raw 경로" value={job.rawDataPath} mono />

// JobDetailPanel.tsx:98
<div className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">{step.outputPath}</div>
```

NAS 절대 경로에는 내부 호스트명, 마운트 포인트, 작업 디렉터리 구조 등 민감 정보가 포함될 수 있습니다.

### 구현 지침

#### 1. 마스킹 유틸리티

```ts
// src/lib/utils.ts

/**
 * NAS 절대 경로를 마스킹합니다.
 * /mnt/nas/sdpe/raw/KS5-20260401-001.raw
 *   → /mnt/.../ KS5-20260401-001.raw
 *
 * 파일명(마지막 세그먼트)은 보존합니다.
 */
export function maskNasPath(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash === -1) return path;
  const filename = path.slice(lastSlash + 1);
  const prefix = path.slice(0, path.indexOf('/', 1) + 1);  // /mnt/
  return `${prefix}.../${filename}`;
}
```

#### 2. `MaskedPath` 컴포넌트

```tsx
// src/components/ui/MaskedPath.tsx
'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { maskNasPath } from '@/lib/utils';

interface MaskedPathProps {
  path: string;
  className?: string;
}

export function MaskedPath({ path, className }: MaskedPathProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <span className={cn('inline-flex items-center gap-1 font-mono', className)}>
      <span className="truncate" title={revealed ? path : undefined}>
        {revealed ? path : maskNasPath(path)}
      </span>
      <button
        onClick={() => setRevealed((v) => !v)}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        title={revealed ? '경로 숨기기' : '전체 경로 보기'}
        aria-label={revealed ? '경로 숨기기' : '전체 경로 보기'}
      >
        {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
      </button>
    </span>
  );
}
```

#### 3. `JobDetailPanel` 적용

```tsx
// rawDataPath
<div className="flex justify-between gap-2">
  <span className="text-muted-foreground text-[11px]">Raw 경로</span>
  <MaskedPath path={job.rawDataPath} className="text-[11px] text-foreground" />
</div>

// step.outputPath
{step.outputPath && (
  <MaskedPath path={step.outputPath} className="text-[10px] text-muted-foreground mt-0.5" />
)}
```

#### v2 고려사항

권한 모델(§8) 확정 후 `operator` 이상만 토글 가능하도록 RBAC 게이트 추가.

### 완료 기준

- [ ] `maskNasPath()` 유틸 함수 존재 및 테스트
- [ ] `MaskedPath` 컴포넌트 — 기본값 마스킹, 눈 아이콘 클릭 시 전체 경로 표시
- [ ] `JobDetailPanel`의 rawDataPath, outputPath 모두 `MaskedPath` 적용
- [ ] 마스킹 상태에서 파일명은 보존됨

---

## I-02 · 타임스탬프 UTC 툴팁

**우선순위:** 🟨 Med  
**관련 파일:** `src/lib/utils.ts`, `src/components/panels/JobDetailPanel.tsx`  
**DESIGN.md 근거:** §14.2 🟧 — "시각 표시 규약"

### 문제

DESIGN.md §14.2:

> 모든 타임스탬프는 KST 표시 + 호버 시 UTC + epoch ms.
> `acquisition_*`(촬영)과 `received_at`(수신)·`updatedAt`(처리)을 색상으로 구분.

현재 `formatKST()`로 KST 표시는 되어 있지만, 호버 시 UTC와 epoch ms 툴팁이 없습니다.

### 구현 지침

#### 1. `TimestampDisplay` 컴포넌트

```tsx
// src/components/ui/TimestampDisplay.tsx
import { formatKST } from '@/lib/utils';

type TimestampKind = 'acquisition' | 'received' | 'processing';

const KIND_COLOR: Record<TimestampKind, string> = {
  acquisition: 'text-blue-400',    // 촬영 시각 — 파란색
  received:    'text-accent',       // 수신 시각 — 에메랄드
  processing:  'text-muted-foreground',  // 처리 시각 — 회색
};

interface TimestampDisplayProps {
  iso: string;
  kind?: TimestampKind;
  className?: string;
}

export function TimestampDisplay({ iso, kind = 'processing', className }: TimestampDisplayProps) {
  const utc = new Date(iso).toUTCString();
  const epoch = new Date(iso).getTime();
  const tooltipText = `UTC: ${utc}\nepoch: ${epoch}ms`;

  return (
    <time
      dateTime={iso}
      title={tooltipText}
      className={cn('cursor-help', KIND_COLOR[kind], className)}
    >
      {formatKST(iso)}
    </time>
  );
}
```

#### 2. `JobDetailPanel` 적용

```tsx
// 촬영 시작/종료 — acquisition 색상
<InfoRow label="촬영 시작">
  <TimestampDisplay iso={job.acquisitionStart} kind="acquisition" />
</InfoRow>

// 수신 시각 — received 색상
<InfoRow label="수신">
  <TimestampDisplay iso={job.receivedAt} kind="received" />
</InfoRow>
```

#### 3. `InfoRow` 리팩터링

현재 `InfoRow`는 `value: string`으로만 받습니다. `children`도 허용하도록 확장:

```tsx
function InfoRow({ label, children, value, mono }: {
  label: string;
  children?: React.ReactNode;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      {children ?? (
        <span className={cn('text-foreground text-right truncate', mono && 'font-mono')} title={value}>
          {value}
        </span>
      )}
    </div>
  );
}
```

### 완료 기준

- [ ] `TimestampDisplay` 컴포넌트 존재
- [ ] 호버 시 `title` 속성으로 UTC + epoch ms 표시
- [ ] 촬영/수신/처리 시각이 색상으로 구분됨
- [ ] `JobDetailPanel`의 모든 타임스탬프에 적용

---

## I-03 · 에러 코드 raw 보기

**우선순위:** 🟨 Med  
**관련 파일:** `src/components/panels/JobDetailPanel.tsx`  
**DESIGN.md 근거:** R-3 — "error_code 체계 부재"

### 문제

DESIGN.md R-3:

> 프론트는 `error_message`만 표시, code는 raw 보기.

현재 `JobDetailPanel`에서 `step.errorMessage`는 표시되지만, `step.errorCode`는 표시되지 않습니다. 에러 코드 체계가 아직 미확정 상태이므로 코드를 해석하지 않고 원본 그대로 보여줘야 합니다.

```tsx
// JobDetailPanel.tsx:95 — errorCode 미표시
{step.errorMessage && (
  <div className="text-[10px] text-destructive mt-0.5">{step.errorMessage}</div>
)}
```

### 구현 지침

#### 1. 에러 상세 표시 개선

```tsx
{(step.errorMessage || step.errorCode) && (
  <div className="mt-0.5 space-y-0.5">
    {step.errorMessage && (
      <div className="text-[10px] text-destructive">{step.errorMessage}</div>
    )}
    {step.errorCode && (
      <ErrorCodeRaw code={step.errorCode} />
    )}
  </div>
)}
```

#### 2. `ErrorCodeRaw` 컴포넌트

코드를 해석하지 않고 raw로 표시하되, 복사 기능 제공:

```tsx
// src/components/ui/ErrorCodeRaw.tsx
'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface ErrorCodeRawProps {
  code: string;
}

export function ErrorCodeRaw({ code }: ErrorCodeRawProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-1 bg-muted/30 rounded px-1.5 py-0.5 w-fit">
      <span className="text-[9px] font-mono text-muted-foreground">{code}</span>
      <button
        onClick={handleCopy}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title="에러 코드 복사"
        aria-label="에러 코드 복사"
      >
        {copied
          ? <Check className="w-2.5 h-2.5 text-success" />
          : <Copy className="w-2.5 h-2.5" />
        }
      </button>
    </div>
  );
}
```

#### 3. Mock 데이터 확인

`pipeline.mock.ts`의 `buildSteps()`에서 FAILED 스텝에 `errorCode`가 이미 생성됩니다:
```ts
errorCode: stepStatus === 'FAILED' ? `ERR_${def.targetCsc.replace('-', '')}_${1000 + ...}` : undefined,
```
별도 mock 수정 불필요.

### 완료 기준

- [ ] `ErrorCodeRaw` 컴포넌트 존재
- [ ] FAILED 스텝의 `errorCode`가 raw 형태로 표시
- [ ] 복사 버튼 클릭 시 클립보드에 복사 + 체크 아이콘 피드백
- [ ] `errorMessage`와 `errorCode`가 함께 표시될 때 레이아웃 정상
