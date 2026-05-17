# CSC-03 Level-0 Processor (CATIS Telemetry)

위성 다운링크 CADU(`.cadu`) 파일을 Level-0 HDF5(`.h5`)로 변환하는 네이티브 파이프라인. SDPE 파이프라인의 **CSC-03 (Level-0 Processor) / SAR L0 단계** 의 실제 구현체. 한컴인스페이스 정해찬 책임 제공.

내부 처리: CCSDS De-packetize → BAQ De-compression → Range Line Reconstruction → Auxiliary Data Extraction → Calibration → HDF5 Export.

---

## 폴더 구성

```
csc-03-l0-processor/
├── include/catis_tlm/catis_telemetry.h   # 공개 헤더 (4단계 파이프라인 API)
├── lib/
│   ├── libCatisTlm.so                    # Linux x86_64 빌드 (수요일 수령 예정) ⚠
│   ├── CatisTlm.lib                      # Windows import lib (개발 빌드용)
│   └── (CatisTlm.dll, hdf5.dll, hdf5_cpp.dll, zlib.dll — repo .gitignore 의 `*.dll` 규칙에 막혀 커밋되지 않음. Windows 로컬 개발 필요 시 OneDrive\BizboxA\CatisTlm\ 에서 직접 복사)
├── src/cli_runner.cpp                    # 정해찬 책임 제공 데모 (USE_POLLING 매크로)
├── bin/
│   ├── cli_runner.exe                    # Windows 빌드 (개발용)
│   └── cli_runner                        # Linux ELF (Docker 빌드 단계에서 g++ 컴파일)
├── aux-data/                             # 보조 데이터 (매 변환마다 동일하게 사용). `aux` 는 Windows 예약어라 dash-suffix.
│   ├── antenna_az.bin   (방위각 보정)
│   ├── antenna_el.bin   (고도각 보정)
│   ├── gps_hq.bin       (GPS 고품질)
│   ├── gps_lq.bin       (GPS 저품질 / 폴백)
│   └── replica.bin      (Replica 신호)
└── scripts/
    └── build_cli_runner.sh               # Linux 컴파일 스크립트 (Docker 빌드 단계에서 호출)
```

> **CADU 와 .bin 5개의 관계**: CADU 는 입력마다 다른 raw 파일. `.bin` 5개는 위성 보정/메타 데이터로 **매번 동일**. 그래서 .bin 은 레포에 커밋해서 Docker 이미지에 동봉하고, CADU 만 사용자가 업로드한다.

---

## 의존성

### Linux (컨테이너 런타임)

```bash
apt-get install -y libhdf5-cpp-103 libhdf5-103
```

### Windows (개발용)

`lib/` 의 DLL들(`CatisTlm.dll`, `hdf5.dll`, `hdf5_cpp.dll`, `zlib.dll`)을 PATH 또는 EXE 옆에 놓으면 `cli_runner.exe` 가 그대로 실행됨.

---

## C/C++ API

전체 흐름은 4단계 명시적 호출.

```c
#include "catis_tlm/catis_telemetry.h"

// 1. config 구성
CatisPipelineConfig cfg = {};
strcpy(cfg.workspace_path, "/tmp/sdpe-runs/<runId>/csc03-workspace");
strcpy(cfg.decryption_key,  "0123456789ABCDEF");      // 24-byte Hex (위성 키)
strcpy(cfg.decryption_key2, "...");
strcpy(cfg.decryption_iv,   "...");                    // 8-byte Hex
strcpy(cfg.decryption_iv2,  "...");
cfg.lhcp_vcid = 4;
cfg.rhcp_vcid = 5;
cfg.enable_dummy_insertion = 1;
cfg.single_thread_mode = 0;                            // 0=parallel, 1=sequential
strcpy(cfg.aux_antenna_az_path, "/app/natives/csc-03/aux-data/antenna_az.bin");
strcpy(cfg.aux_antenna_el_path, "/app/natives/csc-03/aux-data/antenna_el.bin");
strcpy(cfg.aux_gps_hq_path,     "/app/natives/csc-03/aux-data/gps_hq.bin");
strcpy(cfg.aux_gps_lq_path,     "/app/natives/csc-03/aux-data/gps_lq.bin");
strcpy(cfg.aux_replica_path,    "/app/natives/csc-03/aux-data/replica.bin");
strcpy(cfg.tm01_dir_name, "TM01");
strcpy(cfg.tm02_dir_name, "TM02");

// 2. 파이프라인 생성
void* handle = Catis_CreatePipeline(&cfg);

// 3. 진행률 모드 선택 (둘 중 하나)
Catis_SetProgressCallback(handle, my_cb);              // (a) Callback
// 또는 별도 스레드에서 Catis_GetProgress(handle, &p)   // (b) Polling

// 4. 4단계 처리 (각각 동기 호출)
Catis_ExtractPayload(handle);          // CCSDS De-packetize
Catis_DecryptPayload(handle);          // Decrypt
Catis_ProcessRangeLines(handle);       // BAQ + Range Line + Aux + Calibration
Catis_ExportHDF5(handle, "/out/L0.h5"); // HDF5 변환

// 5. 결과 조회 및 정리
char report[1024];
Catis_GetLastReport(handle, report, sizeof(report));
Catis_DestroyPipeline(handle);
```

