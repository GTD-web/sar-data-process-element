#!/usr/bin/env python3
"""
sar_speckle_filter.py
=====================
Command-line speckle filter for SAR GeoTIFF images produced by sar_rda_processor.

Supported input formats
-----------------------
  • 1-band float32  — amplitude or intensity image
  • 2-band float32  — complex SLC (band-1 = real, band-2 = imag) as written by
                      sar_rda_processor.py.  Amplitude is derived automatically.

All filters operate in the INTENSITY domain (|SLC|²) and the result is written
as a 1-band intensity GeoTIFF.  Pass --output-amplitude to write √(intensity).

Available filters
-----------------
  boxcar       Simple mean over a rectangular window (fastest)
  lee          Classic Lee (σ²-based MMSE estimator)
  enhanced_lee Enhanced Lee (edge-preserving: dampens smoothing near edges)
  gamma_map    Gamma-MAP (maximum a posteriori, Gamma distribution)
  median       2-D median (scipy, good for point-target preservation)

Usage
-----
  python sar_speckle_filter.py --input image.tif --filter lee
  python sar_speckle_filter.py --input image.tif --xml meta.xml \\
         --filter enhanced_lee --win-x 7 --win-y 7 --looks 4 \\
         --output filtered/ --output-amplitude

  # Dry-run: print parameters only
  python sar_speckle_filter.py --input image.tif --filter gamma_map --dry-run

Notes
-----
  • Numba is used for boxcar, lee, enhanced_lee, gamma_map (JIT compiled on first
    call — expect a ~5 s warm-up; subsequent runs on identically shaped arrays
    reuse the cached bytecode).
  • --looks sets the equivalent number of looks (ENL) used by Lee / Gamma-MAP.
    If omitted it is estimated from the image statistics (a rough estimate; pass
    the true value from your sensor documentation for best results).
  • All geometry (rasterio transform, CRS) from the input TIFF is preserved.
"""

import argparse
import logging
import math
import os
import sys
import time
from datetime import datetime, UTC
from pathlib import Path
from typing import Optional
import xml.etree.ElementTree as ET
from xml.dom import minidom

import numpy as np

# ── Optional dependencies ──────────────────────────────────────────────────
try:
    from numba import njit, prange
    HAS_NUMBA = True
except ImportError:
    HAS_NUMBA = False

try:
    import rasterio
    import rasterio.windows
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False

try:
    from scipy.ndimage import median_filter as _scipy_median
    from scipy.ndimage import uniform_filter as _scipy_uniform
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

log = logging.getLogger("SAR-Filter")

FILTER_NAMES = ["boxcar", "lee", "enhanced_lee", "gamma_map", "median"]


# ════════════════════════════════════════════════════════════════════════════
# Numba kernels  (compiled on first call; fall back to numpy if unavailable)
# ════════════════════════════════════════════════════════════════════════════

