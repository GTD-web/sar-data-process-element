# CSC-03 Handoff — Forward 파이프라인 통합

> 이 문서는 일회용이다. 통합 완료되면 **삭제**한다.
>
> **데모 D-1** (수요일). 데모는 목요일.

---

## 한 줄 상태

받은 Linux 릴리즈(commit `36ef422d`) 통합 완료, 라이브러리 로딩 + `Catis_ExtractPayload` 호출까지 검증됨. 하지만 `pre_processor` ELF 가 하드코드 데모라 운영 모드 사용 불가. 해찬프로님과 채팅으로 추가 조율 진행 중.

---

## 1차 메시지 — pre_processor CLI 빌드 요청 (보냄, 2026-05-20)

> 해찬프로님 안녕하세요.
>
> 전달주신 Linux 빌드 잘 받았습니다. 통합 진행하다 막힌 부분이 있어 다시 메시지 드립니다.
>
> pre_processor 가 workspace 경로와 aux 위치가 하드코드되어 있어 백엔드에서 매번 다른 CADU 를 넘기기가 어려운데, CLI 인자 받는 버전으로 빌드 가능하실까요?
>
> 추가로, 라이브러리가 CADU 입력 파일을 어디서 읽는지도 알려주시면 감사하겠습니다 (헤더 struct 에 CADU 경로 필드가 안 보여서요)
>
> 감사합니다.

## 해찬프로님 회신 (2026-05-20)

3가지 질문으로 회신:

1. `pre_processor` 가 HDF5 만드는 거 말하는 건가??
2. workspace 경로랑 aux 위치를 받아서 어디에 사용하는거야?
3. 아니면 그냥 빌드 전 파일을 달라고 그럴까??

### Q1 답 — Yes, forward 파이프라인 (CADU → H5)

`pre_processor` 안의 strings + dry-run 으로 `Catis_ExtractPayload → DecryptPayload → ProcessRangeLines → ExportHDF5` 시퀀스 확인됨. 이름이 헷갈리는데(`post_processor` 가 오히려 reverse H5 → CADU) `pre_processor` 가 forward 맞음.

### Q2 답 — SDPE 의 경로 운영 모델

| 항목 | SDPE 에서의 모습 | 매번 다른지? |
|---|---|---|
| CADU 입력 | 사용자가 업로드 → `/tmp/sdpe-uploads/<uploadId>.cadu` | 매 요청마다 다름 |
| workspace | `/tmp/sdpe-runs/<runId>/csc03-workspace/` | 매 요청마다 다름 |
| 출력 H5 | `/tmp/sdpe-runs/<runId>/L0.h5` → L1A 입력으로 자동 전달 | 매 요청마다 다름 |
| aux .bin 5개 | `/app/natives/csc-03/aux-data/` (컨테이너 이미지 동봉) | 고정 |

**중요**: aux 하드코드는 사실 문제 없음 (한 번 잡으면 됨). 진짜 막힌 건 **CADU 입력 / workspace / 출력 H5** 3개가 매 호출마다 달라야 한다는 점.

### Q3 답 — Yes, 빌드 전 cpp 파일 받는 게 더 좋음

이유:
- 데모 일정 (목요일) 상 추가 빌드 왕복 부담.
- 우리 컨테이너에 `g++` + 라이브러리 헤더는 이미 보유 가능 (apt 한 줄 + Dockerfile RUN 한 줄).
- 인자 형식을 우리가 직접 정해 SDPE 스타일에 맞출 수 있음.
- CSC-04 도 비슷한 패턴 (소스로 받아 컨테이너에서 실행).

## 2차 답신 — 소스 파일 요청 (보낼 것)

> 네, pre_processor 가 HDF5 만드는 forward 쪽 맞습니다.
>
> SDPE 백엔드가 시연/요청마다 사용자가 업로드한 다른 CADU 파일을 처리하는 구조라, 매번 컨테이너 안에 새 workspace 경로 잡고 그 안에서 라이브러리를 돌려야 합니다. aux .bin 5개는 컨테이너 이미지에 동봉해뒀으니 그쪽은 하드코드여도 괜찮은데, CADU 입력이랑 workspace, 출력 H5 경로 3개는 매번 달라져야 해서요.
>
> 빌드 전 cpp 파일 주시면 그게 가장 좋을 것 같습니다. 저희가 인자 받게 다듬어서 컨테이너 안에서 빌드해 쓰겠습니다.
>
> 감사합니다.

