#!/usr/bin/env bash
# Linux 빌드 — Docker 빌드 단계에서 호출. libCatisTlm.so 가 lib/ 에 있어야 한다.
# rpath 를 ELF 옆 lib/ 로 잡아서 LD_LIBRARY_PATH 없어도 동적 링킹 가능.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f lib/libCatisTlm.so ]]; then
  echo "[build_cli_runner] WARN: lib/libCatisTlm.so 가 아직 없습니다 (수요일 수령 예정)."
  echo "[build_cli_runner] cli_runner ELF 빌드를 건너뜁니다. SDPE 컨테이너는 정상 기동되지만 L0 노드 실행은 불가."
  exit 0
fi

mkdir -p bin
g++ -std=c++17 -O2 \
    -Iinclude \
    src/cli_runner.cpp \
    -Llib -lCatisTlm -lhdf5_cpp -lhdf5 -pthread \
    -Wl,-rpath,'$ORIGIN/../lib' \
    -o bin/cli_runner
chmod +x bin/cli_runner
echo "[build_cli_runner] OK: bin/cli_runner"
