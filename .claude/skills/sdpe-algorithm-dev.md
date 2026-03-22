---
name: sdpe-algorithm-dev
description: "SDPE 알고리즘 개발자용 코딩 스킬. SAR 신호처리 알고리즘을 Python / C / C++ 로 구현할 때 사용한다. 트리거: 알고리즘 함수 구현, Range Compression 작성, Azimuth Compression 작성, SLC 생성, GRD 생성, 객체 탐지, 변화 탐지, C++ 포팅, pybind11 바인딩, pytest 단위 테스트, Algorithm Layer 구현. 서버 연동(Nest.js, Repository, Controller 등)은 sdpe-server-dev 스킬을 사용한다."
---

# SDPE 알고리즘 개발자 코딩 스킬

## 1. Algorithm Layer 핵심 원칙

알고리즘 개발자는 **순수 연산 함수**만 작성한다. 아래 3가지를 절대 포함하지 않는다.

```
❌ 파일 I/O (open, read, write)
❌ DB 연결 (psycopg2, SQLAlchemy 등)
❌ 큐 접근 (pgmq, redis 등)
```

함수 시그니처는 서버 개발자가 미리 정의한다.
알고리즘 개발자는 **그 시그니처에 맞춰 내부 구현만** 채운다.

```
입력: NumPy 배열 또는 dataclass
출력: NumPy 배열 또는 dataclass
부수 효과(Side Effect): 없음
```

---

## 2. 디렉토리 구조

```
algorithms/
├── csc02_level0/
│   ├── __init__.py
│   ├── baq_decompression.py
│   ├── calibration.py
│   └── tests/
│       └── test_baq_decompression.py
├── csc03_level1/
│   ├── __init__.py
│   ├── range_compression.py
│   ├── azimuth_compression_rda.py
│   ├── azimuth_compression_bpa.py
│   └── tests/
│       └── test_range_compression.py
├── csc04_level2/
│   ├── object_detection.py
│   └── change_detection.py
├── csc05_level3/
│   └── flood_detection.py
├── run.py                  ← 서버(subprocess)가 호출하는 진입점
└── pyproject.toml
```

C/C++ 포팅 시:
```
algorithms/
├── csc03_level1/
│   ├── cpp/
│   │   ├── range_compression.cc
│   │   ├── range_compression.h
│   │   ├── range_compression_binding.cc   ← pybind11
│   │   ├── range_compression_test.cc      ← gtest
│   │   └── CMakeLists.txt
```

---

## 3. Python 구현 패턴

### 3.1 기본 함수 구조

```python
# csc03_level1/range_compression.py
"""
Range Compression (거리 방향 압축) 알고리즘.

참조: Cumming, I. G., & Wong, F. H. (2005). Digital Processing of
      Synthetic Aperture Radar Data. Artech House.
"""
from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
from dataclasses import dataclass


@dataclass
class RangeCompressionInput:
    """Range Compression 입력 데이터."""
    raw_signal: NDArray[np.complex64]    # shape: (n_azimuth, n_range)
    chirp_rate: float                    # Hz/s, 처프 레이트
    sampling_rate: float                 # Hz, 샘플링 주파수
    center_frequency: float              # Hz, 중심 주파수


@dataclass
class RangeCompressionOutput:
    """Range Compression 출력 데이터."""
    compressed_signal: NDArray[np.complex64]  # shape: (n_azimuth, n_range)
    range_resolution: float                    # m, 거리 방향 해상도


class AlgorithmError(Exception):
    """알고리즘 처리 불가 입력에 대한 예외."""


def compress_range(inp: RangeCompressionInput) -> RangeCompressionOutput:
    """
    Matched filter 기반 Range 방향 압축 수행.

    Args:
        inp: 원시 신호 및 레이더 파라미터

    Returns:
        압축된 복소 신호 및 해상도 정보

    Raises:
        AlgorithmError: 입력 신호가 비어 있거나 형태가 잘못된 경우
    """
    if inp.raw_signal.ndim != 2:
        raise AlgorithmError(
            f"raw_signal must be 2D, got shape {inp.raw_signal.shape}"
        )
    if inp.raw_signal.size == 0:
        raise AlgorithmError("raw_signal must not be empty")

    n_azimuth, n_range = inp.raw_signal.shape

    # Range 방향 FFT
    signal_freq = np.fft.fft(inp.raw_signal, axis=1)

    # Matched filter 생성
    freq_axis = np.fft.fftfreq(n_range, d=1.0 / inp.sampling_rate)
    matched_filter = np.exp(
        1j * np.pi * freq_axis**2 / inp.chirp_rate
    )

    # 주파수 영역 곱셈 후 역 FFT
    compressed = np.fft.ifft(signal_freq * matched_filter[np.newaxis, :], axis=1)

    range_resolution = 3e8 / (2 * abs(inp.chirp_rate) / inp.sampling_rate * n_range)

    return RangeCompressionOutput(
        compressed_signal=compressed.astype(np.complex64),
        range_resolution=range_resolution,
    )
```

