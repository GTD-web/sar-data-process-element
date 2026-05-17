# CSC-03/04 Demo Integration

목요일(2026-05-14) 보고용 시연 통합. SDPE Frontend의 Manual Pipelines 노드 상세 패널에서
**CSC-03 (RAW → L0 HDF5) → CSC-04 CSU들 (L0 → SLC + Multi-look + Speckle)** 을 실제 실행하고
산출 QuickLook PNG / 메타데이터를 보여준다.

## 결정사항

- **백엔드 분리 X**. Next.js API route(`app/api/sar/**/route.ts`) 안에서 `child_process.spawn` 으로
  Python natives 직접 실행. NestJS 서브시스템에는 손대지 않는다.
- **컨테이너 안에서 실행** (옵션 A). `node:20-alpine` → **`node:20-bookworm-slim`** 베이스로 교체,
  Python3 + numpy/scipy/h5py/matplotlib 설치. 프론트엔드 컨테이너 1개로 시연 종결.
- **빌드 컨텍스트는 repo root** 로 변경 (`docker build -f frontend/Dockerfile .`). natives/ 가
  frontend/ 밖에 있어 COPY 하려면 필수.
- **H5 입력은 브라우저 multipart 업로드**. 호스트 볼륨 마운트 X — 시연 시 사용자가
  브라우저에서 H5 파일을 노드 모달에 업로드 → 컨테이너의 `/tmp/sdpe-uploads/<id>.h5`
  로 저장 → 그 경로를 Python 의 `--input` 으로 사용. Next.js route handler 의
  streaming body 로 받아 디스크에 흘려보낸다 (메모리에 다 올리지 않음).
- **시연용 H5 권장 크기**: 수백 MB ~ 1~2GB. 15GB(`16_resized.h5`)는 업로드 시간만
  10분 이상이라 비현실적. 작은 subset 을 별도 준비.

### 미해결 / 추후 결정

- 시연 시간 단축용 작은 샘플 H5 (subset/decimated). 시연에서 main.py 가 너무 오래 돌면 잘라낸
  버전 만들어 이미지에 동봉으로 전환 검토.
- CSC-03 인터페이스 (수요일 도착) — CLI 시그니처가 다르면 `STAGE_CONFIG` 매핑만 조정.
- 동시 실행 / 큐잉. 시연에서는 단일 실행 가정. 동시 호출 시 마지막 것만 살린다 (선택).
- 산출물 보존 정책. 데모 한정 — `/tmp/sdpe-runs/` 에 쌓이고 컨테이너 재시작 시 사라진다.

## 작업 순서

### 1. Dockerfile 변경 + 빌드 컨텍스트 root 로 이동

- 베이스 `node:20-bookworm-slim`
- `apt-get install python3 python3-pip python3-numpy python3-scipy python3-h5py python3-matplotlib`
  (rasterio/numba 는 시연에 불필요)
- runner 단계에 `COPY natives/csc-04-level-1-processor /app/natives/csc-04`
- (수요일) `COPY natives/csc-03-... /app/natives/csc-03`
- `frontend/CLAUDE.md` 의 docker build 명령을 root 컨텍스트로 갱신:
  `docker build -t sdpe-frontend:latest -f frontend/Dockerfile .`
- 검증: 컨테이너 안에서 `python3 -c "import numpy, scipy, h5py, matplotlib; print('ok')"` 통과.

### 2. 업로드 디렉토리 + 환경변수 (볼륨 마운트 폐기)

- 컨테이너 안 `/tmp/sdpe-uploads/`, `/tmp/sdpe-runs/` 사용 (둘 다 nextjs 유저가 쓸 수 있는
  /tmp). 별도 chown 없이 동작.
- 환경변수: `SDPE_UPLOAD_DIR=/tmp/sdpe-uploads`, `SDPE_RUN_DIR=/tmp/sdpe-runs` Dockerfile 에 박음.
- `CLAUDE.md` / `AGENTS.md` 재배포 명령에서 볼륨 마운트와 `SDPE_DEMO_H5` 제거.
- 검증: 컨테이너 안에서 두 디렉토리에 nextjs 유저로 쓰기 가능한지 `touch` 확인.

### 3. API route 추가 (`app/api/sar/`)