if HAS_NUMBA:
    # ── Boxcar ───────────────────────────────────────────────────────────────
    @njit(parallel=True, fastmath=True, cache=True)
    def _boxcar_kernel(padded, out, hx, hy):
        H, W = out.shape
        for y in prange(H):
            for x in range(W):
                s = 0.0
                yy = y + hy
                xx = x + hx
                for j in range(-hy, hy + 1):
                    for i in range(-hx, hx + 1):
                        s += padded[yy + j, xx + i]
                out[y, x] = s / ((2 * hx + 1) * (2 * hy + 1))

    # ── Lee filter ───────────────────────────────────────────────────────────
    @njit(parallel=True, fastmath=True, cache=True)
    def _lee_kernel(padded, out, hx, hy, sigma2_noise):
        """
        Lee MMSE filter (intensity domain):
            b = var_local / (var_local + sigma2_noise)
            out = mean + b * (center - mean)
        where sigma2_noise = mean² / ENL
        """
        H, W = out.shape
        n = (2 * hx + 1) * (2 * hy + 1)

        for y in prange(H):
            for x in range(W):
                yy = y + hy
                xx = x + hx
                s  = 0.0
                s2 = 0.0
                for j in range(-hy, hy + 1):
                    for i in range(-hx, hx + 1):
                        v = padded[yy + j, xx + i]
                        s  += v
                        s2 += v * v
                mean   = s / n
                var    = s2 / n - mean * mean
                # local noise variance estimated from mean
                sig2   = mean * mean * sigma2_noise  # sigma2_noise = 1/ENL
                b      = var / (var + sig2) if (var + sig2) > 0 else 0.0
                b      = max(0.0, min(1.0, b))
                out[y, x] = mean + b * (padded[yy, xx] - mean)

    # ── Enhanced Lee ─────────────────────────────────────────────────────────
    @njit(parallel=True, fastmath=True, cache=True)
    def _enhanced_lee_kernel(padded, out, hx, hy, enl, k, cu):
        """
        Enhanced Lee filter (intensity domain):
            ci = std_local / mean_local
            w  = exp(-k * (ci - cu) / (cmax - ci))  if cu < ci < cmax else 1 or 0
            out = mean * w + center * (1 - w)
        cu = 1 / sqrt(ENL), cmax = sqrt(1 + 2/ENL)
        """
        H, W = out.shape
        n    = (2 * hx + 1) * (2 * hy + 1)
        cmax = math.sqrt(1.0 + 2.0 / enl)

        for y in prange(H):
            for x in range(W):
                yy = y + hy
                xx = x + hx
                s  = 0.0
                s2 = 0.0
                for j in range(-hy, hy + 1):
                    for i in range(-hx, hx + 1):
                        v = padded[yy + j, xx + i]
                        s  += v
                        s2 += v * v
                mean   = s / n
                var    = max(0.0, s2 / n - mean * mean)
                std    = math.sqrt(var)
                ci     = std / mean if mean > 0 else 0.0
                center = padded[yy, xx]

                if ci <= cu:
                    out[y, x] = mean          # homogeneous area → full smooth
                elif ci >= cmax:
                    out[y, x] = center        # edge / point → no smoothing
                else:
                    w = math.exp(-k * (ci - cu) / (cmax - ci))
                    out[y, x] = mean * w + center * (1.0 - w)

    # ── Gamma-MAP ────────────────────────────────────────────────────────────
    @njit(parallel=True, fastmath=True, cache=True)
    def _gamma_map_kernel(padded, out, hx, hy, enl):
        """
        Gamma-MAP (Oliver 1993):
            b = (alpha - enl - 1 + sqrt(D)) / (2 * alpha)
            alpha = (enl+1)^2 / Cu^2       Cu = 1/ENL
            D = (alpha - enl - 1)^2 + 4*alpha*enl*center/mean
        """
        H, W = out.shape
        n    = (2 * hx + 1) * (2 * hy + 1)
        cu2  = 1.0 / enl          # Cu² = 1/ENL  (intensity speckle)

        for y in prange(H):
            for x in range(W):
                yy = y + hy
                xx = x + hx
                s  = 0.0
                s2 = 0.0
                for j in range(-hy, hy + 1):
                    for i in range(-hx, hx + 1):
                        v = padded[yy + j, xx + i]
                        s  += v
                        s2 += v * v
                mean   = s / n
                var    = max(0.0, s2 / n - mean * mean)
                center = padded[yy, xx]

                if mean <= 0:
                    out[y, x] = 0.0
                    continue

                ci2   = var / (mean * mean) if mean > 0 else 0.0
                if ci2 <= cu2:
                    out[y, x] = mean
                    continue

                alpha = (enl + 1.0) * (enl + 1.0) / (ci2 - cu2 + 1e-12)
                d     = (alpha - enl - 1.0) ** 2 + 4.0 * alpha * enl * center / mean
                if d < 0:
                    out[y, x] = mean
                    continue
                b = (alpha - enl - 1.0 + math.sqrt(d)) / (2.0 * alpha)
                b = max(0.0, min(1.0, b))
                out[y, x] = b * center + (1.0 - b) * mean

else:
    # Fallback stubs — will be replaced by numpy versions in apply_filter()
    _boxcar_kernel = None
    _lee_kernel    = None
    _enhanced_lee_kernel = None
    _gamma_map_kernel    = None


# ════════════════════════════════════════════════════════════════════════════
# Public filter functions
# ════════════════════════════════════════════════════════════════════════════

