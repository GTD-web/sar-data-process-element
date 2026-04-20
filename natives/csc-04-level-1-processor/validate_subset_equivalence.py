import argparse
import json
import math
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from raw import sar_rda_processorV4 as original
import csu_04_04_slc_formation as split_slc


def _build_manual_block(meta, az0: int, az1: int) -> dict:
    if az0 < 0 or az1 <= az0:
        raise ValueError("az0 must be >= 0 and az1 must be > az0")
    if az1 > meta.na_total:
        raise ValueError(f"az1 ({az1}) exceeds na_total ({meta.na_total})")
    return {"block_idx": 0, "az0": az0, "az1": az1}


def _build_base_args(meta, rng_chunk: int, az_batch: int) -> dict:
    return dict(
        h5_path=meta.h5_path,
        nr=meta.nr,
        nr_dec=meta.nr_dec,
        prf=meta.prf,
        r_near=meta.r_near,
        dr_dec=meta.dr_dec,
        fs_dec=meta.fs_dec,
        wavelength=meta.wavelength,
        Vr_eff=meta.Vr_eff,
        platform_height=meta.platform_height,
        v_mag=meta.v_mag,
        decimate_range=meta.decimate_range,
        replica_dec=meta.replica_dec,
        smooth_len=101,
        rng_chunk=rng_chunk,
        az_batch=az_batch,
    )


def _build_recommended_subsets(na_total: int, window: int, fixed_count: int, random_count: int, seed: int) -> list[tuple[int, int]]:
    max_start = na_total - window
    if max_start < 0:
        raise ValueError("--window exceeds na_total")

    subsets: list[tuple[int, int]] = []
    if fixed_count > 0:
        fixed_starts = np.linspace(0, max_start, num=fixed_count, dtype=int)
        subsets.extend((int(start), int(start) + window) for start in fixed_starts)

    if random_count > 0:
        rng = random.Random(seed)
        sample_space = list(range(max_start + 1))
        sample_count = min(random_count, len(sample_space))
        random_starts = sorted(rng.sample(sample_space, k=sample_count))
        subsets.extend((start, start + window) for start in random_starts)

    deduped: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()
    for subset in subsets:
        if subset not in seen:
            deduped.append(subset)
            seen.add(subset)
    return deduped


