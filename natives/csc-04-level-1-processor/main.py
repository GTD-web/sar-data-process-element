"""CSC-04 Range-Doppler Algorithm processor CLI.

This is the refactored entry point for the original V4 RDA processor.
The original monolithic implementation is kept at raw/sar_rda_processorV4.py
for output equivalence checks.

Usage preserved from V4:
  python main.py --input 16_resized.h5 --output ./output
  python main.py --input 16_resized.h5 --output ./output --workers 8
  python main.py --input 16_resized.h5 --output ./output --decimate-range 4
  python main.py --input 16_resized.h5 --output ./output --step 2000 --dry-run
"""

import argparse
import logging
import math

import numpy as np

from csu_04_04_slc_formation import SARProcessor, load_metadata
from shared.metadata import C, Meta, Re


def _print_parameters(m: Meta, az_batch: int = 64, rng_chunk: int = 512):
    bw = abs(m.bw_stop - m.bw_start)
    decimate_range = m.decimate_range
    n_blk = math.ceil((m.na_total - m.na_block) / m.na_valid) + 1

    # Memory estimates
    nfft = 1 << int(np.ceil(np.log2(m.nr_dec + m.nr_rep - 1)))
    fft_len = 1 << int(np.ceil(np.log2(2 * m.na_block)))
    raw_mb = m.na_block * m.nr_dec * 4 / 1e6
    rg_mb = nfft * az_batch * 16 / 1e6
    az_mb = rng_chunk * fft_len * 8 / 1e6
    peak_mb = raw_mb * 3

    print("\n" + "=" * 70)
    print("  SAR RDA Processor v3.0 — Parameters")
    print("=" * 70)
    print(f"  Input           : {m.h5_path}")
    print()
    print(f"  Carrier         : {m.fc/1e9:.3f} GHz  (λ = {m.wavelength*100:.3f} cm)")
    print(f"  PRF             : {m.prf:.1f} Hz")
    print(f"  Sampling freq   : {m.fs/1e9:.3f} GHz")
    print(f"  Chirp BW        : {bw/1e6:.0f} MHz  →  rng-res {C/(2*bw)*100:.1f} cm")
    print(f"  Platform height : {m.platform_height:.0f} m")
    print(f"  Vr_eff          : {m.Vr_eff:.3f} m/s  (= {m.flight_speed:.3f} x {np.sqrt(Re/(Re+m.platform_height)):.6f})")
    print(f"  Look angle      : {m.look_angle:.1f}°   squint: {m.squint_angle:.4f}°")
    print()
    max_d = max(0, int(m.fs / (2 * bw)))
    if decimate_range > 1:
        ok = "OK" if decimate_range <= max_d else f"WARNING — max safe D = {max_d}"
        print(f"  Range decimation: D={decimate_range}  [{ok}]")
        print(f"    fs: {m.fs/1e9:.3f} → {m.fs_dec/1e9:.4f} GHz")
        print(f"    nr: {m.nr} → {m.nr_dec}   dr: {m.dr:.4f} → {m.dr_dec:.4f} m")
    else:
        print(f"  Range decimation: D=1 (none).  Max safe D = {max_d}")
    print()
    print(f"  Output size     : {m.na_total} az x {m.nr_dec} rng")
    print(f"  R_near/mid/far  : {m.r_near:.0f} / {m.r_ref_dec:.0f} / {m.r_far_dec:.0f} m")
    print(f"  dr_dec          : {m.dr_dec:.4f} m")
    print()
    print("  ── Block layout ─────────────────────────────────────────────")
    print(f"  na_syn (far rng): {m.na_syn} lines  ({m.na_syn/m.prf:.2f} s)")
    print(f"  na_overlap      : {m.na_overlap} lines")
    print(f"  step / na_valid : {m.na_valid} lines")
    print(f"  na_block        : {m.na_block} lines  (= overlap + step)")
    print("  Tukey alpha     : 1.000  (Hann (no flat top))")
    print(f"  Est. blocks     : {n_blk}")
    print()
    print("  ── Memory per worker (estimated) ────────────────────────────")
    print(f"  Raw block       : {raw_mb:.0f} MB  complex64  ({m.nr_dec}x{m.na_block})")
    print(f"  Range FFT batch : {rg_mb:.0f} MB  (Nfft={nfft}, az_batch={az_batch})")
    print(f"  Azimuth FFT chk : {az_mb:.0f} MB  (rng_chunk={rng_chunk}, L={fft_len})")
    print(f"  Peak per worker : ~{peak_mb:.0f} MB  (3 rolling buffers)")
    print(f"  N workers x peak: ~{peak_mb*1:.0f}-{peak_mb*2:.0f} MB  (1-2 workers shown)")
    print("=" * 70 + "\n")