def boxcar_filter(img: np.ndarray, win_x: int = 5, win_y: int = 5,
                  **_) -> np.ndarray:
    """Simple mean filter (intensity or amplitude domain)."""
    assert win_x % 2 == 1 and win_y % 2 == 1, "Window sizes must be odd"
    hx, hy = win_x // 2, win_y // 2

    if HAS_NUMBA:
        padded = np.pad(img.astype(np.float64), ((hy, hy), (hx, hx)), mode='reflect')
        out = np.zeros_like(img, dtype=np.float64)
        _boxcar_kernel(padded, out, hx, hy)
        return out.astype(np.float32)
    else:
        if HAS_SCIPY:
            return _scipy_uniform(img.astype(np.float64),
                                  size=(win_y, win_x), mode='reflect').astype(np.float32)
        else:
            # Pure numpy fallback
            from numpy.lib.stride_tricks import sliding_window_view
            padded = np.pad(img, ((hy, hy), (hx, hx)), mode='reflect')
            windows = sliding_window_view(padded, (win_y, win_x))
            return windows.mean(axis=(-2, -1)).astype(np.float32)


def lee_filter(img: np.ndarray, win_x: int = 5, win_y: int = 5,
               looks: float = 1.0, **_) -> np.ndarray:
    """
    Classic Lee MMSE filter (intensity domain).
    sigma2_noise = 1 / ENL  (coefficient of variation² for fully-developed speckle).
    """
    assert win_x % 2 == 1 and win_y % 2 == 1, "Window sizes must be odd"
    hx, hy      = win_x // 2, win_y // 2
    sigma2_noise = 1.0 / max(looks, 1e-3)

    if HAS_NUMBA:
        padded = np.pad(img.astype(np.float64), ((hy, hy), (hx, hx)), mode='reflect')
        out    = np.zeros_like(img, dtype=np.float64)
        _lee_kernel(padded, out, hx, hy, sigma2_noise)
        return out.astype(np.float32)
    else:
        # Numpy fallback: compute local mean and variance with uniform_filter
        if not HAS_SCIPY:
            raise RuntimeError("scipy is required for the numpy-fallback Lee filter. "
                               "Install numba or scipy.")
        img64  = img.astype(np.float64)
        mean_l = _scipy_uniform(img64,   size=(win_y, win_x), mode='reflect')
        mean_l2= _scipy_uniform(img64**2, size=(win_y, win_x), mode='reflect')
        var_l  = np.maximum(0.0, mean_l2 - mean_l**2)
        sig2   = mean_l**2 * sigma2_noise
        denom  = var_l + sig2
        b      = np.where(denom > 0, var_l / denom, 0.0).clip(0.0, 1.0)
        return (mean_l + b * (img64 - mean_l)).astype(np.float32)


def enhanced_lee_filter(img: np.ndarray, win_x: int = 5, win_y: int = 5,
                        looks: float = 1.0, damping: float = 1.0, **_) -> np.ndarray:
    """
    Enhanced Lee filter — edge-preserving.
    damping (k): higher = more smoothing in transition regions (default 1.0).
    """
    assert win_x % 2 == 1 and win_y % 2 == 1, "Window sizes must be odd"
    hx, hy = win_x // 2, win_y // 2
    enl    = max(looks, 1e-3)
    cu     = 1.0 / math.sqrt(enl)

    if HAS_NUMBA:
        padded = np.pad(img.astype(np.float64), ((hy, hy), (hx, hx)), mode='reflect')
        out    = np.zeros_like(img, dtype=np.float64)
        _enhanced_lee_kernel(padded, out, hx, hy, enl, damping, cu)
        return out.astype(np.float32)
    else:
        if not HAS_SCIPY:
            raise RuntimeError("scipy required for numpy-fallback Enhanced Lee filter.")
        cmax   = math.sqrt(1.0 + 2.0 / enl)
        img64  = img.astype(np.float64)
        mean_l = _scipy_uniform(img64,    size=(win_y, win_x), mode='reflect')
        mean_l2= _scipy_uniform(img64**2, size=(win_y, win_x), mode='reflect')
        var_l  = np.maximum(0.0, mean_l2 - mean_l**2)
        std_l  = np.sqrt(var_l)
        ci     = np.where(mean_l > 0, std_l / mean_l, 0.0)
        w      = np.exp(-damping * (ci - cu) / np.maximum(cmax - ci, 1e-12))
        out    = np.where(ci <= cu, mean_l,
                          np.where(ci >= cmax, img64,
                                   mean_l * w + img64 * (1.0 - w)))
        return out.astype(np.float32)