---

## 소스 받으면 할 일 (가장 가능성 높음)

### 1. 소스 파일 배치

```bash
# 받은 cpp / h / CMakeLists 같은 빌드 산출물을 src/ 에
mkdir -p natives/csc-03-l0-processor/src
cp -r "<received>/"* natives/csc-03-l0-processor/src/
```

### 2. Dockerfile 에 빌드 단계 추가

[frontend/Dockerfile](../../frontend/Dockerfile) 의 apt 블록에 `g++` 다시 추가, COPY 다음에 빌드 RUN 추가:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-numpy python3-scipy python3-h5py \
      python3-matplotlib python3-rasterio \
      g++ \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/local/bin/python

# COPY natives/csc-03-l0-processor /app/natives/csc-03 다음에:
RUN cd /app/natives/csc-03 \
    && g++ -std=c++17 -O2 \
         -Iinclude \
         src/*.cpp \
         -Llib -lCatisTlm \
         -Wl,-rpath,'$ORIGIN/../lib' \
         -o bin/forward_runner
```

(파일명 / 정확한 인자는 받은 소스 형태 보고 조정. `libhdf5-dev` 는 불필요 — 번들 `.so.200` 이 캡슐화.)

### 3. SDPE 백엔드/프론트 wiring (9단계)

CSC-04 데모 패턴([커밋 a0aa53d8](https://github.com/GTD-web/sar-data-process-element/commit/a0aa53d8)) 그대로 따라가면 됨.

1. `frontend/src/server/sar/stage-runner.ts` 의 `STAGE_CONFIG` 에 `L0` 추가 (받은 cpp 의 CLI 인자 형식대로 `buildArgs`).
2. `frontend/src/app/api/sar/execute/route.ts` 의 spawn 호출에 `spawnMode === 'native'` 분기.
3. `frontend/src/app/api/sar/upload/route.ts` 의 확장자 화이트리스트에 `.cadu` 추가.
4. `frontend/src/app/api/sar/source/[stage]/route.ts` 의 `SOURCE_BY_SAR_STAGE` 에 `L0` → cpp 매핑.
5. `frontend/src/app/(planning)/_services/pipeline.mock.ts` 의 `CSC04_DEMO_STEPS` 앞에 prepend:
   ```typescript
   { kind: 'FILE_INPUT', inputLevel: 'CADU' },
   JOB_INIT_STEP,
   { kind: 'SAR', sarStage: 'L0' },
   ```
6. `frontend/src/types/pipeline.types.ts` 의 `inputLevel` 에 `'CADU'` 추가.
7. `frontend/src/types/pipeline.constants.ts` 에 CADU 라벨/설명.
8. `frontend/src/components/panels/NodeDetailModal.tsx` 에서 `inputLevel === 'CADU'` 분기 — `accept=".cadu"`.
9. `ConsolePage.tsx` 의 `handleAutoRunCascade` — L0 산출 `.h5` 를 `sarOutputsByOrder` 에 저장 → L1A 가 자동 재사용.

한 묶음으로 작업 → 컨테이너 재배포 → `cd frontend && npm run e2e` 통과 확인.

---

## Fallback (소스 못 받거나 늦으면)

- **F-1**: 회신 한 번 더 — ELF CLI 버전이라도 받기.
- **F-2**: `koffi`/`ffi-napi` 로 `libCatisTlm.so` 직접 호출 — header 의 struct 를 TypeScript 로 옮겨야 함. SSE 진행률 직접 구현. (참고: [examples/nodejs_example.md](examples/nodejs_example.md))
- **F-3**: L0 mock + L1A 부터 실제 — 시연 안정성 우선. L0 노드는 시각적으로만 진행 표시 후 prebaked `.h5` 를 L1A 에 넘김. OUTPUT 패널에 "DRM 검증 대기 중" 배너 표시.

목요일 데모 시간 압박 시 **F-3 가 가장 안전**.

---

## 추가 컨텍스트 — 새 Claude 세션이 이어서 작업할 때

### CADU 가 무엇인가

CCSDS 표준의 위성 다운링크 raw 데이터 단위 (Channel Access Data Unit). 동기 마커 + 트랜스퍼 프레임 + payload + Reed-Solomon FEC + 3-DES 암호화로 구성된 비트스트림. CSC-03 가 이걸 풀어(De-packetize → Derandomize → RS-decode → 3-DES 복호 → Range Line 복원 → 캘리브레이션) HDF5 로 변환. 헤더의 `enable_randomizer/rs_fec/3des` 토글은 정확히 이 디코딩 단계들을 켜고 끄는 스위치 — DRM 문제 회피용 부분 검증에 활용 가능.

### 현재 폴더 상태

```
natives/csc-03-l0-processor/
├── include/catis_tlm/catis_telemetry.h
├── lib/
│   ├── libCatisTlm.so
│   ├── libhdf5.so.200                    # HDF5 1.14.x (Debian Bookworm 의 .103 과 SOVERSION 불일치)
│   ├── libhdf5_cpp.so.200
│   └── libsz.so.2
├── bin/                                  # 5개 사전 빌드 ELF
│   ├── pre_processor                     # ★ 하드코드 데모 (이 문서의 문제)
│   ├── post_processor                    # H5→CADU (CLI 인자 정상)
│   ├── hdf5_to_src
│   ├── src_to_src_m
│   └── src_m_to_cadu
├── aux-data/                             # 5개 .bin. aux/ 는 Windows 예약어라 dash-suffix.
├── run.sh                                # LD_LIBRARY_PATH 셋업 + bin/<tool> exec
├── examples/nodejs_example.md
└── README.md
```

### Dockerfile 현재 상태

이미 적용됨:
- apt 의 `libhdf5-*`, `g++`, `libhdf5-dev` 제거 (번들 .so 사용).
- `COPY natives/csc-03-l0-processor /app/natives/csc-03`.
- `RUN chmod +x /app/natives/csc-03/bin/* /app/natives/csc-03/run.sh`.
- `ENV LD_LIBRARY_PATH=/app/natives/csc-03/lib`, `SDPE_NATIVES_CSC03_DIR=/app/natives/csc-03`.

소스 받으면 `g++` 만 다시 apt 에 추가하면 됨.

### 검증 명령

```bash
# 컨테이너 안에서 라이브러리 의존성
MSYS_NO_PATHCONV=1 docker exec sdpe-frontend ldd /app/natives/csc-03/lib/libCatisTlm.so

# 5 ELF 동작 확인 (pre_processor 빼고 모두 --help 응답)
for elf in pre_processor post_processor hdf5_to_src src_to_src_m src_m_to_cadu; do
  echo "=== $elf ==="
  MSYS_NO_PATHCONV=1 docker exec sdpe-frontend /app/natives/csc-03/bin/$elf --help 2>&1 | head -5
done
```

### 헤더 변화 (Windows 구버전 → Linux 신버전)

`CatisPipelineConfig` 새 필드:
- `output_file_prefix[256]`
- DRM toggle: `enable_randomizer`, `enable_rs_fec`, `enable_3des`
- Reverse tuning: `src_chunk_size`, `src_buf_size_mb`, `src_no_double_buffer`

새 함수 (Reverse): `Catis_GenerateSrc`, `Catis_SegmentSrc`, `Catis_EncryptPayload`, `Catis_EncodeCadu`, `Catis_H5ToCadu`.

ABI 변경되어 옛 Windows `cli_runner.cpp` 호환 안 됨 → 이번 commit 에서 제거됨.

### DRM 컨텍스트

해찬프로님 (일요일 받음):
> 우선 리눅스 빌드는 했는데 DRM 때문에 테스트를 못하는 환경입니다. DRM때문에 데이터 파일이 변형되서 검증이 안되거든요. DRM 문제 정리되면 해볼게요. 우선 기능검증 해주세요.

라이브러리 자체는 정상. DRM 해결은 별도 트랙. 우리 시연 데이터 (`16_resized.cadu`) 가 DRM 영향 받지 않는 파일이라면 통합 검증 가능, 그렇지 않으면 F-3 폴백.

---

## 관련 커밋

- [47bbba2d](https://github.com/GTD-web/sar-data-process-element/commit/47bbba2d) — HANDOFF 메시지 채팅 톤 다듬음
- [8e8504e0](https://github.com/GTD-web/sar-data-process-element/commit/8e8504e0) — HANDOFF.md 초안
- [36ef422d](https://github.com/GTD-web/sar-data-process-element/commit/36ef422d) — Linux 릴리즈 통합
- [1a623f20](https://github.com/GTD-web/sar-data-process-element/commit/1a623f20) — Windows 버전 골격 (deprecated)
