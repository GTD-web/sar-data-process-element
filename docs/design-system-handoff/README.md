# SDPE Design System Handoff

SDPE frontend 의 디자인 토큰/테마 시스템을 **Tailwind v3 + Next.js Pages Router (Nextron)** 환경으로 이식하기 위한 패키지입니다.

대상 프로젝트: `Lumir_SAR_Processor_GUI` (Nextron 9.5 / Next 14.2 / React 18 / Tailwind 3.4)

---

## 포함 파일

| 파일 | 배치 위치 | 설명 |
|---|---|---|
| `tailwind.config.js` | `renderer/tailwind.config.js` **교체** | CSS 변수 기반 토큰 + `darkMode: 'class'` |
| `globals.css` | `renderer/styles/globals.css` **교체** (또는 토큰 블록만 머지) | 라이트(`:root`) + 다크(`.dark`) 팔레트 |
| `_document.example.tsx` | `renderer/pages/_document.page.tsx` 로 신규 생성 | FOUC 방지 인라인 스크립트 |
| `theme.ts` | `renderer/lib/theme.ts` | `useTheme()` 훅 |
| `utils.ts` | `renderer/lib/utils.ts` | `cn()` 헬퍼 + 날짜 포맷터 |
| `StatusBadge.example.tsx` | 참고용 | 상태 색상 컨벤션 레퍼런스 |

---

## 설치

### 1) 의존성 추가

```bash
npm i clsx tailwind-merge class-variance-authority lucide-react
```

> ⚠️ Tailwind v3 환경이라 `tailwind-merge` 는 **v2.x** 를 권장합니다 (`tailwind-merge@^2.5.0`). v3 은 Tailwind v4 타겟입니다.

### 2) 파일 배치

위 표대로 파일을 해당 위치에 복사합니다. `_document.page.tsx` 는 Lumir 의 `.page.tsx` 네이밍 규칙(`pageExtensions`)을 따라 이름을 맞춥니다. Lumir 프로젝트가 `_document.tsx` 규칙이면 확장자를 그대로 `.tsx` 로 쓰세요.

### 3) `_app.page.tsx` 확인

기존 `_app.page.tsx` 는 변경 불필요. `globals.css` 를 이미 import 하고 있으므로 그대로 동작합니다.

### 4) 기본 테마 결정

- 기본값을 **라이트**로 두려면 아무 설정 없이 배포. `_document` 스크립트는 `localStorage` 에 `'dark'` 가 저장돼 있을 때만 `dark` 클래스를 붙입니다.
- 기본값을 **다크**로 두려면 `_document.example.tsx` 의 스크립트에서 `DEFAULT` 를 `'dark'` 로 변경 (파일 내 주석 참고).

---

## 디자인 토큰

### 팔레트 (RGB 채널값 — Tailwind alpha modifier 지원용)

| 토큰 | Light (`:root`) | Dark (`.dark`) |
|---|---|---|
| `background` | `255 255 255` | `26 26 26` |
| `foreground` | `26 26 26` | `245 245 245` |
| `card` | `249 250 251` | `38 38 38` |
| `card-foreground` | `26 26 26` | `245 245 245` |
| `border` | `229 231 235` | `58 58 58` |
| `muted` | `243 244 246` | `58 58 58` |
| `muted-foreground` | `107 114 128` | `160 160 160` |
| `accent` | `16 185 129` (emerald-500) | `52 211 153` (emerald-400) |
| `accent-foreground` | `255 255 255` | `26 26 26` |
| `destructive` | `220 38 38` (red-600) | `239 68 68` (red-500) |
| `success` | `16 185 129` | `52 211 153` |
| `warning` | `217 119 6` (amber-600) | `251 191 36` (amber-400) |
| `sidebar` | `249 250 251` | `26 26 26` |
| `sidebar-foreground` | `107 114 128` | `160 160 160` |
| `sidebar-border` | `229 231 235` | `38 38 38` |
| `sidebar-accent` | `255 255 255` | `38 38 38` |
| `ring` | `16 185 129` | `52 211 153` |

> 💡 값은 **RGB 3채널(공백 구분)** 형식으로 정의합니다. `tailwind.config.js` 가 `rgb(var(--accent) / <alpha-value>)` 로 래핑하기 때문에 `bg-accent/15` 같은 알파 수식자가 동작합니다. hex(`#10b981`) 로는 알파 수식자가 안 먹습니다.