### 3.2 타입 힌트 규칙

```python
# ✅ 올바른 타입 힌트
from numpy.typing import NDArray
import numpy as np

def apply_baq(
    raw_bytes: NDArray[np.uint8],
    block_size: int,
    scale_factors: NDArray[np.float32],
) -> NDArray[np.complex64]:
    ...

# ❌ 잘못된 타입 힌트 — any나 미지정 사용 금지
def apply_baq(raw_bytes, block_size, scale_factors):
    ...
```

### 3.3 상수 정의

```python
# constants.py — 모듈 최상단에 정의
SPEED_OF_LIGHT_MPS: float = 299_792_458.0   # m/s
MAX_RANGE_BINS: int = 16_384
DEFAULT_PRF_HZ: float = 1_500.0             # Pulse Repetition Frequency

# ❌ 매직 넘버 사용 금지
range_resolution = 299792458.0 / (2 * bandwidth)  # 나쁨

# ✅ 상수 사용
range_resolution = SPEED_OF_LIGHT_MPS / (2 * bandwidth)  # 좋음
```

---

## 4. pytest 단위 테스트 패턴

```python
# csc03_level1/tests/test_range_compression.py
import numpy as np
import pytest
from ..range_compression import (
    RangeCompressionInput,
    compress_range,
    AlgorithmError,
)


# ── 정상 케이스 ──────────────────────────────────────────────────
class TestCompressRange:
    def test_output_shape_matches_input(self):
        """출력 형태가 입력과 동일해야 한다."""
        inp = RangeCompressionInput(
            raw_signal=np.random.randn(128, 512).astype(np.complex64),
            chirp_rate=1e12,
            sampling_rate=100e6,
            center_frequency=9.6e9,
        )
        out = compress_range(inp)
        assert out.compressed_signal.shape == inp.raw_signal.shape

    def test_output_dtype_is_complex64(self):
        """출력 dtype은 항상 complex64여야 한다."""
        inp = RangeCompressionInput(
            raw_signal=np.ones((64, 256), dtype=np.complex64),
            chirp_rate=1e12,
            sampling_rate=100e6,
            center_frequency=9.6e9,
        )
        out = compress_range(inp)
        assert out.compressed_signal.dtype == np.complex64

    def test_point_target_response(self):
        """점 목표물(Point Target) 응답이 예상 위치에 집속되어야 한다."""
        n_range = 512
        chirp_rate = 1e12
        sampling_rate = 100e6

        # 단일 점 목표물 신호 생성
        t = np.arange(n_range) / sampling_rate
        chirp = np.exp(1j * np.pi * chirp_rate * t**2)
        raw = np.tile(chirp, (1, 1))

        inp = RangeCompressionInput(
            raw_signal=raw.astype(np.complex64),
            chirp_rate=chirp_rate,
            sampling_rate=sampling_rate,
            center_frequency=9.6e9,
        )
        out = compress_range(inp)
        peak_idx = np.argmax(np.abs(out.compressed_signal[0]))
        # 점 목표물은 0번 샘플 근처에 집속
        assert peak_idx < 10


# ── 예외 케이스 ──────────────────────────────────────────────────
class TestCompressRangeErrors:
    def test_raises_on_1d_input(self):
        with pytest.raises(AlgorithmError, match="must be 2D"):
            compress_range(RangeCompressionInput(
                raw_signal=np.zeros(100, dtype=np.complex64),
                chirp_rate=1e12, sampling_rate=100e6, center_frequency=9.6e9,
            ))

    def test_raises_on_empty_input(self):
        with pytest.raises(AlgorithmError, match="must not be empty"):
            compress_range(RangeCompressionInput(
                raw_signal=np.zeros((0, 0), dtype=np.complex64),
                chirp_rate=1e12, sampling_rate=100e6, center_frequency=9.6e9,
            ))
```

