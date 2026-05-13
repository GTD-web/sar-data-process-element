"""
Compare SLC outputs between an external GUI processor (RDA_raw_to_SLC.py)
and this repository's standalone sar_rda_processorV4.py.

Inputs accepted for --v4:
  - .npy   : complex SLC produced by run_v4_block.py or
             run_v4_overlap_window.py (already shaped (Nrg, Naz))
  - .tif   : 2-band float32 GeoTIFF written by V4 via rasterio
  - .bin   : BIP fallback when rasterio is missing (uses sibling .bin.hdr)

Usage
-----
python compare_slc.py \
    --gui  path/to/SLC_RDA_<algo>_<ts>.npy \
    --v4   path/to/v4_out/SLC_complex_w10dec16.tif \
    --az0  3000 --az1 5000 \
    --out  path/to/compare_out

When --v4 is a full-image .tif/.bin, the script crops to [az0, az1).
When --v4 is a per-block .npy already shaped (Nrg, az1-az0), no cropping
is performed.

Outputs:
  - gui_db.png, v4_db.png, diff_db.png   (amplitude in dB)
  - side_by_side.png
  - metrics.json   (shape, NCC, RMSE on dB, peak amplitude ratio, ...)
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np


def load_gui_slc(path: Path) -> np.ndarray:
    """Load GUI-produced SLC complex array. Shape (Nrg, n_cols)."""
    arr = np.load(path)
    if not np.iscomplexobj(arr):
        raise ValueError(f"GUI npy is not complex: {path}")
    return arr


def _load_v4_bip(bin_path: Path) -> np.ndarray:
    """
    Read the BIP fallback that V4 writes when rasterio is missing.
    Layout: float32, BIP, 2 bands (real, imag), shape (lines, samples, 2).
    Reads dimensions from the matching ENVI .hdr file.
    """
    hdr = bin_path.with_suffix(bin_path.suffix + ".hdr")
    if not hdr.exists():
        hdr = Path(str(bin_path) + ".hdr")
    if not hdr.exists():
        raise SystemExit(f"ENVI header not found next to {bin_path}")

    samples = lines = bands = None
    with open(hdr, "r", encoding="utf-8") as f:
        for line in f:
            k, _, v = line.partition("=")
            k = k.strip().lower()
            v = v.strip()
            if k == "samples":
                samples = int(v)
            elif k == "lines":
                lines = int(v)
            elif k == "bands":
                bands = int(v)
    if not (samples and lines and bands == 2):
        raise SystemExit(
            f"Unexpected ENVI header (samples={samples}, lines={lines}, bands={bands})"
        )

    arr = np.fromfile(bin_path, dtype=np.float32)
    expected = lines * samples * 2
    if arr.size != expected:
        raise SystemExit(
            f"BIP file size mismatch: got {arr.size} float32 values, "
            f"expected {expected} ({lines}x{samples}x2)"
        )
    arr = arr.reshape(lines, samples, 2)
    real = arr[..., 0]
    imag = arr[..., 1]
    return (real + 1j * imag).T.astype(np.complex64)  # → (Nrg, Naz)


def load_v4_slc(path: Path) -> np.ndarray:
    """
    Load V4's SLC output and return a complex array shaped (Nrg, Naz_total)
    so that it lines up with the GUI output's axis convention.
    """
    suf = path.suffix.lower()
    if suf == ".npy":
        arr = np.load(path)
        if not np.iscomplexobj(arr):
            raise SystemExit(f"V4 npy is not complex: {path}")
        return arr.astype(np.complex64)

    if suf == ".bin":
        return _load_v4_bip(path)

    if suf in (".tif", ".tiff"):
        try:
            import tifffile
        except ImportError as e:
            raise SystemExit(
                "tifffile is required to read the V4 GeoTIFF. "
                "Install with: pip install tifffile"
            ) from e

        img = tifffile.imread(str(path))
        if img.ndim != 3:
            raise ValueError(f"Unexpected V4 tif shape {img.shape}, expected 3D")
        if img.shape[-1] == 2:
            real = img[..., 0]
            imag = img[..., 1]
        elif img.shape[0] == 2:
            real = img[0]
            imag = img[1]
        else:
            raise ValueError(f"Cannot find 2 bands in V4 tif of shape {img.shape}")
        return (real + 1j * imag).T.astype(np.complex64)

    raise SystemExit(f"Unsupported V4 output extension: {path}")


def to_db(amp: np.ndarray) -> np.ndarray:
    """Normalised amplitude in dB (peak = 0 dB)."""
    a = np.abs(amp).astype(np.float64)
    peak = a.max()
    if peak <= 0:
        return np.full_like(a, -120.0)
    return 20.0 * np.log10(np.clip(a / peak, 1e-6, None))


def save_gray(arr_db: np.ndarray, path: Path, vmin: float, vmax: float):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.imsave(str(path), arr_db, cmap="gray", vmin=vmin, vmax=vmax)


def save_side_by_side(gui_db, v4_db, diff_db, out_path: Path,
                      vmin: float, vmax: float):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(1, 3, figsize=(18, 6))
    axes[0].imshow(gui_db, cmap="gray", vmin=vmin, vmax=vmax, aspect="auto")
    axes[0].set_title("GUI (RDA_raw_to_SLC)")
    axes[1].imshow(v4_db, cmap="gray", vmin=vmin, vmax=vmax, aspect="auto")
    axes[1].set_title("V4 (sar_rda_processorV4)")
    im = axes[2].imshow(diff_db, cmap="RdBu_r", vmin=-10, vmax=10, aspect="auto")
    axes[2].set_title("GUI - V4  (dB)")
    fig.colorbar(im, ax=axes[2], fraction=0.046, pad=0.04)
    for ax in axes:
        ax.set_xlabel("azimuth")
        ax.set_ylabel("range")
    fig.tight_layout()
    fig.savefig(str(out_path), dpi=120)
    plt.close(fig)


def normalised_cross_correlation(a: np.ndarray, b: np.ndarray) -> float:
    a = a.ravel().astype(np.float64)
    b = b.ravel().astype(np.float64)
    a -= a.mean()
    b -= b.mean()
    denom = np.sqrt((a * a).sum() * (b * b).sum())
    if denom == 0:
        return 0.0
    return float((a * b).sum() / denom)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--gui", required=True, help="GUI SLC_RDA*.npy path")
    ap.add_argument("--v4", required=True,
                    help="V4 output (.npy / .tif / .bin)")
    ap.add_argument("--az0", type=int, required=True,
                    help="Starting pulse index used by the GUI run")
    ap.add_argument("--az1", type=int, required=True,
                    help="Ending pulse index used by the GUI run")
    ap.add_argument("--out", default="./compare_out",
                    help="Output directory for previews and metrics")
    ap.add_argument("--vmin", type=float, default=-60.0,
                    help="Display floor in dB")
    ap.add_argument("--vmax", type=float, default=-5.0,
                    help="Display ceiling in dB")
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    gui_slc = load_gui_slc(Path(args.gui))
    v4_full = load_v4_slc(Path(args.v4))

    naz_v4 = v4_full.shape[1]
    expected_block = args.az1 - args.az0
    if naz_v4 == expected_block:
        v4_slc = v4_full
    else:
        if not (0 <= args.az0 < args.az1 <= naz_v4):
            raise SystemExit(
                f"--az0/--az1 ({args.az0},{args.az1}) outside V4 azimuth length {naz_v4}"
            )
        v4_slc = v4_full[:, args.az0:args.az1]

    if gui_slc.shape[0] != v4_slc.shape[0]:
        raise SystemExit(
            f"Range bins differ: GUI={gui_slc.shape[0]} V4={v4_slc.shape[0]}\n"
            "Did V4 run with --decimate-range 1?"
        )
    if gui_slc.shape[1] != v4_slc.shape[1]:
        raise SystemExit(
            f"Azimuth length mismatch after crop: GUI={gui_slc.shape[1]} V4={v4_slc.shape[1]}"
        )

    gui_amp = np.abs(gui_slc)
    v4_amp = np.abs(v4_slc)

    gui_db = to_db(gui_slc)
    v4_db = to_db(v4_slc)
    diff_db = gui_db - v4_db

    save_gray(gui_db, out_dir / "gui_db.png", args.vmin, args.vmax)
    save_gray(v4_db, out_dir / "v4_db.png", args.vmin, args.vmax)
    save_gray(diff_db, out_dir / "diff_db.png", -10.0, 10.0)
    save_side_by_side(gui_db, v4_db, diff_db,
                      out_dir / "side_by_side.png",
                      args.vmin, args.vmax)

    metrics = {
        "shape": list(gui_slc.shape),
        "az0": args.az0,
        "az1": args.az1,
        "gui_peak_amp": float(gui_amp.max()),
        "v4_peak_amp": float(v4_amp.max()),
        "peak_ratio_gui_over_v4": float(gui_amp.max() / max(v4_amp.max(), 1e-12)),
        "ncc_amp": normalised_cross_correlation(gui_amp, v4_amp),
        "ncc_db": normalised_cross_correlation(gui_db, v4_db),
        "rmse_db": float(np.sqrt(np.mean((gui_db - v4_db) ** 2))),
        "mean_abs_diff_db": float(np.mean(np.abs(gui_db - v4_db))),
    }
    with open(out_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(json.dumps(metrics, indent=2))
    print(f"\nPreviews and metrics written to: {out_dir.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