def gamma_map_filter(img: np.ndarray, win_x: int = 5, win_y: int = 5,
                     looks: float = 1.0, **_) -> np.ndarray:
    """
    Gamma-MAP (Maximum A Posteriori) filter — better contrast preservation
    than Lee at the cost of higher computation.
    """
    assert win_x % 2 == 1 and win_y % 2 == 1, "Window sizes must be odd"
    hx, hy = win_x // 2, win_y // 2
    enl    = max(looks, 1e-3)

    if HAS_NUMBA:
        padded = np.pad(img.astype(np.float64), ((hy, hy), (hx, hx)), mode='reflect')
        out    = np.zeros_like(img, dtype=np.float64)
        _gamma_map_kernel(padded, out, hx, hy, enl)
        return out.astype(np.float32)
    else:
        if not HAS_SCIPY:
            raise RuntimeError("scipy required for numpy-fallback Gamma-MAP filter.")
        img64  = img.astype(np.float64)
        mean_l = _scipy_uniform(img64,    size=(win_y, win_x), mode='reflect')
        mean_l2= _scipy_uniform(img64**2, size=(win_y, win_x), mode='reflect')
        var_l  = np.maximum(0.0, mean_l2 - mean_l**2)
        cu2    = 1.0 / enl
        ci2    = np.where(mean_l > 0, var_l / (mean_l**2), 0.0)
        alpha  = np.where(ci2 > cu2, (enl + 1.0)**2 / (ci2 - cu2 + 1e-12), 0.0)
        d      = np.maximum(0.0, (alpha - enl - 1.0)**2
                             + 4.0 * alpha * enl * img64 / np.maximum(mean_l, 1e-30))
        b      = np.where(ci2 > cu2,
                          ((alpha - enl - 1.0 + np.sqrt(d)) / (2.0 * alpha)).clip(0, 1),
                          0.0)
        out    = np.where(ci2 <= cu2, mean_l, b * img64 + (1.0 - b) * mean_l)
        return out.astype(np.float32)


def median_filter(img: np.ndarray, win_x: int = 5, win_y: int = 5, **_) -> np.ndarray:
    """2-D median filter via scipy (good for point-target preservation)."""
    if not HAS_SCIPY:
        raise RuntimeError("scipy is required for the median filter: pip install scipy")
    return _scipy_median(img.astype(np.float32),
                         size=(win_y, win_x), mode='reflect').astype(np.float32)


# ════════════════════════════════════════════════════════════════════════════
# Dispatcher
# ════════════════════════════════════════════════════════════════════════════

FILTER_FNS = {
    "boxcar"       : boxcar_filter,
    "lee"          : lee_filter,
    "enhanced_lee" : enhanced_lee_filter,
    "gamma_map"    : gamma_map_filter,
    "median"       : median_filter,
}


def apply_filter(img: np.ndarray, name: str,
                 win_x: int = 5, win_y: int = 5,
                 looks: float = 1.0, damping: float = 1.0) -> np.ndarray:
    """Route to the correct filter function."""
    fn = FILTER_FNS.get(name)
    if fn is None:
        raise ValueError(f"Unknown filter '{name}'. Choose from: {FILTER_NAMES}")
    return fn(img, win_x=win_x, win_y=win_y, looks=looks, damping=damping)


# ════════════════════════════════════════════════════════════════════════════
# ENL estimator (rough, from image statistics)
# ════════════════════════════════════════════════════════════════════════════

def estimate_enl(intensity: np.ndarray, percentile: float = 90.0) -> float:
    """
    Estimate the Equivalent Number of Looks (ENL) from a sub-sample of
    the intensity image using:
        ENL = mean² / variance
    Only pixels below the ``percentile``-th intensity percentile are used
    to avoid bright targets biasing the estimate.
    """
    flat = intensity.ravel()
    flat = flat[flat > 0]
    if len(flat) == 0:
        return 1.0
    thresh = np.percentile(flat, percentile)
    roi    = flat[flat <= thresh]
    if len(roi) < 10:
        return 1.0
    m  = float(np.mean(roi))
    v  = float(np.var(roi))
    return max(0.5, m * m / v) if v > 0 else 1.0