---

## 5. C++ 포팅 패턴

Python으로 먼저 검증 후, 성능이 필요한 경우에만 C++로 포팅한다.

### 5.1 C++ 헤더

```cpp
// csc03_level1/cpp/range_compression.h
#pragma once
#include <complex>
#include <span>
#include <stdexcept>

namespace sdpe::algorithm::csc03 {

struct RangeCompressionParams {
  double chirp_rate_hz_per_s;
  double sampling_rate_hz;
  double center_frequency_hz;
};

class AlgorithmException : public std::runtime_error {
 public:
  explicit AlgorithmException(const std::string& msg)
      : std::runtime_error(msg) {}
};

/**
 * Range 방향 Matched Filter 압축.
 *
 * @param raw_signal  입력 복소 신호 [n_azimuth × n_range], row-major
 * @param n_azimuth   방위 방향 샘플 수
 * @param n_range     거리 방향 샘플 수
 * @param params      레이더 파라미터
 * @param out_signal  출력 버퍼 (호출자가 할당, raw_signal과 동일 크기)
 *
 * @throws AlgorithmException 입력이 잘못된 경우
 */
void CompressRange(
    std::span<const std::complex<float>> raw_signal,
    int n_azimuth,
    int n_range,
    const RangeCompressionParams& params,
    std::span<std::complex<float>> out_signal);

}  // namespace sdpe::algorithm::csc03
```

### 5.2 pybind11 바인딩

```cpp
// csc03_level1/cpp/range_compression_binding.cc
#include <pybind11/pybind11.h>
#include <pybind11/numpy.h>
#include "range_compression.h"

namespace py = pybind11;
using namespace sdpe::algorithm::csc03;

PYBIND11_MODULE(range_compression_cpp, m) {
  m.doc() = "Range Compression C++ 구현 — pybind11 바인딩";

  py::class_<RangeCompressionParams>(m, "RangeCompressionParams")
      .def(py::init<>())
      .def_readwrite("chirp_rate_hz_per_s", &RangeCompressionParams::chirp_rate_hz_per_s)
      .def_readwrite("sampling_rate_hz", &RangeCompressionParams::sampling_rate_hz)
      .def_readwrite("center_frequency_hz", &RangeCompressionParams::center_frequency_hz);

  m.def("compress_range",
    [](py::array_t<std::complex<float>> raw, int n_az, int n_rg,
       const RangeCompressionParams& params) {
      auto out = py::array_t<std::complex<float>>({n_az, n_rg});
      CompressRange(
          {raw.data(), static_cast<size_t>(n_az * n_rg)},
          n_az, n_rg, params,
          {out.mutable_data(), static_cast<size_t>(n_az * n_rg)});
      return out;
    },
    "raw"_a, "n_azimuth"_a, "n_range"_a, "params"_a
  );
}
```

### 5.3 Google Test

