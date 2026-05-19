# CSC-03 Level-0 Processor (CATIS Telemetry)

위성 다운링크 CADU(`.cadu`) 파일을 Level-0 HDF5(`.h5`)로 변환하는 네이티브 파이프라인. 한컴인스페이스 정해찬 책임 제공.

내부 처리: CCSDS De-packetize → BAQ De-compression → Range Line Reconstruction → Auxiliary Data Extraction → Calibration → HDF5 Export. 신규 릴리즈는 H5 → CADU 역방향 파이프라인도 함께 제공.

릴리즈 출처: `CatisTlm_Release_Linux/` (2026-05-18, Linux x86_64 빌드).

---

## 폴더 구성

```
csc-03-l0-processor/
├── include/catis_tlm/catis_telemetry.h   # 공개 헤더 (Forward + Reverse API)
├── lib/                                  # Linux 동적 라이브러리 (HDF5 번들 포함)
│   ├── libCatisTlm.so                    # 핵심 라이브러리
│   ├── libhdf5.so.200                    # HDF5 1.14.x C API (★)
│   ├── libhdf5_cpp.so.200                # HDF5 1.14.x C++ API
│   └── libsz.so.2                        # szip 압축 (HDF5 의존성)
├── bin/                                  # 사전 빌드 ELF (x86_64 Linux)
│   ├── pre_processor                     # Forward 전반부 (Extract+Decrypt+ProcessRangeLines)
│   ├── post_processor                    # Forward 후반부 (Export HDF5)
│   ├── hdf5_to_src                       # Reverse 1단계 (Catis_GenerateSrc)
│   ├── src_to_src_m                      # Reverse 2단계 (Catis_SegmentSrc)
│   └── src_m_to_cadu                     # Reverse 3단계 (EncryptPayload + EncodeCadu)
├── aux-data/                             # 보조 데이터 (매 변환마다 동일). `aux` 는 Windows 예약어라 dash-suffix.
│   ├── antenna_az.bin   (방위각)
│   ├── antenna_el.bin   (고도각)
│   ├── gps_hq.bin       (GPS 고품질)
│   ├── gps_lq.bin       (GPS 저품질 / 폴백)
│   └── replica.bin      (Replica 신호)
├── examples/nodejs_example.md            # Node.js spawn 예제
├── run.sh                                # LD_LIBRARY_PATH 셋업 + bin/<tool> exec
└── README.md
```

> **HDF5 SOVERSION 주의**: 번들된 HDF5 는 `.so.200` (1.14.x). Debian Bookworm 의 `libhdf5-cpp-103` (1.10.x) 과는 ABI 비호환이라 apt 패키지로는 대체 불가. **반드시 번들 lib/ 를 사용** (`LD_LIBRARY_PATH=/app/natives/csc-03/lib`).

---

## 의존성

### Linux (컨테이너 런타임)

특별한 apt 패키지 없음. 번들된 `.so` 들이 모두 처리. `LD_LIBRARY_PATH` 만 잡아주면 됨 — Dockerfile 의 `ENV LD_LIBRARY_PATH=/app/natives/csc-03/lib` 가 그 역할.

### Windows (개발용)

이번 릴리즈에 Windows DLL 은 포함되지 않음. Windows 로컬에서 직접 실행이 필요하면 OneDrive 의 별도 폴더(`BizboxA\CatisTlm\`) 에 있는 Windows DLL/lib + cli_runner.exe 사용. **단 그 Windows 버전은 헤더 ABI 가 구버전이므로 새 .so 와 섞어 쓰지 말 것**.

---

## API 변화 (Windows 구버전 → Linux 신버전)

### `CatisPipelineConfig` 새 필드

- `output_file_prefix[256]` — Forward 산출 파일명 베이스.
- **DRM/Feature toggle**:
  - `enable_randomizer` — Derandomize on/off
  - `enable_rs_fec` — Reed-Solomon FEC on/off
  - `enable_3des` — 3-DES 복호화 on/off
- **Reverse SrcGenerator 튜닝**: `src_chunk_size`, `src_buf_size_mb`, `src_no_double_buffer`.

### 신규 함수 (역방향 H5 → CADU)

```c
int Catis_GenerateSrc(handle, h5_path, src_path);
int Catis_SegmentSrc(handle, src_path, src_m_path);
int Catis_EncryptPayload(handle, src_m_path, dsrc_m_path);
int Catis_EncodeCadu(handle, src_m_path, cadu_path);
int Catis_H5ToCadu(handle, h5_path, src_path, src_m_path, cadu_path);  // 묶음
```

### 신규 에러 코드

| 코드 | 의미 |
|---|---|
| `CATIS_ERR_H5_READ_FAIL` (-60) | Reverse 시 H5 입력 읽기 실패 |
| `CATIS_ERR_ENCODE_FAIL` (-70) | CADU 인코딩 실패 |

기존 forward API (`Catis_ExtractPayload`/`DecryptPayload`/`ProcessRangeLines`/`ExportHDF5`) 는 그대로 유지.

---

## 호출 방식

### 권장: 사전 빌드 ELF 직접 spawn (SDPE 백엔드 적용)

```bash
# LD_LIBRARY_PATH 가 셋되어 있다는 전제
/app/natives/csc-03/bin/pre_processor <args>
/app/natives/csc-03/bin/post_processor <args>
```

또는 `run.sh` 가 LD_LIBRARY_PATH 자동 셋업:

```bash
/app/natives/csc-03/run.sh pre_processor <args>
```

각 ELF 의 CLI 시그니처는 `--help` 또는 `strings` 로 확인. 정식 문서 미포함.

### 대안: libCatisTlm.so 직접 dlopen / FFI

[examples/nodejs_example.md](examples/nodejs_example.md) 참고. SDPE 백엔드는 spawn 패턴 채택 — CSC-04 와 일관성 유지.

---

## DRM 이슈

정해찬 책임 코멘트: *"우선 리눅스 빌드는 했는데 DRM 때문에 테스트를 못하는 환경입니다. DRM때문에 데이터 파일이 변형되서 검증이 안되거든요."*

→ 라이브러리 자체는 정상 빌드. End-to-end 검증은 보내주신 분 환경에서 미진행. 우리 쪽에서:
- DRM 영향 받지 않는 CADU 샘플로 검증 (회사 NAS 의 `16_resized.cadu` 가 그것일 가능성)
- Feature toggle (`enable_3des=0`, `enable_randomizer=0`, `enable_rs_fec=0`) 로 일부 단계 우회해 부분 검증

---

## SDPE 백엔드 통합

[frontend/src/server/sar/stage-runner.ts](../../frontend/src/server/sar/stage-runner.ts) 의 `STAGE_CONFIG.L0` 에서 `bin/pre_processor` → `bin/post_processor` 를 순차 spawn. stdout 의 `[PROGRESS NN%]` 라인을 SSE 로 클라이언트에 중계.

전체 시연 흐름은 [frontend/docs/csc-demo-integration.md § 7](../../frontend/docs/csc-demo-integration.md) 참고.