- `upload/route.ts` — `POST` multipart/form-data, request body 를 stream 으로 읽어 디스크에
  흘림 (메모리 다 올리지 않음). 저장 경로: `${SDPE_UPLOAD_DIR}/<uploadId>.h5`. 응답:
  `{ uploadId, sizeBytes }`.
  - `export const runtime = 'nodejs'` (streaming + fs 필요), `export const maxDuration = 600`,
    Next 15 의 route handler body size 제한 풀기 (필요 시 next.config 의 `experimental.serverActions.bodySizeLimit` 등).
- `execute/route.ts` — `POST { stage, uploadId | inputRunId, params }` → `child_process.spawn`
  동기 실행, 완료 시 `{ runId, stdout, exitCode, outputs: { quicklook, slc, meta } }` 반환.
  (1차는 동기, SSE 는 5단계에서 도입 검토)
- `runs/[runId]/files/[name]/route.ts` — `GET` 으로 산출 파일(PNG/XML/TIFF) 정적 서빙.
  Path traversal 방지: `name` 은 화이트리스트(`QuickLook.png`, `SLC_metadata.xml`, ...)만 허용.
- `_lib/stage-runner.ts` — `STAGE_CONFIG` 매핑 (`L1A` → main.py, `L1B_MULTILOOK` → multilook,
  `L1B_SPECKLE` → speckle filter; `L0` 는 수요일).
- `_lib/run-store.ts` — `runId → outputDir`, `uploadId → uploadPath` 메모리 캐시 (in-memory Map).
- 출력 경로: `${SDPE_RUN_DIR}/<runId>/`.
- 검증:
  - `curl -F "file=@small.h5" /api/sar/upload` → uploadId
  - `curl POST /api/sar/execute -d '{"stage":"L1A","uploadId":"..."}'` → runId
  - `GET /api/sar/runs/<id>/files/QuickLook.png` → 200 PNG

### 4. STAGE_CONFIG 등록 + end-to-end 1회

- `L1A` (CSU-04.01/02/04) 만 우선 등록. `--input` 은 `SDPE_DEMO_H5`, `--output` 은 runDir.
- 처리 시간이 길면 `--decimate-range`, `--step` 으로 작게 시연용 파라미터 고정.
- `L1B_MULTILOOK` 은 직전 `L1A` runDir 의 SLC 를 입력으로 받아 동작 → `inputRunId` 도 받게 설계.
- `L1B_SPECKLE` 도 동일.
- 검증: `L1A → L1B_MULTILOOK → L1B_SPECKLE` 체인을 curl/Postman 으로 끝까지 한 번 통과.

### 5. NodeDetailModal — 파일 업로드 UI + 실제 결과 표시

- INPUT 패널(SAR 노드, 첫 노드인 경우)에 H5 파일 업로드 영역 추가:
  `<input type="file" accept=".h5">` + 업로드 진행률(progress event) + 업로드 완료 시
  `uploadId` 보관. 두 번째 이후 SAR 노드는 직전 노드의 `runId` 를 입력으로 사용.
- `handleExecute` 의 mock 로그 재생을 실제 fetch 로 교체 (SAR 노드만). 나머지(JOB_INIT,
  CATALOG 등)는 mock 유지.
- 완료 후 OUTPUT 패널에 `<img src={outputs.quicklook} />` + meta 키-값 테이블
  (`SLC_metadata.xml` 의 핵심 키 추출).
- 실패 시 stderr 도 터미널에 빨갛게 표시.
- 백엔드 미가동/에러 시 mock fallback 유지 (시연 안정성).
- 검증: 모달에서 H5 업로드 → Execute → 로그 흐름 → PNG 표시까지 브라우저로 확인.

### 6. (수요일) CSC-03 통합

- natives/ 에 추가, Dockerfile COPY 한 줄 추가, `STAGE_CONFIG.L0` 등록.
- 시연 파이프라인 mock(`pipeline.mock.ts`)에 "Demo: CSC03→CSC04 SLC" 파이프라인 1개 추가.

## 검증 체크리스트

작업 종료 시 확인:

