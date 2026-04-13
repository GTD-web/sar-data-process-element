# 도메인 정확도 — SDPE 특화

SDPE ICD / DESIGN.md 명세와 실제 구현 간의 불일치 항목입니다.

---

## D-01 · RAW_DATA_RECEIVED 트리거 노드 추가

**우선순위:** 🟧 High  
**관련 파일:** `src/types/pipeline.ts`, `src/components/graph/PipelineNode.tsx`, `src/app/(planning)/_services/pipeline.mock.ts`  
**DESIGN.md 근거:** §4.1, §6 (`JobDetail.steps`)

### 문제

DESIGN.md §4.1에서 Job 그래프의 첫 번째 노드는 `RAW_DATA_RECEIVED`로 명시되어 있습니다.

> 노드: `RAW_DATA_RECEIVED`, `CSC-02 수집`, `CSC-03 L0`, ...

현재 파이프라인 그래프는 CSC-02(데이터 수집)부터 시작합니다. 위성에서 원시 데이터를 수신하는 SI-01 이벤트 트리거 노드가 빠져 있어, 운영자가 파이프라인의 시작점(수신 완료 시각, 파일 크기, checksum)을 그래프에서 확인할 수 없습니다.

### 구현 지침

1. **`TargetCsc` 타입 확장 또는 별도 노드 타입 분리**

   `RAW_DATA_RECEIVED`는 CSC가 아니라 외부 이벤트(EI-01)이므로, `TargetCsc`에 넣지 않고 별도 노드 종류로 처리합니다.

   ```ts
   // src/types/pipeline.ts
   export type PipelineNodeKind = 'TRIGGER' | 'CSC';

   export interface PipelineStepDefinition {
     order: number;
     kind: PipelineNodeKind;   // 추가
     targetCsc: TargetCsc;
     productLevel: ProductLevel;
     parentOrder?: number | null;
   }
   ```

2. **`PipelineNode.tsx` — TRIGGER 노드 렌더링 분기**

   - 아이콘: `Antenna` (lucide-react)
   - 라벨: "원시 데이터 수신"
   - 상태: `RAW_DATA_RECEIVED` 이벤트가 있으면 `COMPLETED`, 없으면 `PENDING`
   - Source Handle만 있고 Target Handle 없음 (파이프라인 진입점)
   - CSC-07과 마찬가지로 편집 불가 (삭제 버튼 숨김)

3. **Mock 데이터 업데이트**

   `pipeline.mock.ts`의 `PIPELINE_STEPS` 앞에 TRIGGER 스텝 추가:
   ```ts
   { kind: 'TRIGGER', targetCsc: 'CSC-02', productLevel: 'LEVEL_0' }  // 임시 targetCsc 사용 or null
   ```

4. **`JobDetail` 연동**

   Job 상세 조회 시 첫 스텝의 `receivedAt`, `file_size_bytes`, `checksum_sha256` 정보를 노드 클릭 → 우측 패널에 표시합니다. (mock에서는 `JobDetail.receivedAt` 필드를 활용)

### 완료 기준

- [ ] 캔버스 그래프 맨 왼쪽에 "원시 데이터 수신" 트리거 노드가 표시됨
- [ ] 트리거 노드 클릭 시 우측 패널에 `receivedAt`, `rawDataPath` 표시
- [ ] 트리거 노드에는 삭제 버튼이 없음
- [ ] Job 실행 뷰에서 트리거 노드 상태가 `COMPLETED`로 표시됨

---

## D-02 · 부분 재처리 target_level 선택 다이얼로그

**우선순위:** 🟧 High  
**관련 파일:** `src/components/panels/JobDetailPanel.tsx`, `src/services/pipeline.service.interface.ts`, `src/app/(planning)/_services/pipeline.mock.service.ts`  
**DESIGN.md 근거:** OPS-06, §2.1

### 문제

ICD OPS-06 시나리오에서 운영자는 어느 레벨부터 재처리할지 `target_level`을 선택해서 SI-07을 발행해야 합니다. 현재는 전체 재처리("재처리" 버튼 하나)만 있고, 특정 레벨부터 재처리하는 UI가 없습니다.

### 구현 지침

1. **서비스 인터페이스 확장**

   ```ts
   // src/services/pipeline.service.interface.ts
   부분_재처리를_요청한다(jobId: string, params: {
     targetLevel: ProductLevel;
     targetCsc: TargetCsc;
   }): Promise<ServiceResponse>;
   ```

2. **`JobDetailPanel` 개선**

   - "재처리" 버튼을 드롭다운으로 변경:
     - **전체 재처리**: LEVEL_0부터 전체 재실행
     - **부분 재처리**: 드롭다운 → 레벨 선택 → 확인 다이얼로그

