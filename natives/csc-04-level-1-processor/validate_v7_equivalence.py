"""Compare V4 (baseline) and V7 (Numba-accelerated) `_process_block` outputs.

V7 swaps two numerical kernels (RCMC and accumulate) to `@njit` versions.
Floating-point ordering inside `prange` loops means exact equality is not
expected — instead the report decides pass/fail using relative thresholds
(max_abs_diff, peak_ratio, NCC) configurable on the CLI.

Output: optional JSON + Markdown report mirroring `subset-validation-report.md`.
"""

import argparse
import json
import math
import random
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from raw import sar_rda_processorV4 as v4
from raw import sar_rda_processorV7_numba as v7
from validate_subset_equivalence import (
    _build_base_args,
    _build_manual_block,
    _build_recommended_subsets,
)


def _peak_ratio(a: np.ndarray, b: np.ndarray) -> float:
    pa = float(np.max(np.abs(a)))
    pb = float(np.max(np.abs(b)))
    return pa / pb if pb > 0 else float("inf")


def _ncc(a: np.ndarray, b: np.ndarray) -> float:
    aa = np.abs(a).ravel().astype(np.float64)
    bb = np.abs(b).ravel().astype(np.float64)
    aa -= aa.mean()
    bb -= bb.mean()
    denom = np.linalg.norm(aa) * np.linalg.norm(bb)
    return float(np.dot(aa, bb) / denom) if denom > 0 else 0.0