# ════════════════════════════════════════════════════════════════════════════
# 12. CLI
# ════════════════════════════════════════════════════════════════════════════
def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-5s  %(message)s", datefmt="%H:%M:%S")
    ap = argparse.ArgumentParser(description="SAR RDA Processor v3.0", formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    ap.add_argument("--input", "-i", required=True, help="Input HDF5 file")
    ap.add_argument("--output", "-o", required=True, help="Output directory")
    ap.add_argument("--workers", "-w", type=int, default=1, help="Parallel worker processes")
    ap.add_argument("--decimate-range", type=int, default=1, metavar="D", help="Range decimation factor D >= 1  (safe only when chirp_BW < fs/(2D))")
    ap.add_argument("--step", type=int, default=None, metavar="N", help="Valid (output) lines per step.  na_block = na_syn + step.  Default=1000.  Ignored if --block is given.")
    ap.add_argument("--block", type=int, default=None, metavar="N", help="Total azimuth block size in pulses (na_block). Sets step = na_block − na_overlap.")
    ap.add_argument("--overlap", type=int, default=None, metavar="N", help="Overlap in pulses (na_overlap).")
    ap.add_argument("--rng-chunk", type=int, default=512, help="Range-bin batch size for azimuth compression FFTs.")
    ap.add_argument("--az-batch", type=int, default=64, help="Azimuth-column batch size for range compression FFTs.")
    ap.add_argument("--vmin-db", type=float, default=-60.0, help="QuickLook dB floor (darker = below this)")
    ap.add_argument("--vmax-db", type=float, default=-5.0, help="QuickLook dB ceiling")
    ap.add_argument("--az-start", type=int, default=None, metavar="N",
                    help="Process only pulses [N, az_stop). Demo speed: skip warmup pulses.")
    ap.add_argument("--az-stop", type=int, default=None, metavar="N",
                    help="Process only pulses [az_start, N). Default = full raw azimuth length.")
    ap.add_argument("--dry-run", action="store_true", help="Print parameters only, do not process")
    args = ap.parse_args()

    from shared.metadata import HAS_H5PY

    if not HAS_H5PY:
        print("ERROR: pip install h5py")
        return 1
    if args.decimate_range < 1:
        print("ERROR: --decimate-range must be >= 1")
        return 1

    m = load_metadata(
        args.input,
        decimate_range=args.decimate_range,
        valid_lines=args.step,
        na_block_override=args.block,
        na_overlap_override=args.overlap,
        az_start=args.az_start,
        az_stop=args.az_stop,
    )
    _print_parameters(m, az_batch=args.az_batch, rng_chunk=args.rng_chunk)

    if args.dry_run:
        print("Dry-run complete.")
        return 0

    proc = SARProcessor(
        args.input,
        args.output,
        workers=args.workers,
        decimate_range=args.decimate_range,
        valid_lines=args.step,
        na_block_override=args.block,
        na_overlap_override=args.overlap,
        rng_chunk=args.rng_chunk,
        az_batch=args.az_batch,
        vmin_db=args.vmin_db,
        vmax_db=args.vmax_db,
        az_start=args.az_start,
        az_stop=args.az_stop,
    )
    result = proc.run()
    print("\nOutputs:")
    for k, v in result.items():
        print(f"  {k:<12}: {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