def main() -> int:
    ap = argparse.ArgumentParser(description="Compare original CSC-04 and refactored subset processing.")
    ap.add_argument("--h5-path", required=True, help="Input HDF5 file path")
    ap.add_argument("--az0", type=int, help="Inclusive azimuth start index")
    ap.add_argument("--az1", type=int, help="Exclusive azimuth end index")
    ap.add_argument("--window", type=int, default=200, help="Subset width when using multi-case mode")
    ap.add_argument("--cases", type=int, default=1, help="Number of subset cases to validate")
    ap.add_argument("--seed", type=int, default=42, help="Random seed for multi-case subset selection")
    ap.add_argument("--windows", default="200", help="Comma-separated subset widths for multi-window validation")
    ap.add_argument("--fixed-count", type=int, default=10, help="Number of representative fixed subsets per window")
    ap.add_argument("--random-count", type=int, default=20, help="Number of random subsets per window")
    ap.add_argument("--strategy", choices=["single", "recommended"], default="single", help="Validation subset selection strategy")
    ap.add_argument("--sample-count", type=int, default=10, help="Number of complex samples to print per case")
    ap.add_argument("--json-out", help="Optional path to save structured comparison results as JSON")
    ap.add_argument("--md-out", help="Optional path to save a Markdown validation report")
    ap.add_argument("--decimate-range", type=int, default=1)
    ap.add_argument("--rng-chunk", type=int, default=64)
    ap.add_argument("--az-batch", type=int, default=16)
    ap.add_argument("--valid-lines", type=int, default=96)
    ap.add_argument("--na-block", type=int, default=192)
    ap.add_argument("--na-overlap", type=int, default=96)
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

    print(f"[subset-compare] h5_path={h5_path}")

    meta_original = original.load_metadata(h5_path, **settings)
    meta_split = split_slc.load_metadata(h5_path, **settings)

    scalar_checks = [
        "prf",
        "fc",
        "fs",
        "na_total",
        "nr",
        "nr_dec",
        "r_near",
        "dr_dec",
        "wavelength",
        "na_block",
        "na_overlap",
        "na_valid",
    ]
    for name in scalar_checks:
        a = getattr(meta_original, name)
        b = getattr(meta_split, name)
        if isinstance(a, float):
            if not math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9):
                print(f"[subset-compare] metadata mismatch: {name}: {a} != {b}")
                return 1
        elif a != b:
            print(f"[subset-compare] metadata mismatch: {name}: {a} != {b}")
            return 1

    base = _build_base_args(meta_original, args.rng_chunk, args.az_batch)

    windows = [int(part.strip()) for part in args.windows.split(",") if part.strip()]

    if args.az0 is not None or args.az1 is not None:
        if args.az0 is None or args.az1 is None:
            raise ValueError("Both --az0 and --az1 must be provided together")
        window_jobs = [{"window": args.az1 - args.az0, "subsets": [(args.az0, args.az1)], "label": f"manual:{args.az0}:{args.az1}"}]
    else:
        window_jobs = []
        if args.strategy == "recommended":
            for index, window in enumerate(windows, start=1):
                if window <= 0:
                    raise ValueError("--windows values must be > 0")
                subsets = _build_recommended_subsets(
                    meta_original.na_total,
                    window,
                    args.fixed_count,
                    args.random_count,
                    args.seed + index,
                )
                window_jobs.append({"window": window, "subsets": subsets, "label": f"recommended:{window}"})
        else:
            if args.window <= 0:
                raise ValueError("--window must be > 0")
            if args.window > meta_original.na_total:
                raise ValueError("--window exceeds na_total")
            max_start = meta_original.na_total - args.window
            rng = random.Random(args.seed)
            if args.cases == 1:
                subsets = [(3000, min(3000 + args.window, meta_original.na_total))] if max_start >= 3000 else [(0, args.window)]
            else:
                starts = sorted(rng.sample(range(max_start + 1), k=min(args.cases, max_start + 1)))
                subsets = [(start, start + args.window) for start in starts]
            window_jobs.append({"window": args.window, "subsets": subsets, "label": f"single:{args.window}"})

    total_cases = sum(len(job["subsets"]) for job in window_jobs)
    print(f"[subset-compare] total_cases={total_cases}")

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
        "all_cases_equal": True,
        "results": [],
    }

    case_index = 0
    for job in window_jobs:
        print(f"[subset-compare] window={job['window']} subsets={len(job['subsets'])} label={job['label']}")
        for az0, az1 in job["subsets"]:
            case_index += 1
            case_started = time.perf_counter()
            print(f"[subset-compare] case {case_index}: subset=({az0}, {az1}) width={az1 - az0}")
            block = _build_manual_block(meta_original, az0, az1)

            print("[subset-compare] running original _process_block...")
            result_original = original._process_block({**base, **block})
            print("[subset-compare] running refactored _process_block...")
            result_split = split_slc._process_block({**base, **block})

            head_equal = result_original[0] == result_split[0] and result_original[1] == result_split[1]
            fdc_equal = math.isclose(result_original[3], result_split[3], rel_tol=1e-6, abs_tol=1e-6)
            focused_equal = np.array_equal(result_original[2], result_split[2])
            max_abs_diff = float(np.max(np.abs(result_original[2] - result_split[2]))) if result_original[2].shape == result_split[2].shape else float("inf")

            print(f"[subset-compare] block tuple head equal: {head_equal}")
            print(f"[subset-compare] fdc original={result_original[3]} split={result_split[3]} equal={fdc_equal}")
            print(f"[subset-compare] focused original shape={result_original[2].shape}")
            print(f"[subset-compare] focused split    shape={result_split[2].shape}")
            print(f"[subset-compare] focused arrays equal={focused_equal}")
            print(f"[subset-compare] focused max_abs_diff={max_abs_diff}")

            samples_to_show = min(args.sample_count, result_original[2].size)
            flat_original = result_original[2].ravel()
            flat_split = result_split[2].ravel()
            if samples_to_show > 0:
                sample_indices = np.linspace(0, flat_original.size - 1, num=samples_to_show, dtype=int)
                print("[subset-compare] sample values:")
                sample_rows = []
                for sample_no, flat_idx in enumerate(sample_indices, start=1):
                    row, col = divmod(int(flat_idx), result_original[2].shape[1])
                    print(
                        f"  sample {sample_no}: idx=({row},{col}) "
                        f"original={flat_original[flat_idx]!r} "
                        f"split={flat_split[flat_idx]!r}"
                    )
                    sample_rows.append(
                        {
                            "sample_no": sample_no,
                            "row": row,
                            "col": col,
                            "original": {
                                "real": float(np.real(flat_original[flat_idx])),
                                "imag": float(np.imag(flat_original[flat_idx])),
                            },
                            "split": {
                                "real": float(np.real(flat_split[flat_idx])),
                                "imag": float(np.imag(flat_split[flat_idx])),
                            },
                        }
                    )
            else:
                sample_rows = []

            case_result = {
                "case_index": case_index,
                "window": job["window"],
                "label": job["label"],
                "az0": az0,
                "az1": az1,
                "width": az1 - az0,
                "block_tuple_head_equal": head_equal,
                "fdc_original": float(result_original[3]),
                "fdc_split": float(result_split[3]),
                "fdc_equal": fdc_equal,
                "focused_shape_original": list(result_original[2].shape),
                "focused_shape_split": list(result_split[2].shape),
                "focused_arrays_equal": focused_equal,
                "focused_max_abs_diff": max_abs_diff,
                "elapsed_seconds": round(time.perf_counter() - case_started, 6),
                "samples": sample_rows,
            }
            report["results"].append(case_result)

            if not head_equal or not fdc_equal or not focused_equal:
                report["all_cases_equal"] = False
                report["completed_at_utc"] = datetime.now(timezone.utc).isoformat()
                report["total_elapsed_seconds"] = round(time.perf_counter() - total_started, 6)
                if args.json_out:
                    json_path = Path(args.json_out)
                    json_path.parent.mkdir(parents=True, exist_ok=True)
                    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
                if args.md_out:
                    md_path = Path(args.md_out)
                    md_path.parent.mkdir(parents=True, exist_ok=True)
                    md_path.write_text(_render_markdown_report(report), encoding="utf-8")
                return 1

    report["completed_at_utc"] = datetime.now(timezone.utc).isoformat()
    report["total_elapsed_seconds"] = round(time.perf_counter() - total_started, 6)

    if args.json_out:
        json_path = Path(args.json_out)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"[subset-compare] JSON report saved to: {json_path}")
    if args.md_out:
        md_path = Path(args.md_out)
        md_path.parent.mkdir(parents=True, exist_ok=True)
        md_path.write_text(_render_markdown_report(report), encoding="utf-8")
        print(f"[subset-compare] Markdown report saved to: {md_path}")

    print("[subset-compare] OK: original and refactored subset outputs are identical for all cases")
    return 0