def main() -> int:
    ap = argparse.ArgumentParser(description="Compare CSC-04 V4 and V7 (Numba) subset outputs.")
    ap.add_argument("--h5-path", required=True, help="Input HDF5 file path")
    ap.add_argument("--az0", type=int, help="Inclusive azimuth start index")
    ap.add_argument("--az1", type=int, help="Exclusive azimuth end index")
    ap.add_argument("--window", type=int, default=200, help="Single-mode window width")
    ap.add_argument("--cases", type=int, default=1, help="Single-mode case count")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--windows", default="128,200,512", help="Comma-separated window widths")
    ap.add_argument("--fixed-count", type=int, default=10)
    ap.add_argument("--random-count", type=int, default=20)
    ap.add_argument("--strategy", choices=["single", "recommended"], default="recommended")
    ap.add_argument("--sample-count", type=int, default=10)
    ap.add_argument("--json-out", help="JSON report path")
    ap.add_argument("--md-out", help="Markdown report path")
    ap.add_argument("--decimate-range", type=int, default=1)
    ap.add_argument("--rng-chunk", type=int, default=64)
    ap.add_argument("--az-batch", type=int, default=16)
    ap.add_argument("--valid-lines", type=int, default=96)
    ap.add_argument("--na-block", type=int, default=192)
    ap.add_argument("--na-overlap", type=int, default=96)
    ap.add_argument("--abs-tol", type=float, default=5e-3,
                    help="max_abs_diff / peak(V4) must be below this (default 5e-3, "
                         "loosened from 1e-3 to account for Numba prange reduction order)")
    ap.add_argument("--peak-ratio-tol", type=float, default=5e-3,
                    help="|peak_ratio - 1| must be below this (default 5e-3)")
    ap.add_argument("--ncc-min", type=float, default=0.99,
                    help="NCC(amplitude) must be at least this (default 0.99)")
    ap.add_argument("--fdc-abs-tol", type=float, default=1e-6,
                    help="|fdc(V4) - fdc(V7)| must be below this (default 1e-6)")
    args = ap.parse_args()

    h5_path = str(Path(args.h5_path).resolve())
    settings = dict(
        decimate_range=args.decimate_range,
        valid_lines=args.valid_lines,
        na_block_override=args.na_block,
        na_overlap_override=args.na_overlap,
    )

    started_at = datetime.now(timezone.utc)
    total_started = time.perf_counter()

    print(f"[v7-compare] h5_path={h5_path}")

    meta_v4 = v4.load_metadata(h5_path, **settings)
    meta_v7 = v7.load_metadata(h5_path, **settings)

    scalar_checks = [
        "prf", "fc", "fs", "na_total", "nr", "nr_dec",
        "r_near", "dr_dec", "wavelength", "na_block",
        "na_overlap", "na_valid",
    ]
    for name in scalar_checks:
        a = getattr(meta_v4, name)
        b = getattr(meta_v7, name)
        if isinstance(a, float):
            if not math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9):
                print(f"[v7-compare] metadata mismatch: {name}: {a} != {b}")
                return 1
        elif a != b:
            print(f"[v7-compare] metadata mismatch: {name}: {a} != {b}")
            return 1

    base = _build_base_args(meta_v4, args.rng_chunk, args.az_batch)

    windows = [int(part.strip()) for part in args.windows.split(",") if part.strip()]

    if args.az0 is not None or args.az1 is not None:
        if args.az0 is None or args.az1 is None:
            raise ValueError("Both --az0 and --az1 must be provided together")
        window_jobs = [{
            "window": args.az1 - args.az0,
            "subsets": [(args.az0, args.az1)],
            "label": f"manual:{args.az0}:{args.az1}",
        }]
    else:
        window_jobs = []
        if args.strategy == "recommended":
            for index, window in enumerate(windows, start=1):
                if window <= 0:
                    raise ValueError("--windows values must be > 0")
                subsets = _build_recommended_subsets(
                    meta_v4.na_total, window,
                    args.fixed_count, args.random_count,
                    args.seed + index,
                )
                window_jobs.append({"window": window, "subsets": subsets,
                                    "label": f"recommended:{window}"})
        else:
            if args.window <= 0:
                raise ValueError("--window must be > 0")
            if args.window > meta_v4.na_total:
                raise ValueError("--window exceeds na_total")
            max_start = meta_v4.na_total - args.window
            rng = random.Random(args.seed)
            if args.cases == 1:
                subsets = [(3000, min(3000 + args.window, meta_v4.na_total))] if max_start >= 3000 else [(0, args.window)]
            else:
                starts = sorted(rng.sample(range(max_start + 1), k=min(args.cases, max_start + 1)))
                subsets = [(start, start + args.window) for start in starts]
            window_jobs.append({"window": args.window, "subsets": subsets,
                                "label": f"single:{args.window}"})

    total_cases = sum(len(job["subsets"]) for job in window_jobs)
    print(f"[v7-compare] total_cases={total_cases}")

    report: dict = {
        "h5_path": h5_path,
        "started_at_utc": started_at.isoformat(),
        "strategy": args.strategy,
        "settings": settings,
        "rng_chunk": args.rng_chunk,
        "az_batch": args.az_batch,
        "window": args.window,
        "windows": windows,
        "fixed_count": args.fixed_count,
        "random_count": args.random_count,
        "cases": total_cases,
        "sample_count": args.sample_count,
        "tolerances": {
            "abs_tol": args.abs_tol,
            "peak_ratio_tol": args.peak_ratio_tol,
            "ncc_min": args.ncc_min,
            "fdc_abs_tol": args.fdc_abs_tol,
        },
        "all_cases_pass": True,
        "results": [],
    }

    case_index = 0
    for job in window_jobs:
        print(f"[v7-compare] window={job['window']} subsets={len(job['subsets'])} label={job['label']}")
        for az0, az1 in job["subsets"]:
            case_index += 1
            case_started = time.perf_counter()
            print(f"[v7-compare] case {case_index}: subset=({az0}, {az1}) width={az1 - az0}")
            block = _build_manual_block(meta_v4, az0, az1)

            print("[v7-compare] running V4 _process_block...")
            result_v4 = v4._process_block({**base, **block})
            print("[v7-compare] running V7 _process_block...")
            result_v7 = v7._process_block({**base, **block, "n_threads": 0})

            head_equal = (result_v4[0] == result_v7[0]) and (result_v4[1] == result_v7[1])
            fdc_diff = abs(result_v4[3] - result_v7[3])
            fdc_pass = fdc_diff <= args.fdc_abs_tol

            if result_v4[2].shape != result_v7[2].shape:
                shape_pass = False
                max_abs_diff = float("inf")
                rel_max_abs_diff = float("inf")
                peak_ratio = float("inf")
                ncc = 0.0
            else:
                shape_pass = True
                diff = result_v4[2] - result_v7[2]
                max_abs_diff = float(np.max(np.abs(diff)))
                peak_v4 = float(np.max(np.abs(result_v4[2])))
                rel_max_abs_diff = max_abs_diff / peak_v4 if peak_v4 > 0 else float("inf")
                peak_ratio = _peak_ratio(result_v4[2], result_v7[2])
                ncc = _ncc(result_v4[2], result_v7[2])

            tol_pass = (
                shape_pass
                and head_equal
                and fdc_pass
                and rel_max_abs_diff <= args.abs_tol
                and abs(peak_ratio - 1.0) <= args.peak_ratio_tol
                and ncc >= args.ncc_min
            )

            print(f"[v7-compare] block head equal={head_equal}")
            print(f"[v7-compare] fdc v4={result_v4[3]} v7={result_v7[3]} diff={fdc_diff:.3e} pass={fdc_pass}")
            print(f"[v7-compare] shape v4={result_v4[2].shape} v7={result_v7[2].shape}")
            print(f"[v7-compare] max_abs_diff={max_abs_diff:.6g} (rel={rel_max_abs_diff:.3e})")
            print(f"[v7-compare] peak_ratio(V4/V7)={peak_ratio:.6f}")
            print(f"[v7-compare] NCC(amplitude)={ncc:.6f}")
            print(f"[v7-compare] case pass={tol_pass}")

            samples_to_show = min(args.sample_count, result_v4[2].size) if shape_pass else 0
            sample_rows = []
            if samples_to_show > 0:
                flat_v4 = result_v4[2].ravel()
                flat_v7 = result_v7[2].ravel()
                sample_indices = np.linspace(0, flat_v4.size - 1, num=samples_to_show, dtype=int)
                for sample_no, flat_idx in enumerate(sample_indices, start=1):
                    row, col = divmod(int(flat_idx), result_v4[2].shape[1])
                    sample_rows.append({
                        "sample_no": sample_no,
                        "row": row,
                        "col": col,
                        "v4": {
                            "real": float(np.real(flat_v4[flat_idx])),
                            "imag": float(np.imag(flat_v4[flat_idx])),
                        },
                        "v7": {
                            "real": float(np.real(flat_v7[flat_idx])),
                            "imag": float(np.imag(flat_v7[flat_idx])),
                        },
                    })

            case_result = {
                "case_index": case_index,
                "window": job["window"],
                "label": job["label"],
                "az0": az0,
                "az1": az1,
                "width": az1 - az0,
                "block_tuple_head_equal": head_equal,
                "fdc_v4": float(result_v4[3]),
                "fdc_v7": float(result_v7[3]),
                "fdc_abs_diff": fdc_diff,
                "fdc_pass": fdc_pass,
                "focused_shape_v4": list(result_v4[2].shape),
                "focused_shape_v7": list(result_v7[2].shape),
                "shape_pass": shape_pass,
                "max_abs_diff": max_abs_diff,
                "rel_max_abs_diff": rel_max_abs_diff,
                "peak_ratio": peak_ratio,
                "ncc_amplitude": ncc,
                "pass": tol_pass,
                "elapsed_seconds": round(time.perf_counter() - case_started, 6),
                "samples": sample_rows,
            }
            report["results"].append(case_result)
            if not tol_pass:
                report["all_cases_pass"] = False

    report["completed_at_utc"] = datetime.now(timezone.utc).isoformat()
    report["total_elapsed_seconds"] = round(time.perf_counter() - total_started, 6)

    if args.json_out:
        json_path = Path(args.json_out)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"[v7-compare] JSON report saved to: {json_path}")
    if args.md_out:
        md_path = Path(args.md_out)
        md_path.parent.mkdir(parents=True, exist_ok=True)
        md_path.write_text(_render_markdown_report(report), encoding="utf-8")
        print(f"[v7-compare] Markdown report saved to: {md_path}")

    if report["all_cases_pass"]:
        print("[v7-compare] OK: all subset cases within tolerances")
        return 0
    print("[v7-compare] FAIL: at least one case outside tolerances — see report")
    return 1