### 기존 팔레트 유지

`tailwind.config.js` 는 Lumir 의 기존 제한 팔레트(`white`, `gray`, `blue`, `yellow`, `green`, `red`)를 **그대로 유지**한 채 SDPE 토큰만 추가합니다. 기존 클래스(`bg-gray-100`, `text-blue-600` 등) 는 영향을 안 받습니다.

---

## 사용 규약

### 상태 색상

상태 뱃지·배경은 `{color}/15` 투명도를 기본 패턴으로 사용합니다:

| 상태 | 클래스 패턴 |
|---|---|
| 진행 중 / 활성 | `bg-accent/15 text-accent` |
| 완료 / 성공 | `bg-success/15 text-success` |
| 실패 / 에러 | `bg-destructive/15 text-destructive` |
| 경고 | `bg-warning/15 text-warning` |
| 유휴 / 비활성 | `bg-muted/50 text-muted-foreground` |

라이트 모드에서 `/15` 가 너무 옅다고 느껴지면 `/20` 으로 올립니다. `StatusBadge.example.tsx` 에 SDPE 의 원본 매핑이 담겨 있습니다.

### 레이아웃 색상

- 페이지 배경: `bg-background text-foreground` (body 에 이미 적용됨)
- 카드/패널: `bg-card text-card-foreground border border-border`
- 사이드바: `bg-sidebar text-sidebar-foreground border-sidebar-border`
- 포커스 링: `focus:ring-2 focus:ring-ring`
- 보조 텍스트: `text-muted-foreground`

### 클래스 조합

```ts
import { cn } from '@/lib/utils';

<div className={cn('base classes', condition && 'conditional', props.className)} />
```

---

## 테마 전환

### React 컴포넌트에서

```tsx
'use client';
import { useTheme } from '@/lib/theme';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button onClick={toggle} aria-label="테마 전환">
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
```

### 동작 방식

1. `_document` 의 인라인 스크립트가 React 하이드레이션 **전에** `localStorage['sdpe-theme']` 을 읽어 `<html>` 에 `dark` 클래스를 적용/제거 → 페이지 로드 시 플래시 없음
2. `useTheme()` 훅이 `useSyncExternalStore` + `MutationObserver` 로 DOM 클래스 변화를 구독 → 여러 컴포넌트에서 토글해도 자동 동기화
3. 토글 클릭 시 DOM 클래스 + localStorage 동시 갱신

---

## Tailwind v3 ↔ v4 주의점

SDPE 본가는 Tailwind v4 로 `@theme inline` + `@import "tailwindcss"` 를 사용합니다. Lumir 는 v3 이라 **문법이 다릅니다**. 이 핸드오프 패키지는 모두 **v3 문법** 으로 변환해뒀습니다:

| 항목 | SDPE (v4) | 이 패키지 (v3) |
|---|---|---|
| CSS entry | `@import "tailwindcss";` | `@tailwind base/components/utilities;` |
| 토큰 정의 | `@theme inline { --color-accent: ... }` | `tailwind.config.js` 의 `theme.colors` |
| 다크모드 | `.dark` CSS 셀렉터 | `darkMode: 'class'` + `.dark` 셀렉터 |
| 알파 수식자 | 자동 | `rgb(var(--X) / <alpha-value>)` 패턴 필요 |

향후 Lumir 도 Tailwind v4 로 올리면 SDPE 설정을 거의 그대로 쓸 수 있습니다.

---

## 이식하지 않은 것

- **ReactFlow 전용 스타일** (`react-flow__node-*`, 에지 글로우 등) — Lumir 가 `@xyflow/react` 를 안 쓰므로 제외. 필요해지면 SDPE 의 `src/app/globals.css` 하단 블록을 복사하세요.
- **폰트** — SDPE 는 Geist 를 `next/font/google` 로 주입합니다. Lumir 는 기본 시스템 폰트 유지. 필요하면 `_app.page.tsx` 에서 `next/font` 로 추가.
- **컴포넌트 라이브러리 전체** — `StatusBadge` 외의 `Card`, `Toast` 등은 포함하지 않았습니다 (의존 범위가 커짐). 필요하면 SDPE `src/components/ui/` 를 개별 복사하세요.

---

## 문의

수치·투명도·토큰 이름 등 조정이 필요하면 SDPE 쪽과 논의해서 양쪽을 동시에 바꾸는 것을 권장합니다 (장기적으로 모노레포화까지 고려 가능).