def _render_markdown_report(report: dict) -> str:
    lines: list[str] = []
    lines.append("# CSC-04 부분 구간 검증 리포트")
    lines.append("")
    lines.append("## 이 문서가 다루는 내용")
    lines.append("")
    lines.append(f"- 검증 대상 입력 파일: `{report['h5_path']}`")
    lines.append("- 검증 대상 코드:")
    lines.append("  - 원본: `raw/sar_rda_processorV4.py`")
    lines.append("  - 리팩토링본: `shared/*`, `csu_04_01_range_compression.py`, `csu_04_02_rda_azimuth.py`, `csu_04_04_slc_formation.py`, `main.py`")
    lines.append("- 검증 방식:")
    lines.append("  - HDF5 전체를 끝까지 처리한 것이 아니라, 여러 개의 azimuth 부분 구간(`az0:az1`)을 선택해 비교했습니다.")
    lines.append("  - 각 구간마다 원본 `_process_block()` 결과와 리팩토링 `_process_block()` 결과를 직접 비교했습니다.")
    lines.append("- 이 결과가 의미하는 것:")
    lines.append("  - `모든 케이스 동일`이 `True`이면, 이번에 선택한 모든 부분 구간에서 리팩토링 결과가 원본과 동일했다는 뜻입니다.")
    lines.append("  - `focused_arrays_equal = True` 이고 `focused_max_abs_diff = 0.0` 이면 해당 구간의 complex 출력 배열이 완전히 일치했다는 뜻입니다.")
    lines.append("  - 즉, 이번 리팩토링이 적어도 검증한 실제 HDF5 부분 구간들에서는 동작을 보존하고 있다는 강한 근거로 볼 수 있습니다.")
    lines.append("")
    lines.append("## 요약")
    lines.append("")
    lines.append(f"- HDF5 파일: `{report['h5_path']}`")
    lines.append(f"- 검증 시작 시각(UTC): `{report.get('started_at_utc', '')}`")
    lines.append(f"- 검증 완료 시각(UTC): `{report.get('completed_at_utc', '')}`")
    lines.append(f"- 전체 실행 시간: `{report.get('total_elapsed_seconds', 0):.6f}s`")
    lines.append(f"- 검증 전략: `{report.get('strategy', 'single')}`")
    lines.append(f"- 검증 케이스 수: `{report['cases']}`")
    lines.append(f"- 구간 폭(window) 목록: `{report.get('windows', [report['window']])}`")
    lines.append(f"- 대표 구간 수(고정): `{report.get('fixed_count', 0)}`")
    lines.append(f"- 랜덤 구간 수: `{report.get('random_count', 0)}`")
    lines.append(f"- 케이스당 complex 샘플 표시 수: `{report['sample_count']}`")
    lines.append(f"- 모든 케이스 동일: `{report['all_cases_equal']}`")
    lines.append("")
    lines.append("## 검증 설정")
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(report["settings"], indent=2))
    lines.append("```")
    lines.append("")
    lines.append("## 케이스별 결과")
    lines.append("")
    for case in report["results"]:
        lines.append(f"### 케이스 {case['case_index']}: `{case['az0']}:{case['az1']}`")
        lines.append("")
        lines.append(f"- 구간 폭: `{case['width']}`")
        lines.append(f"- window: `{case.get('window', case['width'])}`")
        lines.append(f"- 라벨: `{case.get('label', '')}`")
        lines.append(f"- 실행 시간: `{case['elapsed_seconds']:.6f}s`")
        lines.append(f"- FDC 원본: `{case['fdc_original']}`")
        lines.append(f"- FDC 리팩토링본: `{case['fdc_split']}`")
        lines.append(f"- FDC 동일 여부: `{case['fdc_equal']}`")
        lines.append(f"- 원본 shape: `{case['focused_shape_original']}`")
        lines.append(f"- 리팩토링본 shape: `{case['focused_shape_split']}`")
        lines.append(f"- 배열 동일 여부: `{case['focused_arrays_equal']}`")
        lines.append(f"- 최대 절대 오차: `{case['focused_max_abs_diff']}`")
        lines.append("")
        lines.append("| 샘플 | Row | Col | 원본 (real, imag) | 리팩토링본 (real, imag) |")
        lines.append("| --- | ---: | ---: | --- | --- |")
        for sample in case["samples"]:
            o = sample["original"]
            s = sample["split"]
            lines.append(
                f"| {sample['sample_no']} | {sample['row']} | {sample['col']} | "
                f"({o['real']}, {o['imag']}) | ({s['real']}, {s['imag']}) |"
            )
        lines.append("")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    raise SystemExit(main())