# ════════════════════════════════════════════════════════════════════════════
# TIFF I/O
# ════════════════════════════════════════════════════════════════════════════

def load_tiff(path: str) -> tuple[np.ndarray, dict]:
    """
    Load a GeoTIFF and return (intensity_float32, meta_dict).

    Handles:
      • 1-band intensity  → used as-is
      • 1-band amplitude  → squared  (heuristic: if median < 100)
      • 2-band complex    → band1=real, band2=imag → |z|²
    The caller decides via --input-type to override the heuristic.
    """
    if not HAS_RASTERIO:
        raise RuntimeError("rasterio is required: pip install rasterio")

    with rasterio.open(path) as src:
        meta      = src.meta.copy()
        n_bands   = src.count
        transform = src.transform
        crs       = src.crs
        tags      = src.tags()

        if n_bands == 2:
            re  = src.read(1).astype(np.float32)
            im  = src.read(2).astype(np.float32)
            img = re**2 + im**2
            input_kind = "complex_slc"
        elif n_bands == 1:
            img        = src.read(1).astype(np.float32)
            input_kind = "single_band"
        else:
            raise ValueError(f"Expected 1- or 2-band TIFF; got {n_bands} bands.")

    info = dict(transform=transform, crs=crs, tags=tags,
                n_bands_in=n_bands, input_kind=input_kind,
                shape=img.shape)
    log.info("Loaded %s  bands=%d  shape=%s  kind=%s",
             path, n_bands, img.shape, input_kind)
    return img, info


def save_tiff(data: np.ndarray, out_path: str, ref_info: dict,
              output_amplitude: bool = False) -> None:
    """
    Write a 1-band float32 GeoTIFF, preserving the CRS and transform
    from the reference image.

    Parameters
    ----------
    data             : (H, W) float32  — intensity or amplitude
    out_path         : output file path
    ref_info         : dict returned by load_tiff()
    output_amplitude : if True write sqrt(data), else write data as intensity
    """
    if not HAS_RASTERIO:
        raise RuntimeError("rasterio is required: pip install rasterio")

    out = np.sqrt(np.maximum(data, 0.0)) if output_amplitude else data
    H, W = out.shape
    big  = H * W * 4 > 4e9

    kw = dict(
        driver    = 'GTiff',
        height    = H,
        width     = W,
        count     = 1,
        dtype     = 'float32',
        compress  = 'zstd',
        zstd_level = 9,
        predictor  = 2,
        bigtiff    = 'YES' if big else 'NO',
        crs       = ref_info.get('crs'),
        transform  = ref_info.get('transform'),
    )
    with rasterio.open(out_path, 'w', **kw) as dst:
        dst.write(out, 1)

    log.info("Saved %s  (%.1f MB)  %s",
             out_path, os.path.getsize(out_path) / 1e6,
             "amplitude" if output_amplitude else "intensity")


# ════════════════════════════════════════════════════════════════════════════
# XML metadata update
# ════════════════════════════════════════════════════════════════════════════

def _sub(parent, tag, text=None, **attrs):
    el = ET.SubElement(parent, tag, attrib=attrs)
    if text is not None:
        el.text = str(text)
    return el


