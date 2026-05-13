"""
Run sar_rda_processorV4's _process_block on a SINGLE azimuth window
[az0, az1), with the same axis convention as the GUI's RDA_raw_to_SLC.py.

This bypasses V4's sliding-window overlap-add and Tukey weighting so the
output is directly comparable to the GUI npy.

Usage
-----
python run_v4_block.py --h5 path/to/16_resized.h5 --az0 3000 --az1 5000

By default, --v4 resolves to the sibling ../raw/sar_rda_processorV4.py.
Override with --v4 to point at a different copy.
"""

import argparse
import importlib.util
import sys
import time
from pathlib import Path

import numpy as np


_DEFAULT_V4 = (Path(__file__).resolve().parent.parent
               / "raw" / "sar_rda_processorV4.py")


def _load_v4_module(v4_path: Path):
    spec = importlib.util.spec_from_file_location(
        "sar_rda_processorV4", str(v4_path))
    if spec is None or spec.loader is None:
        raise SystemExit(f"Cannot load V4 module from {v4_path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["sar_rda_processorV4"] = mod
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    import logging
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s  %(levelname)-5s  %(message)s",
                        datefmt="%H:%M:%S")

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--v4", default=str(_DEFAULT_V4),
                    help="Path to sar_rda_processorV4.py "
                         f"(default: {_DEFAULT_V4})")
    ap.add_argument("--h5", required=True, help="Input HDF5 file")
    ap.add_argument("--az0", type=int, required=True)
    ap.add_argument("--az1", type=int, required=True)
    ap.add_argument("--out", default="./v4_block_out", help="Output directory")
    ap.add_argument("--rng-chunk", type=int, default=512)
    ap.add_argument("--az-batch", type=int, default=64)
    args = ap.parse_args()

    if args.az1 <= args.az0:
        raise SystemExit("--az1 must be > --az0")

    v4_path = Path(args.v4)
    if not v4_path.exists():
        raise SystemExit(f"V4 module not found at {v4_path}")
    v4 = _load_v4_module(v4_path)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[run_v4_block] Loading metadata for {args.h5} ...")
    m = v4.load_metadata(args.h5, decimate_range=1)
    print(f"  na_total={m.na_total}  nr={m.nr}  nr_dec={m.nr_dec}  prf={m.prf}")

    if not (0 <= args.az0 < args.az1 <= m.na_total):
        raise SystemExit(
            f"--az0/--az1 ({args.az0},{args.az1}) outside na_total {m.na_total}"
        )

    base = dict(
        h5_path=m.h5_path,
        nr=m.nr,
        nr_dec=m.nr_dec,
        prf=m.prf,
        r_near=m.r_near,
        dr_dec=m.dr_dec,
        fs_dec=m.fs_dec,
        wavelength=m.wavelength,
        Vr_eff=m.Vr_eff,
        platform_height=m.platform_height,
        v_mag=m.v_mag,
        decimate_range=m.decimate_range,
        replica_dec=m.replica_dec,
        smooth_len=101,
        rng_chunk=args.rng_chunk,
        az_batch=args.az_batch,
        block_idx=0,
        az0=args.az0,
        az1=args.az1,
    )

    t0 = time.time()
    print(f"[run_v4_block] Processing block [{args.az0}, {args.az1}) ...")
    bidx, az0, focused, fdc_mean = v4._process_block(base)
    dt = time.time() - t0
    print(f"  done in {dt:.1f}s   focused.shape={focused.shape}   fdc_mean={fdc_mean:.2f} Hz")

    out_npy = out_dir / f"SLC_V4_block_{args.az0}_{args.az1}.npy"
    np.save(out_npy, focused.astype(np.complex64))
    print(f"  saved -> {out_npy}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