```cpp
// csc03_level1/cpp/range_compression_test.cc
#include <gtest/gtest.h>
#include <complex>
#include <vector>
#include "range_compression.h"

using namespace sdpe::algorithm::csc03;

TEST(RangeCompressionTest, OutputSizeMatchesInput) {
  constexpr int kNAz = 128, kNRg = 512;
  std::vector<std::complex<float>> raw(kNAz * kNRg, {1.0f, 0.0f});
  std::vector<std::complex<float>> out(kNAz * kNRg);

  RangeCompressionParams params{1e12, 100e6, 9.6e9};
  EXPECT_NO_THROW(CompressRange(raw, kNAz, kNRg, params, out));
  EXPECT_EQ(out.size(), raw.size());
}

TEST(RangeCompressionTest, ThrowsOnEmptyInput) {
  RangeCompressionParams params{1e12, 100e6, 9.6e9};
  EXPECT_THROW(
    CompressRange({}, 0, 0, params, {}),
    AlgorithmException
  );
}
```

---

## 6. run.py — subprocess 진입점

서버(Nest.js Use Case)가 `python3 algorithms/run.py` 로 호출하는 진입점.

```python
# algorithms/run.py
"""
서버 subprocess 호출 진입점.
표준 입력(stdin) JSON → 알고리즘 실행 → 표준 출력(stdout) JSON
"""
import sys
import json
import argparse
import numpy as np

from csc03_level1.range_compression import (
    RangeCompressionInput, compress_range
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--level", required=True)
    args = parser.parse_args()

    # 입력 파일 로드 (파일 I/O는 진입점에서만 허용)
    data = np.load(args.input)

    if args.level == "LEVEL_1":
        inp = RangeCompressionInput(
            raw_signal=data["raw_signal"],
            chirp_rate=float(data["chirp_rate"]),
            sampling_rate=float(data["sampling_rate"]),
            center_frequency=float(data["center_frequency"]),
        )
        result = compress_range(inp)
        output = {
            "compressed_signal_shape": list(result.compressed_signal.shape),
            "range_resolution": result.range_resolution,
        }
        print(json.dumps(output))
    else:
        print(json.dumps({"error": f"Unknown level: {args.level}"}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
```

---

## 7. pyproject.toml (린트 설정)

```toml
[tool.ruff]
line-length = 120
target-version = "py311"
select = ["E", "F", "W", "C90", "I", "S", "N"]
ignore = ["S101"]  # assert 허용 (테스트 코드)

[tool.mypy]
strict = true
plugins = ["numpy.typing.mypy_plugin"]
disallow_untyped_defs = true
warn_return_any = true
```

---

## 8. 네이밍 빠른 참조

| 대상 | 규칙 | 예시 |
|---|---|---|
| 모듈/패키지 | snake_case | `range_compression`, `csc03_level1` |
| 클래스 | PascalCase | `RangeCompressionInput`, `AlgorithmError` |
| 함수/메서드 | snake_case (동사+명사) | `compress_range()`, `apply_baq()` |
| 변수/파라미터 | snake_case | `raw_signal`, `chirp_rate` |
| 상수 | UPPER_SNAKE_CASE | `SPEED_OF_LIGHT_MPS`, `MAX_RANGE_BINS` |
| C++ 함수 | PascalCase | `CompressRange()`, `ApplyBaq()` |
| C++ 멤버 변수 | snake_case + _ | `buffer_size_`, `prf_hz_` |
| C++ 상수 | kPascalCase | `kMaxRangeBins`, `kDefaultPrfHz` |
| C++ 네임스페이스 | snake_case | `sdpe::algorithm::csc03` |

---

## 9. 체크리스트 — 알고리즘 함수 작성 시

- [ ] 함수 내부에 파일 I/O, DB, 큐 코드가 없는가
- [ ] 입력 타입이 `NDArray[np.dtype]` 또는 `dataclass`인가
- [ ] 출력 타입이 명시되어 있는가 (반환 타입 힌트)
- [ ] 잘못된 입력에 대해 `AlgorithmError`를 발생시키는가
- [ ] Docstring에 참조 논문 또는 표준이 기재되어 있는가
- [ ] 전역 변수나 클래스 멤버 변경(Side Effect)이 없는가
- [ ] pytest 단위 테스트가 함께 작성되어 있는가 (정상 케이스 + 예외 케이스)
- [ ] mypy 타입 검사를 통과하는가 (`mypy algorithms/ --strict`)
- [ ] Git 브랜치가 `algorithm/csc[번호]-[알고리즘명]` 형식인가