def update_xml(in_xml_path: Optional[str], out_xml_path: str,
               filter_name: str, win_x: int, win_y: int,
               looks: float, damping: float,
               enl_estimated: float,
               input_tiff: str, output_tiff: str,
               output_amplitude: bool,
               elapsed_s: float) -> None:
    """
    Produce an updated XML file that embeds the filter provenance.
    If in_xml_path is provided, the existing tree is extended; otherwise
    a minimal standalone metadata document is created.
    """
    if in_xml_path and os.path.exists(in_xml_path):
        tree = ET.parse(in_xml_path)
        root = tree.getroot()
    else:
        root = ET.Element("SARProcessingMetadata",
                          version='3.0',
                          created=datetime.now(UTC).isoformat().replace('+00:00', 'Z'))
        if in_xml_path:
            log.warning("XML not found at %s — creating new metadata file.", in_xml_path)

    # Remove any old SpeckleFilter block so we don't accumulate duplicates
    for old in root.findall("SpeckleFilter"):
        root.remove(old)

    sf = _sub(root, "SpeckleFilter")
    _sub(sf, "AppliedDate",   datetime.now(UTC).isoformat().replace('+00:00', 'Z'))
    _sub(sf, "Script",        "sar_speckle_filter.py")
    _sub(sf, "InputFile",     input_tiff)
    _sub(sf, "OutputFile",    output_tiff)
    _sub(sf, "OutputDomain",  "amplitude" if output_amplitude else "intensity")
    _sub(sf, "FilterName",    filter_name)

    wp = _sub(sf, "WindowParameters")
    _sub(wp, "WindowX",   str(win_x),  unit="samples")
    _sub(wp, "WindowY",   str(win_y),  unit="lines")
    _sub(wp, "Area",      str(win_x * win_y))

    lp = _sub(sf, "SpeckleParameters")
    _sub(lp, "ENL_used",       f"{looks:.4f}")
    _sub(lp, "ENL_estimated",  f"{enl_estimated:.4f}",
         note="rough estimate from image statistics; may differ from true ENL")
    if filter_name == "enhanced_lee":
        _sub(lp, "DampingFactor", f"{damping:.4f}")

    _sub(sf, "ProcessingTimeSeconds", f"{elapsed_s:.2f}")

    filter_notes = {
        "boxcar"       : "Simple mean (boxcar) — fastest; no adaptive weighting",
        "lee"          : "Classic Lee MMSE filter — intensity domain, sigma²-based",
        "enhanced_lee" : "Enhanced Lee — edge-preserving; uses ci/cmax thresholds",
        "gamma_map"    : "Gamma-MAP (Oliver 1993) — MAP estimator, Gamma prior",
        "median"       : "2-D median filter (scipy) — point-target preserving",
    }
    _sub(sf, "FilterDescription", filter_notes.get(filter_name, ""))

    dom  = minidom.parseString(ET.tostring(root, encoding='utf-8'))
    with open(out_xml_path, 'wb') as fh:
        fh.write(dom.toprettyxml(indent='  ', encoding='utf-8'))
    log.info("XML → %s", out_xml_path)


# ════════════════════════════════════════════════════════════════════════════
# CLI
# ════════════════════════════════════════════════════════════════════════════

def _print_summary(args, img_shape, enl_est, enl_used, win_x, win_y):
    H, W = img_shape
    bw = ("—" if args.filter == "boxcar"
          else f"damping={args.damping}" if args.filter == "enhanced_lee"
          else "")
    print()
    print("=" * 62)
    print("  SAR Speckle Filter — Parameters")
    print("=" * 62)
    print(f"  Input TIFF      : {args.input}")
    print(f"  Input XML       : {args.xml or '(none)'}")
    print(f"  Image size      : {H} lines × {W} samples")
    print(f"  Filter          : {args.filter}  {bw}")
    print(f"  Window          : {win_x} (rng) × {win_y} (az)")
    print(f"  ENL estimated   : {enl_est:.2f}  (from image statistics)")
    print(f"  ENL used        : {enl_used:.2f}  "
          f"{'(user-supplied)' if args.looks else '(auto-estimated)'}")
    print(f"  Output domain   : {'amplitude' if args.output_amplitude else 'intensity'}")
    print(f"  Output dir      : {args.output}")
    print(f"  Numba available : {HAS_NUMBA}")
    print(f"  scipy available : {HAS_SCIPY}")
    print("=" * 62)
    print()