- [x] `docker build -f frontend/Dockerfile .` 성공 (이미지 1.75GB — Python+scientific stack+rasterio 포함)
- [x] 컨테이너 안 python imports OK + `python3 /app/natives/csc-04/main.py --help` 정상
- [x] `POST /api/sar/upload` 가 raw body H5 받아 uploadId 반환 (큰 파일 streaming, 1.6GB ~7s)
- [x] `POST /api/sar/execute { stage:"L1A", uploadId }` 가 QuickLook PNG / SLC TIF / XML 경로 포함 응답 (~36s)
- [x] `GET /api/sar/runs/<id>/files/QuickLook.png` 실제 PNG (Content-Type, magic 정확)
- [x] L1B_MULTILOOK / L1B_SPECKLE 체이닝 (`inputRunId`) 동작
- [x] `/plan/console` SAR 노드 모달에서 H5 업로드 → Execute → QuickLook 표시 (e2e `sar-demo-csc04.spec.ts` 통과 51초)
- [x] L1B 체이닝 (prevRunId 자동 전달) e2e 통과
- [x] 기존 e2e 19개 모두 통과 (회귀 0)
- [x] `frontend/AGENTS.md` / `CLAUDE.md` 의 재배포 명령이 새 빌드 컨텍스트 반영
- [x] CSC-04 패키지 회귀 테스트 21 passed (옵션 인자 default None 으로 기존 동작 비트단위 보존)
- [ ] (수요일 후) CSC-03 노드도 동일 흐름 통과

---

## 7. CSC-03 통합 (수요일 수령 후 작업)

한컴인스페이스 정해찬 책임 제공 CatisTlm 라이브러리(CADU → L0 HDF5) 를 L0 노드 실행체로 통합한다.

### 사전 작업 (이미 완료, 2026-05-17)

`libCatisTlm.so` 수령 전이지만 컨테이너 골격은 미리 깔아뒀다:

- `natives/csc-03-l0-processor/` 폴더 골격 + 이미 보유한 자산 배치
  - `include/catis_tlm/catis_telemetry.h` — 4단계 파이프라인 헤더
  - `lib/CatisTlm.dll/.lib`, `hdf5.dll`, `hdf5_cpp.dll`, `zlib.dll` — Windows 백업
  - `src/cli_runner.cpp` — 정해찬 책임 제공 데모 (USE_POLLING 매크로)
  - `bin/cli_runner.exe` — Windows 빌드본
  - `aux-data/{antenna_az,antenna_el,gps_hq,gps_lq,replica}.bin` — 5개 보조 데이터 (`aux` 는 Windows 예약어라 dash-suffix)
  - `scripts/build_cli_runner.sh` — Linux ELF 빌드 스크립트 (.so 없으면 즉시 exit 0)
  - `README.md`, `examples/nodejs_example.md`
- `.dockerignore` 에 `!natives/csc-03-l0-processor/**` 추가
- `frontend/Dockerfile` 변경:
  - apt: `libhdf5-cpp-103`, `libhdf5-103`, `g++`, `libhdf5-dev` 추가
  - `COPY natives/csc-03-l0-processor /app/natives/csc-03`
  - `RUN bash /app/natives/csc-03/scripts/build_cli_runner.sh` (gated — .so 없으면 skip)
  - `ENV LD_LIBRARY_PATH=/app/natives/csc-03/lib`, `SDPE_NATIVES_CSC03_DIR=/app/natives/csc-03`

이 상태에서 docker build 는 통과하며, **CSC-04 데모는 회귀 없이 정상 동작**한다. L0 노드만 실 binary 가 없어 미실행 (스테이지 wiring 도 아직 추가하지 않음).

### 수요일 수령 직후 (당일 오전)

1. `libCatisTlm.so` 수령 → `natives/csc-03-l0-processor/lib/libCatisTlm.so` 배치.
2. (선택) `ldd lib/libCatisTlm.so` 로 의존성 확인 — `libhdf5_cpp.so.103`, `libhdf5.so.103` 매칭 확인.
3. `cli_runner.cpp` 를 CLI 인자 받도록 수정 (현재는 하드코드 데모):
   ```
   ./cli_runner --cadu <path> --workspace <dir> --output <h5> --aux-dir <dir>
                [--key <hex>] [--iv <hex>] [--lhcp-vcid N] [--rhcp-vcid N]
   ```
   - USE_POLLING=1 로 전환 (SSE 진행률 라인 일관성).
   - `getopt_long` 또는 단순 argv 파싱.