3. **부분 재처리 다이얼로그 (`PartialReprocessDialog`)**

   shadcn/ui `Dialog` 사용:
   ```
   [제목] 부분 재처리
   [설명] 선택한 레벨부터 이후 단계를 재실행합니다.
   
   재처리 시작 레벨: [Select] LEVEL_0 / LEVEL_1 / LEVEL_2 / LEVEL_3
   대상 CSC:         [자동 선택 — 레벨에 따라]
   
   ⚠ LEVEL_0 선택 시 전체 파이프라인이 재실행됩니다.
   
   [취소]  [재처리 요청]
   ```

4. **LEVEL_0 선택 시 추가 경고**

   DESIGN.md §14.1: LEVEL_0 부분 재처리는 사실상 전체 재처리 — 추가 확인 텍스트 표시.

### 완료 기준

- [ ] "재처리" 버튼 → 전체/부분 선택 드롭다운으로 변경
- [ ] 부분 재처리 클릭 시 target_level 선택 다이얼로그 열림
- [ ] LEVEL_0 선택 시 추가 경고 문구 표시
- [ ] `부분_재처리를_요청한다()` mock 구현 존재

---

## D-03 · CSC-07 미확정 상태 grey 처리

**우선순위:** 🟨 Med  
**관련 파일:** `src/components/graph/PipelineNode.tsx`, `src/types/pipeline.ts`  
**DESIGN.md 근거:** R-2 (SI-08 스키마 미설계)

### 문제

DESIGN.md R-2: SI-08(카탈로그 등록 완료 이벤트) 스키마가 미설계 상태입니다. CSC-07 노드의 완료 여부를 신뢰성 있게 판단할 수 없으므로, 등록 완료 노드는 상태 미표시(회색)로 노출해야 합니다.

### 구현 지침

1. **`PipelineNode.tsx` — CSC-07 조건 분기**

   ```tsx
   const isUnconfirmedNode = targetCsc === 'CSC-07';

   // STATUS_GLOW, STATUS_BORDER, StatusIcon 모두 회색으로 고정
   // 노드 하단에 "상태 미확인" 뱃지 표시
   ```

2. **시각적 처리**

   - 테두리 색: `border-muted` (회색, 다른 노드와 구분)
   - 아이콘 색: `text-muted-foreground`
   - 상태 뱃지 대신 `TBD` 또는 자물쇠 아이콘 + "상태 미확인" 툴팁
   - 노드 라벨에 `(SI-08 미확정)` 부연 표시

3. **향후 SI-08 확정 시 플래그 제거 위치**

   `PipelineNode.tsx:L78` — `isUnconfirmedNode` 조건 제거 후 기본 상태 로직으로 복귀.

### 완료 기준

- [ ] CSC-07 노드가 회색 스타일로 렌더링됨
- [ ] 노드 호버 시 "SI-08 스키마 미확정 — 상태 표시 불가" 툴팁 표시
- [ ] 다른 CSC 노드의 스타일에 영향 없음

---

## D-04 · TargetCsc 범위 주석 명시

**우선순위:** 🟩 Low  
**관련 파일:** `src/types/pipeline.ts`  
**DESIGN.md 근거:** `interfaces/csc-8/interfaces.md`

### 문제

`interfaces/csc-8/interfaces.md`의 `TargetCsc`는 CSC-08이 작업을 할당하는 대상(`CSC-03 ~ CSC-06`)만 포함합니다. 프론트엔드 `types/pipeline.ts`는 UI 표시 목적으로 CSC-02(수집 단계 표시)와 CSC-07(등록 단계 표시)을 추가로 포함합니다. 이 의도적 확장이 주석 없이 코드만 보면 ICD 위반처럼 보일 수 있습니다.

### 구현 지침

```ts
// src/types/pipeline.ts

/**
 * UI 표시용 CSC 범위.
 * ICD interfaces/csc-8의 TargetCsc('CSC-03'~'CSC-06')는 CSC-08이 작업을 할당하는 처리 CSC만 포함.
 * 프론트엔드는 파이프라인 전 구간 시각화를 위해 CSC-02(수집)와 CSC-07(등록)을 추가합니다.
 * v2에서 @sdpe/contracts 패키지 분리 시 프론트 확장 타입으로 명시적 분리 예정.
 */
export type TargetCsc = 'CSC-02' | 'CSC-03' | 'CSC-04' | 'CSC-05' | 'CSC-06' | 'CSC-07';
```

### 완료 기준

- [ ] `types/pipeline.ts`의 `TargetCsc` 정의에 위 주석 추가
