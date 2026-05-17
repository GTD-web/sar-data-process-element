# Node.js 호출 예제 (참고)

SDPE 백엔드는 **`bin/cli_runner` ELF 를 `child_process.spawn` 으로 실행하고 stdout 라인을 SSE 로 중계** 하는 방식을 채택한다 — [frontend/src/server/sar/stage-runner.ts](../../../frontend/src/server/sar/stage-runner.ts) 의 CSC-04 패턴과 동일.

## spawn 패턴 (실제 SDPE 적용 방식)

```ts
import { spawn } from 'node:child_process';
import path from 'node:path';

const NATIVES_CSC03_DIR = process.env.SDPE_NATIVES_CSC03_DIR ?? '/app/natives/csc-03';

const proc = spawn(
  path.join(NATIVES_CSC03_DIR, 'bin', 'cli_runner'),
  [
    '--cadu',      caduUploadPath,
    '--workspace', path.join(runDir, 'csc03-workspace'),
    '--output',    path.join(runDir, 'L0.h5'),
    '--aux-dir',   path.join(NATIVES_CSC03_DIR, 'aux'),
  ],
  { env: process.env },
);

proc.stdout.on('data', (chunk) => {
  for (const line of chunk.toString().split(/\r?\n/)) {
    const m = line.match(/^\[PROGRESS\s+(\d+)%\]\s*(.+)$/);
    if (m) emitSseProgress(Number(m[1]), m[2]);
  }
});

proc.on('close', (code) => {
  if (code === 0) emitSseDone({ h5: outputH5Path });
  else emitSseError({ code });
});
```

## FFI 직접 호출 패턴 (대안 — 현재 미채택)

`ffi-napi` 로 `libCatisTlm.so` 를 직접 로드하는 것도 가능하지만, SDPE 의 SSE 라우트 통일성을 위해 spawn 방식을 우선한다. FFI 가 필요해지면 다음과 같이:

```js
const ffi = require('ffi-napi');
const lib = ffi.Library('libCatisTlm.so', {
  Catis_CreatePipeline:      ['pointer', ['pointer']],
  Catis_ExtractPayload:      ['int',     ['pointer']],
  Catis_DecryptPayload:      ['int',     ['pointer']],
  Catis_ProcessRangeLines:   ['int',     ['pointer']],
  Catis_ExportHDF5:          ['int',     ['pointer', 'string']],
  Catis_GetProgress:         ['int',     ['pointer', 'pointer']],
  Catis_DestroyPipeline:     ['void',    ['pointer']],
});
```
