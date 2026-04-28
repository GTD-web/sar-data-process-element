"""
Reproduce V4's sliding-window overlap-add for a TARGET azimuth window
[az0_t, az1_t) by processing only the blocks that contribute to it.

This mirrors what `sar_rda_processorV4.process_runtime()` does, including
the Tukey weighting and weight-normalization, but limits the work to the
≤ ⌈na_block/step⌉ + 1 blocks that intersect the requested window instead
of the full azimuth run.

Usage
-----
python run_v4_overlap_window.py --h5 path/to/16_resized.h5 --az0 3000 --az1 5000

By default, --v4 resolves to the sibling ../raw/sar_rda_processorV4.py.
Override with --v4 to point at a different copy.
"""

import argparse
import importlib.util
import logging
import sys
import time
from pathlib import Path

import numpy as np


_DEFAULT_V4 = (Path(__file__).resolve().parent.parent
               / "raw" / "sar_rda_processorV4.py")


def _load_v4_module(v4_path: Path):
    spec = importlib.util.spec_from_file_location(
        "sar_rda_processorV4", str(v4_path))
    mod = importlib.util.module_from_spec(spec)
    sys.modules["sar_rda_processorV4"] = mod
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s  %(levelname)-5s  %(message)s",
                        datefmt="%H:%M:%S")

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--v4", default=str(_DEFAULT_V4),
                    help=f"Path to sar_rda_processorV4.py (default: {_DEFAULT_V4})")
    ap.add_argument("--h5", required=True)
    ap.add_argument("--az0", type=int, required=True,
                    help="Target window start (inclusive)")
    ap.add_argument("--az1", type=int, required=True,
                    help="Target window end (exclusive)")
    ap.add_argument("--out", default="./v4_overlap_out")
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

    print(f"[run_v4_overlap_window] Loading metadata for {args.h5} ...")
    m = v4.load_metadata(args.h5, decimate_range=1)
    print(f"  na_total={m.na_total}  nr_dec={m.nr_dec}  na_block={m.na_block}  "
          f"step={m.na_valid}  overlap={m.na_overlap}")

    if not (0 <= args.az0 < args.az1 <= m.na_total):
        raise SystemExit(
            f"--az0/--az1 ({args.az0},{args.az1}) outside na_total {m.na_total}"
        )

    schedule = v4._build_block_schedule(m.na_total, m.na_block, m.na_valid)

    az0_t, az1_t = args.az0, args.az1
    needed = [b for b in schedule
              if not (b['az1'] <= az0_t or b['az0'] >= az1_t)]
    print(f"  Need {len(needed)} / {len(schedule)} blocks for "
          f"target window [{az0_t}, {az1_t})")

    # Tukey window: V4 uses alpha = min(2*overlap/na_block, 1.5).  Replicate exactly.
    from scipy.signal.windows import tukey
    alpha = min(2.0 * m.na_overlap / m.na_block, 1.5)
    win = tukey(m.na_block, alpha=alpha).astype(np.float32)
    print(f"  Tukey alpha = {alpha:.4f}")

    naz_t = az1_t - az0_t
    buf = np.zeros((naz_t, m.nr_dec, 2), dtype=np.float32)
    wt = np.zeros(naz_t, dtype=np.float32)

    base = dict(
        h5_path=m.h5_path, nr=m.nr, nr_dec=m.nr_dec, prf=m.prf,
        r_near=m.r_near, dr_dec=m.dr_dec, fs_dec=m.fs_dec,
        wavelength=m.wavelength, Vr_eff=m.Vr_eff,
        platform_height=m.platform_height, v_mag=m.v_mag,
        decimate_range=m.decimate_range, replica_dec=m.replica_dec,
        smooth_len=101, rng_chunk=args.rng_chunk, az_batch=args.az_batch,
    )

    t0 = time.time()
    for i, blk in enumerate(needed, 1):
        bidx = blk['block_idx']
        az0_b, az1_b = blk['az0'], blk['az1']
        print(f"[{i}/{len(needed)}] Block #{bidx} az [{az0_b}, {az1_b}) ...")
        _, _, focused, fdc = v4._process_block({**base, **blk})
        slab = focused.T.astype(np.complex64)  # (na_actual, nr_dec)

        s_lo = max(az0_b, az0_t)
        s_hi = min(az1_b, az1_t)
        if s_hi <= s_lo:
            continue
        b_lo = s_lo - az0_b
        b_hi = s_hi - az0_b
        t_lo = s_lo - az0_t
        t_hi = s_hi - az0_t
        w = win[b_lo:b_hi]

        buf[t_lo:t_hi, :, 0] += slab[b_lo:b_hi].real * w[:, np.newaxis]
        buf[t_lo:t_hi, :, 1] += slab[b_lo:b_hi].imag * w[:, np.newaxis]
        wt[t_lo:t_hi] += w
        print(f"    fdc={fdc:.2f} Hz   intersected az [{s_lo}, {s_hi})")

    print(f"All blocks done in {time.time()-t0:.1f}s")

    safe_wt = np.maximum(wt, 1e-6)
    buf[..., 0] /= safe_wt[:, np.newaxis]
    buf[..., 1] /= safe_wt[:, np.newaxis]

    slc = (buf[..., 0] + 1j * buf[..., 1]).T.astype(np.complex64)

    out_npy = out_dir / f"SLC_V4_overlap_{az0_t}_{az1_t}.npy"
    np.save(out_npy, slc)
    print(f"Saved -> {out_npy}    shape={slc.shape}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
