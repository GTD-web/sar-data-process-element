# RawDataCollector DLL

Cortex HDR가 FTP 서버에 생성하는 파일(파일명 앞 14자리 `YYYYMMDDhhmmss` 형식)을 로컬/NAS 경로로 수집하는 Windows DLL입니다.
외부 호출자가 주기적으로 `FetchRawData`를 호출하면 DLL이 1회 FTP 수집을 실행하고 JSON 결과를 반환합니다.

---

## 빌드 환경 준비

### 필수: MinGW-w64 (CGO용 C 컴파일러)

```powershell
winget install MSYS2.MSYS2
```

설치 후 **MSYS2 터미널**을 열고 MinGW-w64 GCC를 설치:

```bash
pacman -S mingw-w64-x86_64-gcc
```

이후 시스템 환경변수 `PATH`에 `C:\msys64\mingw64\bin` 추가 후 터미널 재시작.

설치 확인:
```powershell
gcc --version
```

---

## 빌드

### DLL 빌드

```powershell
.\build_dll.ps1
```

생성 파일:
- `RawDataCollector.dll` — DLL 본체
- `RawDataCollector.h` — C 헤더 (Wrapper 작성 시 참고)

### EXE 빌드 (테스트용 데몬 모드)

```powershell
.\build_exe.ps1
# 실행: .\RawDataCollector.exe -config config.json
```

---

## API

### `FetchRawData`

```c
const char* FetchRawData(const char* configPath);
```

| 항목 | 내용 |
|------|------|
| 인자 | `configPath` — `config.json` 파일의 절대 또는 상대 경로 |
| 반환 | JSON 문자열 포인터 (DLL 내부 정적 버퍼, **free 불필요**) |
| 주의 | 반환된 포인터는 다음 `FetchRawData` 호출 전에 복사/파싱해야 함 |
| 스레드 | 내부 뮤텍스로 보호 — 동시 호출 시 순차 처리됨 |

### 반환 JSON 형식

```json
// 성공
{ "ok": true, "downloaded": 3, "errors": [] }

// 일부 파일 실패 (다운로드된 파일은 결과에 반영됨)
{ "ok": false, "downloaded": 1, "errors": ["20240101120000_a.hdr: connection timeout"] }

// 설정/연결 오류
{ "ok": false, "downloaded": 0, "errors": ["loadConfig: ftp_host must be set"] }
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `ok` | bool | 오류가 하나도 없으면 `true` |
| `downloaded` | int | 이번 호출에서 성공적으로 다운로드된 파일 수 |
| `errors` | string[] | 실패한 파일별 오류 메시지 (`"파일명: 원인"` 형식) |

---

## 설정 파일 (`config.json`)

```json
{
  "ftp_host": "192.168.1.100",
  "ftp_port": 21,
  "ftp_user": "user",
  "ftp_pass": "pass",
  "ftp_timeout_sec": 30,
  "remote_watch_dir": "/data/cortex",
  "nas_final_dir": "D:\\NAS\\final",
  "nas_tmp_dir": "D:\\NAS\\tmp",
  "lookback_days": 7,
  "min_age_minutes": 3,
  "max_parallel_downloads": 1,
  "filename_time_layout": "20060102150405",
  "allowed_extensions": [".dat", ".hdr"]
}
```

### 설정 항목 설명

| 항목 | 기본값 | 설명 |
|------|--------|------|
| `ftp_host` | (필수) | FTP 서버 주소 |
| `ftp_port` | `21` | FTP 포트 |
| `ftp_user` | — | FTP 계정 |
| `ftp_pass` | — | FTP 비밀번호 |
| `ftp_timeout_sec` | `30` | FTP 연결/응답 타임아웃 (초) |
| `remote_watch_dir` | `/` | 감시할 FTP 디렉터리 경로 |
| `nas_final_dir` | (필수) | 다운로드 완료 파일이 저장될 최종 경로 |
| `nas_tmp_dir` | (필수) | 다운로드 중 임시 파일(`.part`)이 저장될 경로 |
| `lookback_days` | `7` | 파일명 타임스탬프 기준 최근 N일 범위만 처리 |
| `min_age_minutes` | `3` | 파일 생성 후 최소 N분이 지난 것만 수집 (파일 쓰기 완료 대기) |
| `max_parallel_downloads` | `1` | 동시 다운로드 수 |
| `filename_time_layout` | `20060102150405` | 파일명 앞 타임스탬프의 Go Time Layout 형식 |
| `allowed_extensions` | (전체) | 수집할 확장자 목록. 비워두면 모든 파일 대상 |

> `poll_interval_sec`, `retry_max`는 DLL 모드에서 사용되지 않습니다.
> 호출 주기는 외부 호출자가 제어하고, 다운로드 실패 시 즉시 `errors`에 기록 후 반환합니다.

---

## 언어별 사용 예제

### Python

```python
import ctypes, json

