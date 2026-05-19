# CSC-03 Handoff — Forward CLI 인자 요청 (수요일)

> 이 문서는 일회용이다. 정해찬 책임으로부터 CLI-arg `pre_processor` 받고 통합 완료되면 **삭제**한다.
>
> **데모 D-1** (수요일). 데모는 목요일.

---

## 한 줄 상태

받은 Linux 릴리즈(`CatisTlm_Release_Linux/release/`) 의 통합은 끝났다 (commit [36ef422d](https://github.com/GTD-web/sar-data-process-element/commit/36ef422d) on `interface/명세-정의`). `libCatisTlm.so` 의존성 100% 해결, 컨테이너에서 라이브러리 로딩 + `Catis_ExtractPayload` 호출까지 동작 확인. 하지만 **Forward 파이프라인(CADU→H5) 의 entry point `pre_processor` 가 하드코드 데모** 라 운영 모드 사용 불가.

---

## 정해찬 책임께 보낼 메시지

복사해서 그대로 보내면 됨:

> 정해찬 책임님 안녕하세요. 웹파트 우창욱입니다.
>
> 보내주신 자료로 컨테이너에서 라이브러리 로딩까지는 확인했습니다. 막힌 부분이 있어 문의드립니다.
>
> 1. `pre_processor` 가 workspace 경로(`d:/projects/postprocess/CATIS/workspace`) 와 aux 파일 위치가 모두 하드코드되어 있어, SDPE 백엔드에서 매 요청마다 다른 CADU 를 넘길 수가 없는데, CLI 인자 받는 버전으로 빌드 가능하실까요?
>
> 2. CADU 입력 파일을 라이브러리가 어디서 읽는지도 함께 확인 부탁드립니다 (헤더 `CatisPipelineConfig` 에 CADU 경로 필드가 없어서요).
>
> 감사합니다.

---

## 회신 받으면 할 일 (수요일)

### A. 새 `pre_processor` ELF 받은 경우

```bash
# 받은 새 ELF 를 lib 와 함께 같은 경로에서 받았다고 가정
cat "<received>/pre_processor" > natives/csc-03-l0-processor/bin/pre_processor

# Docker 재배포
docker rm -f sdpe-frontend 2>/dev/null
docker build -t sdpe-frontend:latest -f frontend/Dockerfile .
docker run -d --name sdpe-frontend --restart=unless-stopped -p 3010:3000 sdpe-frontend:latest

# 새 CLI 시그니처 확인
MSYS_NO_PATHCONV=1 docker exec sdpe-frontend /app/natives/csc-03/bin/pre_processor --help
```

그 후 SDPE 백엔드 wiring (남은 미해결 항목, `csc-demo-integration.md § 7` 참고):

1. `frontend/src/server/sar/stage-runner.ts` 의 `STAGE_CONFIG` 에 `L0` 추가 (정해찬 책임이 알려준 CLI 인자 형식대로 `buildArgs` 작성).
2. `frontend/src/app/api/sar/execute/route.ts` 의 spawn 호출에 `spawnMode === 'native'` 분기.
3. `frontend/src/app/api/sar/upload/route.ts` 의 확장자 화이트리스트에 `.cadu` 추가.
4. `frontend/src/app/api/sar/source/[stage]/route.ts` 의 `SOURCE_BY_SAR_STAGE` 에 `L0` 매핑.
5. `frontend/src/app/(planning)/_services/pipeline.mock.ts` 의 `CSC04_DEMO_STEPS` 앞에 prepend:
   ```typescript
   { kind: 'FILE_INPUT', inputLevel: 'CADU' },
   JOB_INIT_STEP,
   { kind: 'SAR', sarStage: 'L0' },
   ```
6. `frontend/src/types/pipeline.types.ts` 의 `inputLevel` 에 `'CADU'` 추가.
7. `frontend/src/types/pipeline.constants.ts` 에 CADU 라벨/설명.
8. `frontend/src/components/panels/NodeDetailModal.tsx` 에서 `inputLevel === 'CADU'` 분기 — `accept=".cadu"`.
9. `ConsolePage.tsx` 의 `handleAutoRunCascade` — L0 산출 `.h5` 를 L1A 입력으로 전달.

이 9개 단계는 CSC-04 데모 패턴([커밋 a0aa53d8](https://github.com/GTD-web/sar-data-process-element/commit/a0aa53d8) 등) 그대로 따라가면 된다. 한 묶음으로 작업 → 컨테이너 재배포 → `cd frontend && npm run e2e` 통과 확인.

### B. 회신이 늦거나 "CLI 빌드 못 한다" 인 경우

선택지 둘:

- **B-1. 우리가 wrapper.cpp 자력 작성** — Dockerfile 에 `g++` 다시 추가, `src/forward_runner.cpp` 신규 (`Catis_CreatePipeline → Extract → Decrypt → ProcessRangeLines → ExportHDF5` 호출 + argv 파싱). 단, 정해찬 책임 회신에서 **"CADU 입력이 어떻게 라이브러리에 들어가는지"** 답이 와야 가능 (헤더에 cadu_path 필드 없음).
- **B-2. L0 mock + L1A 부터 실제** — 시연 안정성 우선. L0 노드는 시각적으로만 진행 표시 후 prebaked `.h5` 를 L1A 에 넘김. NodeDetailModal 의 OUTPUT 패널에 "DRM 검증 대기 중" 배너 표시. CSC-04 데모는 그대로 동작.

목요일 데모 시간 압박 시 **B-2 가 가장 안전**. 라이브러리 통합 자체는 commit 36ef422d 로 끝났으니 시연 후에도 그 위에 이어 작업 가능.

---

## 추가 컨텍스트 — 새 Claude 세션이 이어서 작업할 때

### 현재 폴더 상태

```
natives/csc-03-l0-processor/
├── include/catis_tlm/catis_telemetry.h   # 신규 헤더 (Forward + Reverse API)
├── lib/                                  # ldd 100% resolve 확인됨
│   ├── libCatisTlm.so
│   ├── libhdf5.so.200                    # HDF5 1.14.x (Debian Bookworm 의 .103 과 불일치 — 번들 필수)
│   ├── libhdf5_cpp.so.200
│   └── libsz.so.2
├── bin/                                  # 5개 사전 빌드 ELF
│   ├── pre_processor                     # ★ 하드코드 데모 (이 문서의 문제)
│   ├── post_processor                    # H5→CADU (CLI 인자 정상)
│   ├── hdf5_to_src                       # H5→src
│   ├── src_to_src_m                      # src→src_m
│   └── src_m_to_cadu                     # src_m→cadu
├── aux-data/                             # 5개 .bin (커밋됨). aux/ 는 Windows 예약어라 dash-suffix.
├── run.sh                                # LD_LIBRARY_PATH 셋업 + bin/<tool> exec
├── examples/nodejs_example.md
└── README.md
```

### Dockerfile 변경 요약 (수정 불필요, 이미 적용됨)

- apt 의 `libhdf5-*`, `g++`, `libhdf5-dev` 제거 (번들 .so 사용).
- `COPY natives/csc-03-l0-processor /app/natives/csc-03`.
- `RUN chmod +x /app/natives/csc-03/bin/* /app/natives/csc-03/run.sh`.
- `ENV LD_LIBRARY_PATH=/app/natives/csc-03/lib`, `SDPE_NATIVES_CSC03_DIR=/app/natives/csc-03`.

### 검증 명령 (안 막혔는지 확인)

```bash
# 컨테이너 안에서 라이브러리 의존성 — 모두 → 가 떠야 정상
MSYS_NO_PATHCONV=1 docker exec sdpe-frontend ldd /app/natives/csc-03/lib/libCatisTlm.so

# 5 ELF 동작 확인 (pre_processor 빼고 모두 --help 응답해야 정상)
for elf in pre_processor post_processor hdf5_to_src src_to_src_m src_m_to_cadu; do
  echo "=== $elf ==="
  MSYS_NO_PATHCONV=1 docker exec sdpe-frontend /app/natives/csc-03/bin/$elf --help 2>&1 | head -5
done
```

### 헤더 변화 (지난주 받은 Windows 버전 대비)

`CatisPipelineConfig` struct 가 진화 — 새 필드:
- `output_file_prefix[256]`
- DRM toggle: `enable_randomizer`, `enable_rs_fec`, `enable_3des`
- Reverse tuning: `src_chunk_size`, `src_buf_size_mb`, `src_no_double_buffer`

새 함수 (Reverse 파이프라인):
- `Catis_GenerateSrc`, `Catis_SegmentSrc`, `Catis_EncryptPayload`, `Catis_EncodeCadu`, `Catis_H5ToCadu`

ABI 변경되어 이전 Windows `cli_runner.cpp` 는 호환 안 됨 (struct 메모리 레이아웃 달라짐). 그래서 옛 Windows 자산은 이번 커밋에서 제거됨.

### DRM 컨텍스트

정해찬 책임 메시지 (일요일 받음):
> 우선 리눅스 빌드는 했는데 DRM 때문에 테스트를 못하는 환경입니다. DRM때문에 데이터 파일이 변형되서 검증이 안되거든요. DRM 문제 정리되면 해볼게요. 우선 기능검증 해주세요.

→ 라이브러리는 정상 빌드되었으나 정해찬 책임 측 테스트 환경에서 end-to-end 검증 불가. DRM 해결은 별도 트랙. 우리 시연 데이터(`16_resized.cadu`) 가 DRM 영향 받지 않는 파일이라면 통합 검증 가능, 그렇지 않으면 B-2 로 폴백.

---

## 관련 커밋

- [36ef422d](https://github.com/GTD-web/sar-data-process-element/commit/36ef422d) — Linux 릴리즈 통합 (현재)
- [1a623f20](https://github.com/GTD-web/sar-data-process-element/commit/1a623f20) — Windows 버전 골격 (지난 주, deprecated)
