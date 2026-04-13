# 운영 안전성 — 위험 액션 보호

운영자의 실수로 인한 의도치 않은 재처리·취소를 방지하기 위한 UI 안전장치입니다.

---

## S-01 · confirm / prompt → shadcn 다이얼로그 교체

**우선순위:** 🟥 Critical  
**관련 파일:** `src/app/(planning)/_ui/ConsolePage.tsx`  
**DESIGN.md 근거:** §14.1 (위험 액션 2단계 확인)

### 문제

브라우저 기본 `confirm()` / `prompt()` 사용 중:

```ts
// ConsolePage.tsx:228
if (!selectedJob || !confirm(`Job ${selectedJob.jobId}을(를) 재처리하시겠습니까?`)) return;

// ConsolePage.tsx:236
if (!selectedJob || !confirm(`Job ${selectedJob.jobId}을(를) 취소하시겠습니까?`)) return;

// ConsolePage.tsx:255
const name = prompt('파이프라인 이름을 입력하세요:');
```

**문제점:**
- 브라우저 기본 다이얼로그는 스타일링 불가, 접근성 미흡
- 재처리/취소 확인에 2단계 보호 없음 (클릭 한 번으로 위험 액션 실행)
- 파이프라인 생성 폼이 단일 텍스트 입력으로만 구성 — 위성/모드 선택 불가

### 구현 지침

#### 재처리 확인 다이얼로그 (`ReprocessConfirmDialog`)

shadcn/ui `Dialog` 사용. S-02와 연계하여 Job ID 타이핑 확인 포함 (S-02 참고).

```tsx
// src/components/panels/ReprocessConfirmDialog.tsx
interface ReprocessConfirmDialogProps {
  open: boolean;
  jobId: string;
  onConfirm: () => void;
  onCancel: () => void;
}
```

컴포넌트 내부 구조:
```
[제목] Job 재처리 요청
[설명] 아래 Job을 처음부터 재처리합니다. 진행 중인 모든 단계가 초기화됩니다.

Job ID: JOB-0001  (읽기 전용 표시)
Scene:  KS5-20260401-001

확인을 위해 Job ID를 입력하세요:
[입력 필드]  ← S-02와 연계

[취소]  [재처리 요청]  ← Job ID 일치 시에만 활성화
```

#### 취소 확인 다이얼로그 (`CancelConfirmDialog`)

재처리보다 덜 위험하므로 단순 확인 다이얼로그 허용 (Job ID 타이핑 불필요).

```tsx
// src/components/panels/CancelConfirmDialog.tsx
```

#### 파이프라인 생성 다이얼로그 (`CreatePipelineDialog`)

```tsx
// src/components/panels/CreatePipelineDialog.tsx
```

입력 필드:
- 이름 (텍스트)
- 위성 ID (Select: KS-5 / KS-6 / KS-7)
- 모드 (Select: Stripmap / ScanSAR / Spotlight)

> 모드 선택 시 해당 모드의 기본 스텝 구성(`MODE_STEP_VARIANTS`)이 자동 적용됩니다.

#### ConsolePage 수정

`handleReprocessJob`, `handleCancelJob`에서 `confirm()` 제거 후 다이얼로그 state로 교체:

```ts
const [reprocessDialogOpen, setReprocessDialogOpen] = useState(false);
const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
const [createPipelineDialogOpen, setCreatePipelineDialogOpen] = useState(false);
```

### 완료 기준

- [x] 프로젝트 내 `confirm()` / `prompt()` 사용 0건
- [x] 재처리 버튼 클릭 → shadcn Dialog 열림
- [x] 취소 버튼 클릭 → shadcn Dialog 열림
- [x] 파이프라인 생성 버튼 클릭 → 위성/모드 선택 폼 Dialog 열림

---

## S-02 · 재처리 2단계 확인 — Job ID 직접 타이핑

**우선순위:** 🟥 Critical  
**관련 파일:** `src/components/panels/ReprocessConfirmDialog.tsx` (S-01에서 신설)  
**DESIGN.md 근거:** §14.1 🟥 — "위험 액션 2단계 확인"

### 문제

DESIGN.md §14.1:

> **위험 액션 2단계 확인** — 부분 재처리(target_level = LEVEL_0)·전체 큐 비우기·대량 재처리는 *입력 확인 다이얼로그*(Job ID 직접 타이핑)로 두 번 확인.

