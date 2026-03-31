# RawDataCollector.exe 빌드 스크립트 (데몬 모드)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "[BUILD] RawDataCollector.exe ..."

$env:CGO_ENABLED = "0"
$env:GOOS        = "windows"
$env:GOARCH      = "amd64"

# 빌드 태그 없음: cmd_main.go 포함, dll_exports.go 제외
go build -o RawDataCollector.exe .

if ($LASTEXITCODE -ne 0) {
    Write-Error "[FAIL] 빌드 실패"
    exit 1
}

Write-Host "[OK] RawDataCollector.exe 생성 완료"
Write-Host "     실행: .\RawDataCollector.exe -config config.json"