lib = ctypes.CDLL("RawDataCollector.dll")
lib.FetchRawData.argtypes = [ctypes.c_char_p]
lib.FetchRawData.restype  = ctypes.c_char_p   # 자동 복사, free 불필요

result = json.loads(lib.FetchRawData(b"config.json"))
if not result["ok"]:
    print(result["errors"])
```

전체 예제: [`examples/python_example.py`](examples/python_example.py)

### Node.js

```javascript
const ffi = require("ffi-napi");   // npm install ffi-napi

const lib = ffi.Library("RawDataCollector.dll", {
    FetchRawData: ["string", ["string"]]  // 자동 복사, free 불필요
});

const result = JSON.parse(lib.FetchRawData("config.json"));
if (!result.ok) console.error(result.errors);
```

전체 예제: [`examples/nodejs_example.js`](examples/nodejs_example.js)

### C\#

```csharp
[DllImport("RawDataCollector.dll", CallingConvention = CallingConvention.Cdecl)]
static extern IntPtr FetchRawData(string configPath);

var ptr    = FetchRawData("config.json");
var json   = Marshal.PtrToStringAnsi(ptr);   // 자동 복사, free 불필요
var result = JsonSerializer.Deserialize<RawDataResult>(json);
```

전체 예제: [`examples/csharp_example.cs`](examples/csharp_example.cs)

---

## 동작 원리

### 1회 호출 흐름

```
FtpCopierExecute(configPath)
  ├─ config.json 로드 및 검증
  ├─ nas_final_dir / nas_tmp_dir 디렉터리 생성 (없으면)
  ├─ 이전 호출 비정상 종료 잔여 .part 파일 정리
  ├─ received.json 로드 (없으면 nas_final_dir에서 부트스트랩)
  ├─ FTP 접속 → 파일 목록 조회
  ├─ 필터링: 확장자, 타임스탬프 범위, min_age, 미수신 파일
  ├─ 병렬 다운로드 (nas_tmp_dir/*.part → nas_final_dir/*)
  ├─ 성공한 파일마다 received.json 즉시 업데이트
  └─ JSON 결과 반환 {"ok", "downloaded", "errors"}
```

### 수신 이력 (`received.json`)

- 위치: `nas_final_dir/received.json`
- 역할: 이미 다운로드된 파일을 기록하여 중복 수신 방지
- FTP 서버에서 삭제된 파일은 자동으로 이력에서도 제거됨 (Pruning)

**전체 재수집**: `received.json` 삭제 후 다시 호출  
**특정 파일 재수집**: `received.json`의 `done` 항목에서 해당 파일명 항목 제거

### 다운로드 안전 보장

- `nas_tmp_dir`에 `.part` 임시 파일로 다운로드 후 원자적 이동(Rename)
- 원격 파일 크기가 0이면 수집 대상에서 제외 (파일 쓰기 완료 대기)
- 최종 경로에 이미 파일이 존재하면 덮어쓰기 생략 (기존 파일 우선)
- 호출 시작 시 잔여 `.part` 파일 자동 정리

---

## 향후 C++ 전환 안내

현재 DLL은 Go로 구현되어 있어 크기가 약 15 MB입니다 (Go 런타임 포함).
C++로 재작성 시 ~100 KB 수준으로 축소 가능합니다.

**API 시그니처(`const char* FtpCopierExecute(const char*)`)는 동일하게 유지**되므로
Wrapper 및 호출자 코드 변경 없이 DLL 파일만 교체하면 됩니다.
