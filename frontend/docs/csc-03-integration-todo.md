# CSC-03 통합 — 2026-05-13 (수) 마감 작업

## 배경 / 목표

지금(2026-05-12 화)까지의 시연 흐름은 **사용자가 H5(L0) 를 업로드 → CSC-04 가 SLC 생성** 까지 완성됐다 (`csc-demo-integration.md` 참조).

수요일(**2026-05-13**) 에 **CSC-03 (Range Compression / Raw → HDF5(L0) 변환기)** 가 도착할 예정.
도착 즉시 시연 흐름을 **RAW 원시 데이터 → CSC-03 → L0 HDF5 → CSC-04 → SLC** 까지 확장해야 한다.

목요일(2026-05-14) 보고 시연에 반드시 포함되어야 함.

## 받기 전에 미리 확정해두면 좋은 것 (담당자에게 메일로)

- [ ] **입력 RAW 포맷**: 바이너리 raw? 어떤 인터페이스 헤더? 파일 확장자?
- [ ] **출력 H5 형식**: CSC-04 가 받는 `ST0/Raw data`, `ST0/Replica`, `ST0/GPSDATA_HQ`, ST0 attrs (PRF, Carrier Frequency, Sampling Frequency, Chirp baseband start/stop, Pulse Width 등) 가 동일한 스키마로 나와야 함. CSC-04 가 기대하는 attribute 키 목록은 `natives/csc-04-level-1-processor/shared/metadata.py:154-186` 참고.
- [ ] **CLI 시그니처**: `python main.py --input <raw> --output <dir>` 패턴 권장. CSC-04 와 같은 형태면 통합 1줄.
- [ ] **의존성**: numpy/scipy/h5py 외에 추가로 필요한 게 있는지 (apt 또는 pip 로 설치 가능한 것).

## 도착 후 작업 (예상 1~2시간)

### 1. 패키지 배치
- `natives/csc-03-...` 디렉토리에 풀어 넣기 (이름은 `csc-03-l0-formatter` 추천)
- README 의 빠른 사용법 섹션 확인
- 호스트에서 작은 RAW 샘플로 한 번 직접 실행해 산출 H5 가 CSC-04 입력으로 호환되는지 확인 (h5py 로 attrs/datasets 비교)

### 2. Dockerfile 갱신
**`frontend/Dockerfile`** runner stage 에 한 줄 추가:
```dockerfile
COPY --chown=nextjs:nodejs natives/csc-03-l0-formatter /app/natives/csc-03
```
또한 `/.dockerignore` 화이트리스트에 `!natives/csc-03-l0-formatter/**` 추가.

CSC-03 가 numpy/scipy/h5py 외 추가 의존성을 요구하면 apt 한 줄 추가 (rasterio 같은 패턴 참고).

### 3. STAGE_CONFIG 등록
**`frontend/src/server/sar/stage-runner.ts`** 의 `StageId` 와 `STAGE_CONFIG` 에 L0 추가:
```ts
export type StageId = 'L0' | 'L1A' | 'L1B_MULTILOOK' | 'L1B_SPECKLE';

L0: {
  script: '/app/natives/csc-03/main.py',
  buildArgs: ({ uploadPath, outputDir, params }) => {
    if (!uploadPath) throw new Error('L0 requires uploadPath (RAW)');
    return ['--input', uploadPath, '--output', outputDir, /* 시연용 옵션 (slice 등) */];
  },
  resolveOutputs: (_outputDir, files) => {
    // CSC-03 가 떨어뜨리는 H5 파일명 패턴에 맞춰서 primary 매핑
    const h5 = files.find((f) => f.endsWith('.h5'));
    return { primary: h5 };
  },
},
```

### 4. SarStage → StageId 매핑 추가
**`frontend/src/services/sar-execution.client.ts`**:
```ts
export function mapSarStageToStageId(sarStage: SarStage): SarStageId | null {
  if (sarStage === 'L0') return 'L0';   // ← 추가
  if (sarStage === 'L1A') return 'L1A';
  if (sarStage === 'L1B') return 'L1B_MULTILOOK';
  return null;
}
```

### 5. L1A 가 L0 의 H5 산출물을 입력으로 받게
지금 L1A 의 buildArgs 는 `uploadPath` 만 본다. 체이닝 시 `prevRun.primary`(H5) 를 입력으로 쓸 수 있게 분기 추가:
```ts
L1A: {
  buildArgs: ({ uploadPath, prevRun, outputDir, params }) => {
    const input = uploadPath ?? (prevRun ? path.join(prevRun.dir, prevRun.primary!) : null);
    if (!input) throw new Error('L1A requires uploadPath or prevRun(H5)');
    return ['--input', input, '--output', outputDir, /* 기존 옵션들 */];
  },
}
```

### 6. UI 흐름 확인
- 시연 파이프라인은 mock(`pipeline.mock.ts`) 의 `MULTI_LEVEL_BRANCH_STEPS` 가 이미 `L0 → L1A → L1B` 순. 그대로 사용 가능.
- L0 노드 모달 → RAW 파일 업로드 → Execute → L0.h5 산출
- L1A 노드 모달 → "Chained from prev run" 표시 → Execute → SLC + QuickLook
- L1B 노드 모달 → "Chained from prev run" → Execute → MLD QuickLook

### 7. e2e 스펙 확장
**`frontend/e2e/sar-demo-csc04.spec.ts`** 또는 새 파일 `sar-demo-csc03-csc04.spec.ts`:
- L0 노드부터 시작하도록 변경
- Upload 는 RAW 파일 (작은 샘플)
- L0 → L1A → L1B 3단계 체이닝 검증
- 각 단계의 QuickLook (CSC-03 가 산출물 PNG 도 만든다면) 또는 산출 파일 존재 확인

### 8. 검증 체크리스트
**`frontend/docs/csc-demo-integration.md`** 의 미완 체크박스 처리:
- [ ] (수요일 후) CSC-03 노드도 동일 흐름 통과 → ✅

## 시연 시 주의 (목요일 보고)

- 총 시연 시간 = RAW 업로드 + L0 처리 + L1A + L1B. 작은 RAW 샘플 미리 만들어두기 (수십 MB ~ 수백 MB 권장)
- CSC-03 산출 H5 가 CSC-04 와 호환 안 되면 시연 불가 → **수요일 받자마자 호스트에서 먼저 호환성 확인**
- 보고 직전 `docker build` 한 번 더 미리 (lcms2 같은 transient 미러 장애 방지)

## 관련 파일 / 참조

- 현재 통합 문서: `frontend/docs/csc-demo-integration.md`
- CSC-04 패키지: `natives/csc-04-level-1-processor/`
- CSC-04 가 기대하는 H5 스키마: `natives/csc-04-level-1-processor/shared/metadata.py:154-186`
- API routes: `frontend/src/app/api/sar/`
- STAGE_CONFIG: `frontend/src/server/sar/stage-runner.ts`
