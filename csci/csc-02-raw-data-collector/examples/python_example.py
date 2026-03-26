"""
RawDataCollector DLL - Python 호출 예제
요구사항: pip install (ctypes는 표준 라이브러리)
"""

import ctypes
import json
import os
import sys


def load_dll(dll_path: str) -> ctypes.CDLL:
    lib = ctypes.CDLL(dll_path)
    # 반환 타입을 c_char_p로 지정하면 Python bytes로 자동 복사됨 (free 불필요)
    lib.FetchRawData.argtypes = [ctypes.c_char_p]
    lib.FetchRawData.restype = ctypes.c_char_p
    return lib


def fetch(dll_path: str, config_path: str) -> dict:
    lib = load_dll(dll_path)
    raw = lib.FetchRawData(config_path.encode("utf-8"))
    # raw는 이미 Python bytes로 복사된 상태 — DLL 버퍼와 무관
    return json.loads(raw.decode("utf-8"))


if __name__ == "__main__":
    dll_path = os.path.join(os.path.dirname(__file__), "..", "RawDataCollector.dll")
    config_path = os.path.join(os.path.dirname(__file__), "..", "config.json")

    result = fetch(dll_path, config_path)

    if result["ok"]:
        print(f"[OK] downloaded={result['downloaded']}")
    else:
        print(f"[FAIL] downloaded={result['downloaded']}")
        for err in result["errors"]:
            print(f"  - {err}")
        sys.exit(1)