def _render_markdown_report(report: dict) -> str:
    lines: list[str] = []
    lines.append("# CSC-04 V4↔V7 Numba 회귀 검증 리포트")
    lines.append("")
    lines.append("## 검증 대상")
    lines.append("")
    lines.append(f"- 입력 HDF5: `{report['h5_path']}`")
    lines.append("- 기준선 (V4): `raw/sar_rda_processorV4.py`")
    lines.append("- 검증 대상 (V7): `raw/sar_rda_processorV7_numba.py`")
    lines.append("- 비교 방식: 같은 `[az0, az1)` 윈도에서 두 처리기의 `_process_block` 출력을 직접 비교")
    lines.append("- 합격 기준 (모두 만족):")
    t = report["tolerances"]
    lines.append(f"  - shape 동일, FDC 차이 ≤ `{t['fdc_abs_tol']}`")
    lines.append(f"  - `max_abs_diff / peak(V4)` ≤ `{t['abs_tol']}`")
    lines.append(f"  - `|peak_ratio - 1|` ≤ `{t['peak_ratio_tol']}`")
    lines.append(f"  - 진폭 NCC ≥ `{t['ncc_min']}`")
    lines.append("")
    lines.append("## 요약")
    lines.append("")
    lines.append(f"- 검증 시작(UTC): `{report.get('started_at_utc', '')}`")
    lines.append(f"- 검증 완료(UTC): `{report.get('completed_at_utc', '')}`")
    lines.append(f"- 전체 실행 시간: `{report.get('total_elapsed_seconds', 0):.6f}s`")
    lines.append(f"- 검증 전략: `{report.get('strategy', 'single')}`")
    lines.append(f"- 케이스 수: `{report['cases']}`")
    lines.append(f"- window 폭 목록: `{report.get('windows', [report['window']])}`")
    lines.append(f"- 모든 케이스 합격: `{report['all_cases_pass']}`")
    lines.append("")
    lines.append("## 검증 설정")
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(report["settings"], indent=2))
    lines.append("```")
    lines.append("")
    lines.append("## 케이스별 결과")
    lines.append("")
    lines.append("| # | window | az0:az1 | shape | max_abs_diff | rel | peak_ratio | NCC | FDC Δ | pass |")
    lines.append("| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | :---: |")
    for case in report["results"]:
        lines.append(
            f"| {case['case_index']} | {case['window']} | "
            f"`{case['az0']}:{case['az1']}` | "
            f"`{case['focused_shape_v4']}` | "
            f"{case['max_abs_diff']:.3g} | "
            f"{case['rel_max_abs_diff']:.3g} | "
            f"{case['peak_ratio']:.6f} | "
            f"{case['ncc_amplitude']:.4f} | "
            f"{case['fdc_abs_diff']:.2e} | "
            f"{'✅' if case['pass'] else '❌'} |"
        )
    lines.append("")
    failed = [c for c in report["results"] if not c["pass"]]
    if failed:
        lines.append("## 실패 케이스 샘플 (상위 3건)")
        lines.append("")
        for case in failed[:3]:
            lines.append(f"### 케이스 {case['case_index']} (`{case['az0']}:{case['az1']}`)")
            lines.append("")
            lines.append("| 샘플 | Row | Col | V4 (real, imag) | V7 (real, imag) |")
            lines.append("| --- | ---: | ---: | --- | --- |")
            for sample in case["samples"]:
                lines.append(
                    f"| {sample['sample_no']} | {sample['row']} | {sample['col']} | "
                    f"({sample['v4']['real']}, {sample['v4']['imag']}) | "
                    f"({sample['v7']['real']}, {sample['v7']['imag']}) |"
                )
            lines.append("")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    raise SystemExit(main())
