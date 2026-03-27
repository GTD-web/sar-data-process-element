# RawDataCollector.dll 빌드 스크립트
# 요구사항: MinGW-w64 gcc가 PATH에 있어야 함
#   winget install MSYS2.MSYS2
#   이후 C:\msys64\mingw64\bin 을 시스템 PATH에 추가

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "[BUILD] RawDataCollector.dll ..."

# CGO 활성화 (Windows DLL 생성에 필수)
$env:CGO_ENABLED = "1"
$env:GOOS        = "windows"
$env:GOARCH      = "amd64"

# -tags dll: dll_exports.go 포함, cmd_main.go 제외
# -buildmode=c-shared: DLL + 헤더(.h) 동시 생성
go build -tags dll -buildmode=c-shared -o RawDataCollector.dll .

if ($LASTEXITCODE -ne 0) {
    Write-Error "[FAIL] 빌드 실패"
    exit 1
}

Write-Host "[OK] 생성된 파일:"
Write-Host "     RawDataCollector.dll  - DLL 본체"
Write-Host "     RawDataCollector.h    - C 헤더 (Wrapper 작성 시 참고)"