4. Docker 재빌드 — `RUN bash .../build_cli_runner.sh` 가 이제 실제 g++ 컴파일 수행.
5. `docker exec sdpe-frontend /app/natives/csc-03/bin/cli_runner --help` 로 동적 링킹 확인.

### 수요일 오후 — 백엔드 wiring

`frontend/src/server/sar/stage-runner.ts` 의 `STAGE_CONFIG` 에 `L0` 항목 추가:

```typescript
const NATIVES_CSC03_DIR = process.env.SDPE_NATIVES_CSC03_DIR ?? '/app/natives/csc-03';

L0: {
  script: path.join(NATIVES_CSC03_DIR, 'bin', 'cli_runner'),
  spawnMode: 'native',                       // python3 가 아닌 ELF 직접 실행
  buildArgs: (ctx) => [
    '--cadu',      ctx.caduPath,
    '--workspace', path.join(ctx.runDir, 'csc03-workspace'),
    '--output',    path.join(ctx.runDir, 'L0.h5'),
    '--aux-dir',   path.join(NATIVES_CSC03_DIR, 'aux-data'),
  ],
  parseProgress: parseCatisProgressLine,     // [PROGRESS NN%] ... 매칭
  resolveOutputs: (outputDir, files) => ({
    primary: files.find((f) => f.endsWith('L0.h5')) ?? null,
    meta:    null,
  }),
},
```

`frontend/src/app/api/sar/execute/route.ts` 의 spawn 호출에 `spawnMode === 'native' ? cfg.script : 'python3'` 분기 추가.

`frontend/src/app/api/sar/upload/route.ts` 의 확장자 화이트리스트에 `.cadu` 추가.

`frontend/src/app/api/sar/source/[stage]/route.ts` 의 `SOURCE_BY_SAR_STAGE` 에 `L0: 'src/cli_runner.cpp'` 매핑 + CSC-03 디렉토리 lookup 분기.

### 수요일 저녁 — 프론트엔드 wiring

`frontend/src/app/(planning)/_services/pipeline.mock.ts` 의 `CSC04_DEMO_STEPS` 앞에 prepend:

```typescript
const CSC04_DEMO_STEPS: StepDef[] = [
  { kind: 'FILE_INPUT', inputLevel: 'CADU' },   // 신규
  JOB_INIT_STEP,
  { kind: 'SAR', sarStage: 'L0' },              // 신규 (CSC-03)
  // ... 기존 L1A, L1B 들
];
```

- `frontend/src/types/pipeline.types.ts` 의 `inputLevel` 에 `'CADU'` 추가.
- `frontend/src/types/pipeline.constants.ts` 에 CADU 라벨/설명 추가.
- `frontend/src/components/panels/NodeDetailModal.tsx` 에서 `inputLevel === 'CADU'` 분기 — `accept=".cadu"` 업로드 UI.
- L0 노드 OUTPUT 패널 — SLC 스타일 단계별 진행 표시.
- `handleAutoRunCascade` (ConsolePage) — L0 산출 `.h5` 경로를 `sarOutputsByOrder` 에 저장 → L1A 가 자동으로 입력 재사용.

### 목요일 오전 (회사) — end-to-end 검증

1. 회사 NAS 의 `16_resized.cadu` 입력으로 cascade 실행.
2. 기대: L0(CSC-03) → L1A(SLC) → Multi-look → Speckle 5종 까지 자동 진행 + 각 단계 SSE 진행률 + 산출 QuickLook PNG 표시.
3. 회귀: 기존 19개 e2e 스펙 통과 + 신규 CSC-03 스펙 1개 추가.

### .so 미수령 시 fallback

`build_cli_runner.sh` 는 .so 없으면 즉시 exit 0 하므로 컨테이너 빌드/기동 자체는 영향 없음. 시연 시점까지 .so 가 안 오면, 호스트 Windows 에서 `cli_runner.exe` 를 Express 사이드카로 감싸 `host.docker.internal:3011` 로 컨테이너가 HTTP 호출하는 우회 구조로 전환. 단 추가 작업량 큼 — 가능한 .so 수령으로 진행한다.