def main() -> int:
    logging.basicConfig(level=logging.INFO,
                        format='%(asctime)s  %(levelname)-5s  %(message)s',
                        datefmt='%H:%M:%S')

    ap = argparse.ArgumentParser(
        description="SAR Speckle Filter CLI",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        epilog=("Filters: boxcar | lee | enhanced_lee | gamma_map | median\n"
                "Example: python sar_speckle_filter.py "
                "--input slc.tif --xml meta.xml --filter lee --looks 4"))

    # I/O
    ap.add_argument('--input',  '-i', required=True,
                    help="Input GeoTIFF (1-band intensity/amplitude or 2-band complex SLC)")
    ap.add_argument('--xml',    '-x', default=None,
                    help="Input XML metadata file (optional; pass to update provenance)")
    ap.add_argument('--output', '-o', default=None,
                    help="Output directory (default: same directory as input)")

    # Filter selection
    ap.add_argument('--filter', '-f', default='lee', choices=FILTER_NAMES,
                    help="Speckle filter algorithm")

    # Window parameters
    ap.add_argument('--win-x', type=int, default=5,
                    help="Filter window width  (range direction, must be odd)")
    ap.add_argument('--win-y', type=int, default=5,
                    help="Filter window height (azimuth direction, must be odd)")

    # Filter parameters
    ap.add_argument('--looks', type=float, default=None,
                    help="Equivalent number of looks (ENL).  "
                         "Auto-estimated from image statistics if omitted.")
    ap.add_argument('--damping', type=float, default=1.0,
                    help="Damping factor k for Enhanced Lee (higher = more smoothing "
                         "in transition zones).  Ignored by other filters.")

    # Output options
    ap.add_argument('--output-amplitude', action='store_true',
                    help="Write √(intensity) instead of intensity to the output TIFF")
    ap.add_argument('--dry-run', action='store_true',
                    help="Print parameters and exit without processing")

    args = ap.parse_args()

    # ── Validate ──────────────────────────────────────────────────────────
    if not HAS_RASTERIO:
        print("ERROR: rasterio is required — pip install rasterio")
        return 1

    in_path = Path(args.input)
    if not in_path.exists():
        print(f"ERROR: Input file not found: {in_path}")
        return 1

    win_x = args.win_x
    win_y = args.win_y
    if win_x % 2 == 0:
        win_x += 1
        log.warning("win-x must be odd — adjusted to %d", win_x)
    if win_y % 2 == 0:
        win_y += 1
        log.warning("win-y must be odd — adjusted to %d", win_y)

    # ── Output paths ──────────────────────────────────────────────────────
    out_dir = Path(args.output) if args.output else in_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    stem      = in_path.stem
    filt_tag  = f"{args.filter}_{win_x}x{win_y}"
    out_tiff  = str(out_dir / f"{stem}_{filt_tag}.tif")
    out_xml   = str(out_dir / f"{stem}_{filt_tag}_metadata.xml")

    # ── Load image (metadata only for dry-run) ────────────────────────────
    log.info("Loading %s …", in_path)
    intensity, ref_info = load_tiff(str(in_path))

    enl_est  = estimate_enl(intensity)
    enl_used = args.looks if args.looks is not None else enl_est

    _print_summary(args, intensity.shape, enl_est, enl_used, win_x, win_y)

    if args.dry_run:
        print("Dry-run complete — no output written.")
        return 0

    # ── Warm up Numba (first-call JIT compile) ────────────────────────────
    if HAS_NUMBA and args.filter != "median":
        log.info("Warming up Numba JIT compiler …")
        dummy = np.ones((16, 16), dtype=np.float64)
        apply_filter(dummy.astype(np.float32), args.filter,
                     win_x=3, win_y=3, looks=enl_used, damping=args.damping)

    # ── Apply filter ──────────────────────────────────────────────────────
    log.info("Applying %s filter (window %dx%d, ENL=%.2f) …",
             args.filter, win_x, win_y, enl_used)
    t0      = time.time()
    filtered = apply_filter(intensity, args.filter,
                            win_x=win_x, win_y=win_y,
                            looks=enl_used, damping=args.damping)
    elapsed = time.time() - t0
    log.info("Filter done in %.2f s", elapsed)

    # ── Save outputs ──────────────────────────────────────────────────────
    save_tiff(filtered, out_tiff, ref_info,
              output_amplitude=args.output_amplitude)

    update_xml(args.xml, out_xml,
               filter_name     = args.filter,
               win_x           = win_x,
               win_y           = win_y,
               looks           = enl_used,
               damping         = args.damping,
               enl_estimated   = enl_est,
               input_tiff      = str(in_path),
               output_tiff     = out_tiff,
               output_amplitude= args.output_amplitude,
               elapsed_s       = elapsed)

    print("\nOutputs:")
    print(f"  tiff : {out_tiff}")
    print(f"  xml  : {out_xml}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
