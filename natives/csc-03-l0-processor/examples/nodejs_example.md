# Node.js 호출 예제

SDPE 백엔드는 **`bin/<tool>` ELF 를 `child_process.spawn` 으로 실행하고 stdout 라인을 SSE 로 중계** 하는 방식을 채택한다 — [frontend/src/server/sar/stage-runner.ts](../../../frontend/src/server/sar/stage-runner.ts) 의 CSC-04 패턴과 동일.

## 현재 가용 ELF 의 CLI

### ⚠️ Forward (CADU → H5) — `pre_processor`

**CLI 인자 안 받는 하드코드 데모.** workspace 경로(`d:/projects/postprocess/CATIS/workspace`)와 aux 파일 위치가 ELF 내부에 박혀 있다. 정해찬 책임에게 CLI 버전 요청 필요. (해당 사용법은 § "통합 미해결 항목" 참고)

### Reverse 통합 — `post_processor`

```bash
post_processor <input.h5> <output_dir> [options]
  --chunk N      HDF5 lines per batch read  (default: 256)
  --buf-size MB  output file buffer in MB   (default: 8)
  --no-dbl-buf   disable reader thread overlap
```

산출: `<output_dir>/<stem>.{src,src_m,cadu}`.

### Reverse 단계별

```bash
hdf5_to_src   <input.h5>     <output.src>      [--chunk N] [--buf-size MB] [--no-double-buffer]
src_to_src_m  <input.src>    <output.src_m>
src_m_to_cadu <input.src_m>  <output.cadu>
```

## spawn 패턴 (SDPE 적용 — 예시)

CLI 인자 있는 reverse tool 기준:

```ts
import { spawn } from 'node:child_process';
import path from 'node:path';

const NATIVES_CSC03_DIR = process.env.SDPE_NATIVES_CSC03_DIR ?? '/app/natives/csc-03';

const proc = spawn(
  path.join(NATIVES_CSC03_DIR, 'bin', 'post_processor'),
  [inputH5, outputDir, '--chunk', '256'],
  { env: process.env },   // LD_LIBRARY_PATH 는 Dockerfile ENV 로 이미 셋업
);

proc.stdout.on('data', (chunk) => {
  for (const line of chunk.toString().split(/\r?\n/)) {
    const m = line.match(/^\[PROGRESS\s+(\d+)%\]\s*(.+)$/);
    if (m) emitSseProgress(Number(m[1]), m[2]);
  }
});

proc.on('close', (code) => {
  if (code === 0) emitSseDone({ outputDir });
  else emitSseError({ code });
});
```

## FFI 직접 호출 (대안 — Forward 우회용)

`pre_processor` 가 CLI 인자 미지원이라 Forward 파이프라인은 **`libCatisTlm.so` 를 FFI 로 직접 로드** 하는 것이 단기 우회책. `koffi` 또는 `ffi-napi` 사용:

```ts
import koffi from 'koffi';

const lib = koffi.load(path.join(NATIVES_CSC03_DIR, 'lib/libCatisTlm.so'));

// CatisPipelineConfig 는 struct — koffi 의 struct 정의가 필요. 헤더 보고 정확히 따라야 함:
// char workspace_path[512]; char decryption_key[49]; char decryption_key2[49];
// char decryption_iv[17];   char decryption_iv2[17];
// char output_file_prefix[256];
// uint8_t lhcp_vcid, rhcp_vcid, enable_dummy_insertion, single_thread_mode;
// uint8_t enable_randomizer, enable_rs_fec, enable_3des;
// char aux_antenna_az_path[512] ... aux_replica_path[512];
// char tm01_dir_name[64]; char tm02_dir_name[64];
// uint32_t src_chunk_size, src_buf_size_mb;
// uint8_t src_no_double_buffer;

const Catis_CreatePipeline    = lib.func('void* Catis_CreatePipeline(void* cfg)');
const Catis_ExtractPayload    = lib.func('int Catis_ExtractPayload(void*)');
const Catis_DecryptPayload    = lib.func('int Catis_DecryptPayload(void*)');
const Catis_ProcessRangeLines = lib.func('int Catis_ProcessRangeLines(void*)');
const Catis_ExportHDF5        = lib.func('int Catis_ExportHDF5(void*, const char*)');
const Catis_GetProgress       = lib.func('int Catis_GetProgress(void*, int*)');
const Catis_DestroyPipeline   = lib.func('void Catis_DestroyPipeline(void*)');
```

다만 SSE 진행률 표시까지 직접 구현해야 함 — child_process spawn 의 stdout 자동 중계가 사라짐. 정해찬 책임 측 CLI 버전 받는 게 더 깔끔.
