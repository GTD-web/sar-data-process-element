"""
Extra comparison analyses on top of compare_slc.py:

  (a) Strong-scatterer peak detection + Hausdorff distance
      - Local maxima in a 21x21 neighborhood, top-N by amplitude
      - Symmetric Hausdorff and mean/median nearest-neighbor distances

  (b) ROI-based NCC on dB amplitudes
      - Tile the image into (range_tile x azimuth_tile) patches
      - Per-patch normalized cross-correlation; report mean/median/percentiles

Both metrics are scale-invariant per-patch / per-peak-list, so they are
robust to the global amplitude offset that the V4 overlap-add introduces
relative to a single-block run.

Usage
-----
python extra_analysis.py \
    --gui  path/to/gui.npy \
    --v4   path/to/v4.npy \
    --out  path/to/output_dir \
    [--top-n 200] [--peak-neighborhood 21] \
    [--tile-range 400] [--tile-azimuth 200]
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np


def _amp(npy_path: Path) -> np.ndarray:
    arr = np.load(npy_path)
    if not np.iscomplexobj(arr):
        raise SystemExit(f"{npy_path} is not complex")
    return np.abs(arr).astype(np.float32)


def _to_db(amp: np.ndarray) -> np.ndarray:
    peak = float(amp.max())
    if peak <= 0:
        return np.full_like(amp, -120.0)
    return 20.0 * np.log10(np.clip(amp / peak, 1e-6, None))


def detect_peaks(amp: np.ndarray, neighborhood: int = 21,
                 top_n: int = 200) -> np.ndarray:
    """
    Return top-N local maxima coordinates as (row, col).

    A pixel qualifies as a local max if it equals the max within a
    `neighborhood` x `neighborhood` window centered on it.
    """
    from scipy.ndimage import maximum_filter

    if neighborhood % 2 == 0:
        neighborhood += 1
    fmax = maximum_filter(amp, size=neighborhood, mode="nearest")
    is_peak = (amp == fmax) & (amp > 0)
    coords = np.argwhere(is_peak)
    if coords.size == 0:
        return coords
    vals = amp[coords[:, 0], coords[:, 1]]
    if coords.shape[0] > top_n:
        idx = np.argpartition(-vals, top_n)[:top_n]
        coords = coords[idx]
        vals = vals[idx]
    order = np.argsort(-vals)
    return coords[order]


def hausdorff_metrics(A: np.ndarray, B: np.ndarray) -> dict:
    """
    Symmetric Hausdorff and mean/median nearest-neighbor distance between
    two point sets in pixel coordinates (rows, cols).
    """
    from scipy.spatial import cKDTree

    if A.size == 0 or B.size == 0:
        return {"hausdorff_pix": float("nan"),
                "mean_nn_a_to_b_pix": float("nan"),
                "mean_nn_b_to_a_pix": float("nan"),
                "median_nn_a_to_b_pix": float("nan"),
                "median_nn_b_to_a_pix": float("nan"),
                "n_peaks_a": int(A.shape[0]), "n_peaks_b": int(B.shape[0])}

    tA = cKDTree(A)
    tB = cKDTree(B)
    da, _ = tB.query(A)
    db, _ = tA.query(B)
    return {
        "hausdorff_pix": float(max(da.max(), db.max())),
        "mean_nn_a_to_b_pix": float(da.mean()),
        "mean_nn_b_to_a_pix": float(db.mean()),
        "median_nn_a_to_b_pix": float(np.median(da)),
        "median_nn_b_to_a_pix": float(np.median(db)),
        "n_peaks_a": int(A.shape[0]),
        "n_peaks_b": int(B.shape[0]),
    }


def roi_ncc(db_a: np.ndarray, db_b: np.ndarray,
            tile_r: int, tile_az: int) -> dict:
    """
    Tile both dB images into (tile_r x tile_az) patches and compute NCC
    per patch.  Returns aggregate statistics across patches.
    """
    Nr, Na = db_a.shape
    nr_tiles = Nr // tile_r
    na_tiles = Na // tile_az
    nccs = np.empty(nr_tiles * na_tiles, dtype=np.float64)

    k = 0
    for i in range(nr_tiles):
        r0, r1 = i * tile_r, (i + 1) * tile_r
        for j in range(na_tiles):
            c0, c1 = j * tile_az, (j + 1) * tile_az
            a = db_a[r0:r1, c0:c1].astype(np.float64).ravel()
            b = db_b[r0:r1, c0:c1].astype(np.float64).ravel()
            a -= a.mean()
            b -= b.mean()
            denom = np.sqrt((a * a).sum() * (b * b).sum())
            nccs[k] = (a * b).sum() / denom if denom > 0 else 0.0
            k += 1

    return {
        "n_tiles": int(k),
        "tile_shape": [int(tile_r), int(tile_az)],
        "ncc_mean": float(nccs.mean()),
        "ncc_median": float(np.median(nccs)),
        "ncc_std": float(nccs.std()),
        "ncc_p10": float(np.percentile(nccs, 10)),
        "ncc_p90": float(np.percentile(nccs, 90)),
        "ncc_min": float(nccs.min()),
        "ncc_max": float(nccs.max()),
        "_nccs": nccs.tolist() if k <= 5000 else None,
    }


def save_peak_overlay(amp_a: np.ndarray, amp_b: np.ndarray,
                      pa: np.ndarray, pb: np.ndarray, out_path: Path,
                      vmin_db: float = -60, vmax_db: float = -5):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    db_a = _to_db(amp_a)
    db_b = _to_db(amp_b)
    fig, axes = plt.subplots(1, 2, figsize=(14, 7))
    axes[0].imshow(db_a, cmap="gray", vmin=vmin_db, vmax=vmax_db, aspect="auto")
    axes[0].scatter(pa[:, 1], pa[:, 0], s=10, edgecolor="red",
                    facecolor="none", linewidth=0.6)
    axes[0].set_title(f"GUI peaks (n={len(pa)})")
    axes[1].imshow(db_b, cmap="gray", vmin=vmin_db, vmax=vmax_db, aspect="auto")
    axes[1].scatter(pb[:, 1], pb[:, 0], s=10, edgecolor="cyan",
                    facecolor="none", linewidth=0.6)
    axes[1].set_title(f"V4 peaks (n={len(pb)})")
    for ax in axes:
        ax.set_xlabel("azimuth")
        ax.set_ylabel("range")
    fig.tight_layout()
    fig.savefig(str(out_path), dpi=140)
    plt.close(fig)


def save_ncc_histogram(nccs: list, out_path: Path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(8, 5))
    arr = np.asarray(nccs, dtype=np.float64)
    ax.hist(arr, bins=40, color="steelblue", edgecolor="black", alpha=0.85)
    ax.axvline(arr.mean(), color="red", linestyle="--",
               label=f"mean={arr.mean():.3f}")
    ax.axvline(np.median(arr), color="orange", linestyle="--",
               label=f"median={np.median(arr):.3f}")
    ax.set_xlabel("Per-tile NCC (dB amplitude)")
    ax.set_ylabel("Number of tiles")
    ax.set_title("ROI-based NCC distribution")
    ax.legend()
    fig.tight_layout()
    fig.savefig(str(out_path), dpi=140)
    plt.close(fig)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--gui", required=True)
    ap.add_argument("--v4", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--top-n", type=int, default=200)
    ap.add_argument("--peak-neighborhood", type=int, default=21)
    ap.add_argument("--tile-range", type=int, default=400)
    ap.add_argument("--tile-azimuth", type=int, default=200)
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading GUI from {args.gui} ...")
    amp_a = _amp(Path(args.gui))
    print(f"  shape={amp_a.shape}  peak={amp_a.max():.2f}")
    print(f"Loading V4  from {args.v4} ...")
    amp_b = _amp(Path(args.v4))
    print(f"  shape={amp_b.shape}  peak={amp_b.max():.2f}")
    if amp_a.shape != amp_b.shape:
        raise SystemExit(f"Shape mismatch: {amp_a.shape} vs {amp_b.shape}")

    print(f"\n[a] Detecting top-{args.top_n} local maxima "
          f"(neighborhood={args.peak_neighborhood}) ...")
    pa = detect_peaks(amp_a, neighborhood=args.peak_neighborhood,
                      top_n=args.top_n)
    pb = detect_peaks(amp_b, neighborhood=args.peak_neighborhood,
                      top_n=args.top_n)
    print(f"  GUI peaks: {len(pa)}    V4 peaks: {len(pb)}")
    haus = hausdorff_metrics(pa, pb)
    print("  Hausdorff metrics:")
    for k, v in haus.items():
        print(f"    {k}: {v}")

    print("  Saving peak overlay -> peaks_overlay.png")
    save_peak_overlay(amp_a, amp_b, pa, pb, out_dir / "peaks_overlay.png")

    print(f"\n[b] ROI-NCC tiles {args.tile_range}x{args.tile_azimuth} ...")
    db_a = _to_db(amp_a)
    db_b = _to_db(amp_b)
    roi = roi_ncc(db_a, db_b, args.tile_range, args.tile_azimuth)
    nccs = roi.pop("_nccs", None)
    print("  ROI NCC stats:")
    for k, v in roi.items():
        print(f"    {k}: {v}")

    if nccs is not None:
        save_ncc_histogram(nccs, out_dir / "ncc_histogram.png")
        print("  Saved histogram -> ncc_histogram.png")

    metrics = {
        "files": {"gui": str(args.gui), "v4": str(args.v4)},
        "shape": list(amp_a.shape),
        "peak_amp": {"gui": float(amp_a.max()), "v4": float(amp_b.max())},
        "peak_detection": {
            "neighborhood": args.peak_neighborhood,
            "top_n_requested": args.top_n,
            **haus,
        },
        "roi_ncc": roi,
    }
    with open(out_dir / "extra_metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    np.savetxt(out_dir / "peaks_gui.csv", pa, fmt="%d", delimiter=",",
               header="row_range,col_azimuth", comments="")
    np.savetxt(out_dir / "peaks_v4.csv", pb, fmt="%d", delimiter=",",
               header="row_range,col_azimuth", comments="")
    if nccs is not None:
        np.savetxt(out_dir / "roi_ncc_values.csv", np.asarray(nccs),
                   fmt="%.6f", header="ncc", comments="")
    print(f"\nWrote -> {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