전체 재처리와 LEVEL_0 부분 재처리는 파이프라인 전체가 초기화되는 고위험 액션입니다. 더블클릭이나 실수 클릭을 방지하기 위해 Job ID를 직접 타이핑해야만 확인 버튼이 활성화되어야 합니다.

### 구현 지침

`ReprocessConfirmDialog` (S-01에서 신설) 내부에 구현합니다.

```tsx
const [inputJobId, setInputJobId] = useState('');
const isConfirmEnabled = inputJobId === jobId;

// 확인 버튼
<Button
  variant="destructive"
  disabled={!isConfirmEnabled}
  onClick={onConfirm}
>
  재처리 요청
</Button>
```

**적용 기준:**
- 전체 재처리: 항상 Job ID 타이핑 필요
- 부분 재처리 LEVEL_0: Job ID 타이핑 필요 (사실상 전체 재처리)
- 부분 재처리 LEVEL_1~3: 단순 확인 버튼으로 충분

**UX 세부 사항:**
- 입력 필드 placeholder: `"Job ID를 입력하세요 (예: JOB-0001)"`
- 불일치 시 버튼 `disabled` + 입력 필드 테두리 유지
- 일치 시 버튼 활성화 (색상 전환 애니메이션)

### 완료 기준

- [x] 전체 재처리 다이얼로그에 Job ID 입력 필드 존재
- [x] Job ID 불일치 시 "재처리 요청" 버튼 비활성화
- [x] Job ID 일치 시 버튼 활성화
- [x] LEVEL_0 부분 재처리에도 동일 로직 적용

---

## S-03 · Alert ack 낙관적 동시성 처리

**우선순위:** 🟧 High  
**관련 파일:** `src/components/panels/AlertsTab.tsx`, `src/services/pipeline.service.interface.ts`  
**DESIGN.md 근거:** §14.1 🟧 — "Optimistic concurrency"

### 문제

두 운영자가 동시에 같은 Alert를 ack하는 경우, 프론트엔드에서 중복 처리 여부를 감지할 수 없습니다. DESIGN.md §14.1:

> Alert ack/Job 취소 시 백엔드에 `If-Match: <version>` 헤더 동반. 동시 두 운영자 ack 충돌을 409로 거절하고 토스트로 알린다.

### 구현 지침

#### 프론트엔드 준비 (백엔드 구현 전 기반 작업)

1. **`Alert` 타입에 `version` 필드 추가**

   ```ts
   // src/types/pipeline.ts
   export interface Alert {
     id: string;
     version: number;   // 추가 — ETag 역할, 초기값 1
     // ...
   }
   ```

2. **서비스 인터페이스 확장**

   ```ts
   // src/services/pipeline.service.interface.ts
   Alert을_확인한다(
     alertId: string,
     options?: { ifMatchVersion?: number }
   ): Promise<ServiceResponse>;
   ```

3. **Mock에서 409 시뮬레이션**

   ```ts
   // pipeline.mock.service.ts
   async Alert을_확인한다(alertId, options) {
     const alert = this.alerts.find(a => a.id === alertId);
     if (!alert) return { success: false, message: '찾을 수 없음' };

     // 이미 ack된 경우 → 409 시뮬레이션
     if (alert.acknowledged && options?.ifMatchVersion !== undefined) {
       return { success: false, message: '이미 다른 운영자가 확인했습니다 (409)', code: 409 };
     }
     // ...
   }
   ```

4. **ConsolePage의 `handleAckAlert`에서 충돌 감지**

   ```ts
   const res = await service.Alert을_확인한다(alertId, { ifMatchVersion: alert.version });
   if (!res.success && res.code === 409) {
     // 토스트: "다른 운영자가 이미 확인했습니다"
     // Alert 목록 새로 고침
   }
   ```

5. **토스트 컴포넌트 연결**

   shadcn/ui `toast` 또는 `sonner` 사용. 현재 프로젝트에 토스트가 없다면 이 항목과 함께 도입.

#### 실제 백엔드 연결 시 (v2)

`PUT /api/v1/alerts/{id}/ack` 요청에 `If-Match: {version}` 헤더 추가.

### 완료 기준

- [x] `Alert` 타입에 `version` 필드 추가
- [x] Mock에서 이중 ack 시 409 응답 반환
- [x] 409 수신 시 토스트로 "이미 확인된 알림입니다" 표시
- [x] 충돌 후 Alert 목록 자동 갱신