### 상태 코드

| 코드 | 의미 |
|---|---|
| `CATIS_SUCCESS` (0) | 정상 |
| `CATIS_SUCCESS_WITH_WARNINGS` (1) | 경고 있음 |
| `CATIS_ERR_WORKSPACE_NOT_FOUND` (-10) | workspace 디렉토리 없음 |
| `CATIS_ERR_SYNC_MARKER_INVALID` (-20) | CADU 동기 마커 무효 |
| `CATIS_ERR_DECRYPT_FAIL` (-30) | 복호화 실패 (키/IV 오류) |
| `CATIS_ERR_DISK_FULL` (-40) | 디스크 공간 부족 |

### 진행률 표시

콜백 / 폴링 두 방식 모두 제공. SDPE 백엔드는 **stdout 라인을 SSE 로 중계**하는 구조라 둘 다 활용 가능.

- **콜백 (USE_POLLING=0, 단순)**: 라이브러리가 `progress_callback(int, const char*)` 를 호출 → stdout 출력. 라인 형식: `[PROGRESS NN%] <message>`.
- **폴링 (USE_POLLING=1, 정밀)**: 워커 스레드가 1초 간격으로 `Catis_GetProgress()` 호출 → stdout. 라인 형식: `[PROGRESS NN%] <step_name> ...` (carriage return 사용).

SDPE 시연 시 폴링 모드를 권장 (단계 라벨 일관성 + 1초 단위 갱신).

---

## cli_runner.cpp (정해찬 책임 제공 데모)

`src/cli_runner.cpp` 는 정해찬 책임이 전달한 **데모용** 진입점이다. 현재는 모든 config 값이 하드코드되어 있고(`d:/projects/postprocess/CATIS/workspace`), CLI 인자를 받지 않는다.

SDPE 백엔드에서 호출 가능하도록, **수요일 .so 수령 후 다음 중 한 가지로 wrapping** 한다:

### 옵션 A — cli_runner.cpp 를 CLI 인자 받도록 수정 (간단)

```bash
cli_runner --cadu <path> --workspace <dir> --output <h5> --aux-dir <dir> [--key <hex>] [--iv <hex>]
```

`scripts/build_cli_runner.sh` 가 Docker 빌드 단계에서 `g++ -Iinclude -Llib -lCatisTlm -lhdf5_cpp -lhdf5 -pthread -o bin/cli_runner src/cli_runner.cpp` 로 컴파일.

### 옵션 B — Node.js N-API addon (FFI)

[examples/nodejs_example.md](examples/nodejs_example.md) 참고.

**우선 옵션 A 채택** — frontend SSE 패턴([stage-runner.ts](../../frontend/src/server/sar/stage-runner.ts) 의 `spawn()` 방식) 과 일관성 유지.

---

## 빌드

### Linux (Docker 컨테이너 안에서)

`libCatisTlm.so` 가 `lib/` 에 있어야 함. Dockerfile 에서 자동 실행:

```bash
bash scripts/build_cli_runner.sh
```

### Windows (로컬 개발)

이미 빌드된 `bin/cli_runner.exe` 가 있음. 재빌드 필요 시 MSVC `cl.exe` 또는 MinGW `g++` 사용:

```powershell
g++ -std=c++17 -O2 -Iinclude -Llib src/cli_runner.cpp -lCatisTlm -lhdf5_cpp -lhdf5 -lpthread -o bin/cli_runner.exe
```

---

## SDPE 백엔드 통합

[frontend/src/server/sar/stage-runner.ts](../../frontend/src/server/sar/stage-runner.ts) 의 `STAGE_CONFIG.L0` 에서 `bin/cli_runner` 를 spawn. stdout 의 `[PROGRESS NN%]` 라인을 SSE 로 클라이언트에 중계. 산출 `.h5` 는 다음 단계(L1A) 의 입력으로 자동 전달.

전체 시연 흐름은 [frontend/docs/csc-demo-integration.md](../../frontend/docs/csc-demo-integration.md) 참고.

---

## 수요일 수령 체크리스트

`libCatisTlm.so` 수령 직후:

1. `lib/libCatisTlm.so` 배치 후 `ldd lib/libCatisTlm.so` 로 의존성 확인 (HDF5 버전 매칭).
2. `cli_runner.cpp` 를 CLI 인자 버전으로 수정 (옵션 A).
3. `scripts/build_cli_runner.sh` 실행 또는 Docker rebuild.
4. `bin/cli_runner --help` 로 동작 확인.
5. 실제 `.cadu` 샘플로 end-to-end 검증.
6. 복호화 키/IV 가 데모용 더미라면 실 데이터용 키로 교체 (단, 키는 .gitignore 로 커밋 회피).
