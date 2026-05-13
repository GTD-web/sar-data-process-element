#!/usr/bin/env python3
"""
sar_rda_processorV7.py  —  v7.0
================================
Range-Doppler Algorithm (RDA) SAR Processor — HDF5 airborne raw data

Property of Lumir Inc.

Changes from V5 (Numba JIT acceleration)
-----------------------------------------
Two @njit(parallel=True, fastmath=True, cache=True) kernels replace the two
biggest bottlenecks.  Everything else is unchanged from V5.

  Kernel              Replaces                      Speedup (32 cores, D=1)
  ─────────────────────────────────────────────────────────────────────────
  _nb_rcmc            map_coordinates strip loop    ~80-150x
  _nb_accumulate      chunked real/imag loop        ~20-50x
  ─────────────────────────────────────────────────────────────────────────

Why these two?
─────────────
• RCMC (V5): 20 Python iterations x [allocate row+col 310 MB float64 +
  map_coordinates on 19.5M coordinates] = ~24 GB of temporary allocation
  churn per block.  The Numba kernel eliminates ALL temporaries — it
  operates directly on the source and output arrays with a parallel loop
  over range bins and a sequential loop over azimuth samples.

• Accumulate (V5): 155 Python iterations (79504 range bins / 512 chunk size),
  each allocating a .real.T float32 copy + multiply.  The Numba kernel
  fuses this into a single parallel azimuth loop with sequential range
  accesses, running the entire accumulation as one compiled C-level call.

Why NOT Numba for range/azimuth FFTs?
  scipy.fft(workers=-1) uses pocketfft with all CPU threads already.
  Wrapping FFTs in Numba would lose this and be strictly slower.

Why NOT Numba for deramping?
  numpy's broadcast multiply  src_rc * demod[np.newaxis, :]  is already
  vectorized (AVX/SSE).  Adding Numba separation overhead would be slower.

Installation
------------
  pip install numba
  # Numba requires LLVM — it ships pre-built wheels for Windows/Linux/macOS.
  # First run compiles the two kernels (~5-15 s); subsequent runs use the
  # cached .nbi/.nbc files in __pycache__ and start immediately.

Usage
-----
  # Single-process, all cores (RECOMMENDED — no pickle overhead)
  python sar_rda_processorV7.py --input data.h5 --output ./out --threads 32

  # Multiprocessing (each worker gets --threads / workers OMP threads)
  python sar_rda_processorV7.py --input data.h5 --output ./out -w 4 --threads 8

  # Dry-run — show parameters only
  python sar_rda_processorV7.py --input data.h5 --output ./out --dry-run

  # Range decimation
  python sar_rda_processorV7.py --input data.h5 --output ./out --decimate-range 4

Memory budget (single-process, D=1, 128 GB system)
---------------------------------------------------
  Rolling buffer   :  4767 x 79504 x 8  ≈   3 GB
  Working arrays   :  ~6-9 GB  (raw block, rc, rcmc, focused, foc_T)
  Numba temporaries:  <1 GB   (re/im splits for RCMC and transpose for accum)
  Total peak       :  ~12-15 GB   (vs 128 GB available — very comfortable)
"""

import argparse
import concurrent.futures
import logging
import math
import os
import struct
import time
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import xml.etree.ElementTree as ET
from xml.dom import minidom

import numpy as np
from scipy.interpolate import interp1d
from scipy.ndimage import map_coordinates as _map_coords
from scipy.signal import firwin, lfilter, resample_poly, savgol_filter
from scipy.signal.windows import tukey

try:
    import h5py
    HAS_H5PY = True
except ImportError:
    HAS_H5PY = False

try:
    import rasterio
    import rasterio.windows
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    HAS_MPL = True
except ImportError:
    HAS_MPL = False

# ── Numba JIT backend ────────────────────────────────────────────────────────
# All @njit functions are module-level so they can be pickled by multiprocessing.
# cache=True writes compiled bitcode to __pycache__; after the first run
# subsequent starts skip compilation entirely (typically < 1 s load time).
try:
    from numba import njit, prange
    import numba
    HAS_NUMBA = True
except ImportError:
    HAS_NUMBA = False
    log_tmp = logging.getLogger("SAR-RDA")
    log_tmp.warning(
        "numba not found — pip install numba — falling back to pure Python.\n"
        "  RCMC will be ~80-150x slower and accumulate ~20-50x slower.")

import math as _math  # used inside @njit functions

# ── FFT backend: scipy.fft → numpy.fft ──────────────────────────────────────
try:
    import scipy.fft as _scipy_fft
    def _fft(a, n=None, axis=-1, workers=-1):
        return _scipy_fft.fft(a, n=n, axis=axis, workers=workers)
    def _ifft(a, n=None, axis=-1, workers=-1):
        return _scipy_fft.ifft(a, n=n, axis=axis, workers=workers)
    def _next_fast_len(n):
        return _scipy_fft.next_fast_len(n)
    HAS_SCIPY_FFT = True
except ImportError:
    def _fft(a, n=None, axis=-1, workers=None):
        return np.fft.fft(a, n=n, axis=axis)
    def _ifft(a, n=None, axis=-1, workers=None):
        return np.fft.ifft(a, n=n, axis=axis)
    def _next_fast_len(n):
        return 1 << int(np.ceil(np.log2(n)))
    HAS_SCIPY_FFT = False

UTC = timezone.utc
C   = 299_792_458.0
Re  = 6_378_144.0
log = logging.getLogger("SAR-RDA")

_ACC_RCHUNK    = 512   # fallback Python chunk size (used only without Numba)
_QUEUE_HEADROOM = 2    # bounded parallel queue headroom


# ════════════════════════════════════════════════════════════════════════════
# Numba JIT kernels  (module-level — must be outside any class/function
#                    so multiprocessing can pickle them)
# ════════════════════════════════════════════════════════════════════════════

if HAS_NUMBA:
    # ── Kernel 1: RCMC bilinear interpolation ─────────────────────────────
    # Replaces the entire map_coordinates strip loop in rcmc_time_domain.
    #
    # Inputs  (all C-contiguous):
    #   src_re, src_im : (Nrg, Naz) float32  — separated real/imag of deramped RC block
    #   SR             : (Nrg,)     float64  — slant-range vector [m]
    #   Vr             : float64             — effective radar velocity [m/s]
    #   inv_prf        : float64             — 1 / PRF  [s]
    #   two_fs_over_C  : float64             — 2 * fs / C  [samples/m]
    #   out_re, out_im : (Nrg, Naz) float32  — output (pre-allocated)
    #
    # Algorithm (per output sample [r, n]):
    #   t     = n / PRF
    #   R     = sqrt(SR[r]^2 + (Vr * t)^2)
    #   ridx  = r + (R - SR[r]) * 2*fs/C      ← fractional source row
    #   out   = bilinear_interp(src, ridx, n)
    #
    # Parallelism: prange over r (Nrg = 79504 tasks → ~2500 per thread at 32 cores).
    # Inner loop over n (4767) is sequential and cache-friendly:
    #   - src_re[r0, n] for n=0..Naz-1: nearly stride-1 (r0 changes slowly)
    #   - out_re[r, n]  for n=0..Naz-1: exactly stride-1 (perfect sequential write)
    # No temporary arrays are allocated inside the kernel.
    @njit(parallel=True, fastmath=True, cache=True)
    def _nb_rcmc(src_re, src_im, SR, Vr, inv_prf, two_fs_over_C, out_re, out_im):
        Nrg      = src_re.shape[0]
        Naz      = src_re.shape[1]
        ridx_max = float(Nrg) - 2.0   # clamp so r0+1 is always valid

        for r in prange(Nrg):
            SR_r    = SR[r]
            SR_r_sq = SR_r * SR_r

            for n in range(Naz):
                # Hyperbolic range at slow-time index n
                t  = n * inv_prf
                vt = Vr * t
                R  = _math.sqrt(SR_r_sq + vt * vt)

                # Fractional source row index (always >= r because R >= SR_r)
                ridx = r + (R - SR_r) * two_fs_over_C

                # Clamp to valid interpolation range
                if ridx < 0.0:
                    ridx = 0.0
                elif ridx > ridx_max:
                    ridx = ridx_max

                r0   = int(ridx)
                frac = ridx - r0       # interpolation weight for r0+1
                f1   = 1.0 - frac      # interpolation weight for r0

                # Bilinear interpolation (column n is exact → no az interpolation)
                out_re[r, n] = f1 * src_re[r0, n] + frac * src_re[r0 + 1, n]
                out_im[r, n] = f1 * src_im[r0, n] + frac * src_im[r0 + 1, n]

    # ── Kernel 2: weighted overlap-add accumulation ───────────────────────
    # Replaces the chunked real/imag Python loop in _accumulate_and_flush.
    #
    # Inputs  (all C-contiguous):
    #   buf      : (na_block, nr_dec, 2) float32  — rolling accumulator (in/out)
    #   wt       : (na_block,)           float32  — weight accumulator   (in/out)
    #   foc_re   : (na_actual, nr_dec)   float32  — real part of focused block,
    #              TRANSPOSED from (nr_dec, na_actual) for stride-1 access
    #   foc_im   : (na_actual, nr_dec)   float32  — imag part, same layout
    #   win      : (na_actual,)          float32  — Hann window weights
    #   lo       : int  — buffer row offset (= az0 - buf_az0, normally 0)
    #   na_actual: int  — number of azimuth lines in this block
    #
    # Parallelism: prange over az (na_actual = up to 4767 tasks).
    # Inner loop over rg (nr_dec = 79504) is sequential:
    #   - foc_re[az, rg] for rg=0..nr_dec-1: stride-1 (perfect sequential read)
    #   - buf[b_az, rg, 0]: stride-2 float32 (8 B) — still cache-friendly
    # No temporary arrays; accumulates directly into the rolling buffer.
    @njit(parallel=True, fastmath=True, cache=True)
    def _nb_accumulate(buf, wt, foc_re, foc_im, win, lo, na_actual):
        nr_dec = foc_re.shape[1]
        for az in prange(na_actual):
            w    = win[az]
            b_az = lo + az
            for rg in range(nr_dec):
                buf[b_az, rg, 0] += foc_re[az, rg] * w
                buf[b_az, rg, 1] += foc_im[az, rg] * w
            wt[b_az] += w

else:
    # Stubs so the rest of the file can always reference these names
    _nb_rcmc       = None
    _nb_accumulate = None


def warmup_numba_kernels():
    """
    Trigger JIT compilation of both Numba kernels using tiny dummy arrays.

    Must be called ONCE in the main process before the processing loop.
    For multiprocessing workers, each worker process calls this automatically
    inside _process_block on its first invocation.

    With cache=True, compilation only happens on the FIRST run ever.
    Subsequent runs load the cached .nbc/.nbi files from __pycache__
    and this function returns in < 0.1 s.

    Without cache (first run): ~5-15 s for both kernels combined.
    """
    if not HAS_NUMBA:
        return
    log.info("Warming up Numba kernels (first run compiles; subsequent runs "
             "load cache — typically < 0.1 s after first compile)…")
    t0 = time.time()

    # Tiny arrays — just enough to trigger compilation of all code paths
    Nr, Na = 16, 32
    sr  = np.zeros((Nr, Na), dtype=np.float32)
    si  = np.zeros((Nr, Na), dtype=np.float32)
    SR  = np.linspace(1000.0, 1100.0, Nr, dtype=np.float64)
    ore = np.empty((Nr, Na), dtype=np.float32)
    oie = np.empty((Nr, Na), dtype=np.float32)
    _nb_rcmc(sr, si, SR, 100.0, 1.0/1000.0, 2.0*1e9/C, ore, oie)

    Na2, Nr2 = 8, 16
    buf = np.zeros((Na2, Nr2, 2), dtype=np.float32)
    wt  = np.zeros(Na2, dtype=np.float32)
    fre = np.zeros((Na2, Nr2), dtype=np.float32)
    fim = np.zeros((Na2, Nr2), dtype=np.float32)
    win = np.ones(Na2, dtype=np.float32)
    _nb_accumulate(buf, wt, fre, fim, win, 0, Na2)

    log.info("Numba warmup done in %.1f s", time.time() - t0)


# ════════════════════════════════════════════════════════════════════════════
# 1.  Metadata
# ════════════════════════════════════════════════════════════════════════════
class Meta:
    """All parameters needed by every worker block."""
    prf: float; fc: float; fs: float
    bw_start: float; bw_stop: float; pulse_width: float; swst: float
    look_angle: float; platform_height: float; flight_speed: float
    beamwidth: float; squint_angle: float
    na_total: int; nr: int; nr_rep: int
    v_mag: np.ndarray; lat: np.ndarray; lon: np.ndarray; alt: np.ndarray
    wavelength: float; dr: float; r_near: float; Vr_eff: float
    decimate_range: int; nr_dec: int; fs_dec: float; dr_dec: float
    r_far_dec: float; r_ref_dec: float; lpf_n_taps: int
    na_syn: int; na_overlap: int; na_valid: int; na_block: int
    ka_ref: float
    replica_dec: np.ndarray
    h5_path: str
    gps_utc_iso: list
    gps_lat_raw: np.ndarray; gps_lon_raw: np.ndarray; gps_alt_raw: np.ndarray
    gps_vx_raw:  np.ndarray; gps_vy_raw:  np.ndarray; gps_vz_raw:  np.ndarray
    scene_start_utc: str; scene_stop_utc: str; reference_utc: str


def load_metadata(h5_path: str,
                  decimate_range: int = 1,
                  valid_lines: Optional[int] = None,
                  na_block_override: Optional[int] = None,
                  na_overlap_override: Optional[int] = None) -> Meta:
    """
    Read HDF5 attributes, interpolate GPS, compute all processing parameters.
    (Identical to V5 — no changes needed here.)
    """
    if not HAS_H5PY:
        raise ImportError("h5py is required: pip install h5py")
    if decimate_range < 1:
        raise ValueError("decimate_range must be >= 1")

    m = Meta()
    m.h5_path = h5_path

    with h5py.File(h5_path, 'r') as f:
        grp = f['ST0'];  a = grp.attrs
        m.prf             = float(a['PRF'])
        m.fc              = float(a['Carrier Frequency'])
        m.fs              = float(a['Sampling Frequency'])
        m.bw_start        = float(a['Chirp baseband start'])
        m.bw_stop         = float(a['Chirp baseband stop'])
        m.pulse_width     = float(a['Pulse Width'])
        m.swst            = float(a['Sampling Window Start Time'])
        m.look_angle      = float(a['Look Angle'])
        m.platform_height = float(a['Platform Height'])
        m.flight_speed    = float(a['Flight Speed'])
        m.beamwidth       = float(a['Beamwidth'])
        m.squint_angle    = float(a['Squint Angle'])
        raw_ds            = grp['Raw data']
        m.na_total        = int(raw_ds.shape[0])
        m.nr              = int(raw_ds.shape[1])
        rep_raw           = grp['Replica'][:]
        m.nr_rep          = int(rep_raw.shape[0])
        gps               = grp['GPSDATA_HQ'][:]

        def _read_utc_attr(group, key):
            try:   return str(group.attrs[key])
            except KeyError: return str(group.parent.attrs.get(key, ''))

        m.reference_utc   = _read_utc_attr(grp, 'Reference UTC')
        m.scene_start_utc = _read_utc_attr(grp, 'Scene Sensing Start UTC')
        m.scene_stop_utc  = _read_utc_attr(grp, 'Scene Sensing Stop UTC')

    n_gps   = gps.shape[0]
    gps_idx = np.linspace(0, m.na_total - 1, n_gps)
    pidx    = np.arange(m.na_total, dtype=np.float64)
    def _interp(col):
        return interp1d(gps_idx, col, kind='cubic',
                        fill_value='extrapolate')(pidx)
    vx = _interp(gps[:, 8]); vy = _interp(gps[:, 9]); vz = _interp(gps[:, 10])
    m.v_mag = np.sqrt(vx**2 + vy**2 + vz**2).astype(np.float32)
    m.lat   = _interp(gps[:, 1]).astype(np.float32)
    m.lon   = _interp(gps[:, 2]).astype(np.float32)
    m.alt   = _interp(gps[:, 3]).astype(np.float32)

    _ref_str = m.reference_utc.strip()
    try:
        _ref_dt = datetime.fromisoformat(_ref_str.replace(' ', 'T'))
        if _ref_dt.tzinfo is None:
            _ref_dt = _ref_dt.replace(tzinfo=UTC)
    except Exception:
        _ref_dt = datetime(2000, 1, 1, tzinfo=UTC)
    m.gps_utc_iso = [
        (_ref_dt + timedelta(seconds=float(gps[i, 0]))
         ).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z'
        for i in range(gps.shape[0])
    ]
    m.gps_lat_raw = gps[:, 1].astype(np.float64)
    m.gps_lon_raw = gps[:, 2].astype(np.float64)
    m.gps_alt_raw = gps[:, 3].astype(np.float64)
    m.gps_vx_raw  = gps[:, 8].astype(np.float64)
    m.gps_vy_raw  = gps[:, 9].astype(np.float64)
    m.gps_vz_raw  = gps[:, 10].astype(np.float64)

    m.wavelength = C / m.fc
    m.dr         = C / (2.0 * m.fs)
    m.r_near     = C * m.swst / 2.0
    m.Vr_eff     = m.flight_speed * np.sqrt(Re / (Re + m.platform_height))

    D                = int(decimate_range)
    m.decimate_range = D
    m.nr_dec         = m.nr // D
    m.fs_dec         = m.fs / D
    m.dr_dec         = C / (2.0 * m.fs_dec)
    m.r_far_dec      = m.r_near + (m.nr_dec - 1) * m.dr_dec
    m.r_ref_dec      = m.r_near + (m.nr_dec // 2) * m.dr_dec
    m.lpf_n_taps     = 129 if D > 1 else 0

    chirp_bw = abs(m.bw_stop - m.bw_start)
    if chirp_bw > m.fs_dec / 2.0 * 1.05:
        max_safe = max(0, int(m.fs / (2 * chirp_bw)))
        log.warning("Chirp BW %.0f MHz > decimated Nyquist %.0f MHz (D=%d). "
                    "Max safe D = %d.", chirp_bw/1e6, m.fs_dec/2/1e6, D, max_safe)

    m.ka_ref = 2.0 * m.Vr_eff**2 / (m.wavelength * m.r_ref_dec)

    theta    = np.radians(m.beamwidth)
    na_syn_f = m.prf * theta * m.r_far_dec / m.Vr_eff
    m.na_syn = int(np.ceil(na_syn_f))

    _na_ov = na_overlap_override if na_overlap_override is not None else m.na_syn
    _step  = valid_lines if valid_lines is not None else 1000
    if na_block_override is not None:
        m.na_block   = int(na_block_override)
        m.na_overlap = int(_na_ov)
        m.na_valid   = m.na_block - m.na_overlap
        if m.na_valid <= 0:
            raise ValueError(
                f"na_block_override ({m.na_block}) must be > na_overlap ({m.na_overlap})")
    else:
        m.na_overlap = int(_na_ov)
        m.na_valid   = int(_step)
        m.na_block   = m.na_overlap + m.na_valid

    rep_full = (rep_raw[:, 0].astype(np.float64)
                + 1j * rep_raw[:, 1].astype(np.float64))
    m.replica_dec = (_decimate_replica(rep_full, D, m.lpf_n_taps)
                     if D > 1 else rep_full.astype(np.complex64))

    log.info("Metadata: na_total=%d  nr=%d→%d(D=%d)  "
             "na_syn=%d  overlap=%d  step=%d  na_block=%d  "
             "R_near=%.0f  R_far=%.0f  Vr_eff=%.3f",
             m.na_total, m.nr, m.nr_dec, D,
             m.na_syn, m.na_overlap, m.na_valid, m.na_block,
             m.r_near, m.r_far_dec, m.Vr_eff)
    return m


def _decimate_replica(replica: np.ndarray, D: int, n_taps: int) -> np.ndarray:
    cutoff = max(0.01, min(0.99, 1.0 / D - 0.1))
    h      = firwin(n_taps, cutoff)
    delay  = (n_taps - 1) // 2
    padded = np.concatenate([replica, np.zeros(delay, dtype=replica.dtype)])
    fr     = lfilter(h, 1.0, padded.real)
    fi     = lfilter(h, 1.0, padded.imag)
    return (fr[delay::D] + 1j * fi[delay::D]).astype(np.complex64)


# ════════════════════════════════════════════════════════════════════════════
# 2.  Range compression  (scipy.fft, batched — unchanged from V5)
# ════════════════════════════════════════════════════════════════════════════
def range_compress(s: np.ndarray, replica_dec: np.ndarray,
                   az_batch: int = 128) -> np.ndarray:
    """Linear matched-filter range compression, az-column batched."""
    Nrg, Naz = s.shape
    Nrep     = len(replica_dec)
    mf       = np.conj(replica_dec[::-1])
    Nfft     = _next_fast_len(Nrg + Nrep - 1)
    MF       = _fft(mf, n=Nfft)
    crop_lo  = Nrep - 1
    crop_hi  = Nrep - 1 + Nrg
    out      = np.empty((Nrg, Naz), dtype=np.complex64)

    for c0 in range(0, Naz, az_batch):
        c1         = min(c0 + az_batch, Naz)
        S_batch    = _fft(s[:, c0:c1], n=Nfft, axis=0)
        rc_batch   = _ifft(S_batch * MF[:, np.newaxis], axis=0)
        out[:, c0:c1] = rc_batch[crop_lo:crop_hi, :].astype(np.complex64)
        del S_batch, rc_batch

    return out


# ════════════════════════════════════════════════════════════════════════════
# 3.  Doppler centroid  (unchanged from V5)
# ════════════════════════════════════════════════════════════════════════════
def estimate_fdc_profile(src_rc: np.ndarray, prf: float,
                         smooth_len: int = 101) -> np.ndarray:
    """Per-line pulse-pair cross-correlation, Savitzky-Golay smoothed."""
    Nrg, Naz = src_rc.shape
    if Naz < 2:
        return np.zeros(Naz)
    corr = np.sum(src_rc[:, 1:] * np.conj(src_rc[:, :-1]), axis=0)
    fdc  = (prf / (2.0 * np.pi)) * np.angle(corr)
    fdc  = np.concatenate([fdc[:1], fdc])
    wl   = min(smooth_len | 1, (len(fdc) // 2) * 2 + 1)
    if wl >= 3:
        fdc = savgol_filter(fdc, window_length=wl, polyorder=5, mode='nearest')
    return fdc.astype(np.float64)


# ════════════════════════════════════════════════════════════════════════════
# 4.  Deramping  (unchanged from V5 — numpy broadcast already optimal)
# ════════════════════════════════════════════════════════════════════════════
def remove_time_varying_fdc(src_rc: np.ndarray,
                            fdc_profile: np.ndarray,
                            prf: float) -> Tuple[np.ndarray, float]:
    """Multiply by exp(-j·2π·cumsum(fdc)/PRF). Returns (deramped, mean_fdc)."""
    phi   = 2.0 * np.pi * np.cumsum(fdc_profile) / prf
    demod = np.exp(-1j * phi).astype(np.complex64)
    return (src_rc * demod[np.newaxis, :]), float(np.mean(fdc_profile))


# ════════════════════════════════════════════════════════════════════════════
# 5.  RCMC  — Numba fast path + V5 Python fallback
# ════════════════════════════════════════════════════════════════════════════
def rcmc_time_domain(src: np.ndarray, SR: np.ndarray,
                     Vr: float, fs: float, prf: float,
                     rng_strip: int = 4096) -> np.ndarray:
    """
    Range Cell Migration Correction.

    Numba path  (HAS_NUMBA=True):
      Calls _nb_rcmc — a prange-parallel bilinear kernel with NO temporary
      array allocations inside the loop.  Steps:
        1. Extract src.real and src.imag into contiguous float32 arrays
           (2 x Nrg x Naz x 4 B ≈ 2 x 1.5 GB).  These are the only
           allocations in this function.
        2. Pre-allocate output re/im arrays (same size).
        3. Call _nb_rcmc — all 32 cores, no Python overhead.
        4. Reassemble complex64 output.

      Total peak extra RAM: ~6 GB (vs ~24 GB temporary churn in V5).
      Time: ~0.1-0.5 s (vs 10-30 s in V5).

    Python fallback (HAS_NUMBA=False):
      Identical to V5 map_coordinates strip loop.

    rng_strip : only used by the Python fallback.
    """
    if HAS_NUMBA:
        Nrg, Naz = src.shape
        # Separate re/im into contiguous float32 (copies from interleaved complex64)
        src_re = np.ascontiguousarray(src.real, dtype=np.float32)  # ~1.5 GB
        src_im = np.ascontiguousarray(src.imag, dtype=np.float32)  # ~1.5 GB
        out_re = np.empty((Nrg, Naz), dtype=np.float32)
        out_im = np.empty((Nrg, Naz), dtype=np.float32)

        SR64         = np.ascontiguousarray(SR, dtype=np.float64)
        inv_prf      = 1.0 / prf
        two_fs_over_C = 2.0 * fs / C

        _nb_rcmc(src_re, src_im, SR64, Vr, inv_prf, two_fs_over_C, out_re, out_im)

        # Reassemble complex64 — fuse into one allocation
        out = np.empty((Nrg, Naz), dtype=np.complex64)
        out.real[:] = out_re
        out.imag[:] = out_im
        del src_re, src_im, out_re, out_im
        return out

    # ── Python fallback (V5 map_coordinates) ─────────────────────────────
    Nrg, Naz = src.shape
    t_az     = np.arange(Naz, dtype=np.float64) / prf
    t_end       = (Naz - 1) / prf
    delta_R_max = float(np.sqrt(SR.min()**2 + (Vr * t_end)**2) - SR.min())
    r_guard     = int(np.ceil(2.0 * delta_R_max / C * fs)) + 8
    col_idx     = np.arange(Naz, dtype=np.float64)
    out         = np.empty_like(src)

    for r0 in range(0, Nrg, rng_strip):
        r1   = min(r0 + rng_strip, Nrg)
        r0e  = max(0, r0 - r_guard)
        r1e  = min(Nrg, r1 + r_guard)
        strip_r = np.ascontiguousarray(src[r0e:r1e].real, dtype=np.float32)
        strip_i = np.ascontiguousarray(src[r0e:r1e].imag, dtype=np.float32)
        SR_out = SR[r0:r1]
        R_t    = np.sqrt(SR_out[:, None]**2 + (Vr * t_az[None, :])**2)
        shift  = (2.0 * (R_t - SR_out[:, None]) / C) * fs
        row    = np.arange(r0, r1, dtype=np.float64)[:, None] - r0e + shift
        col    = np.broadcast_to(col_idx[None, :], row.shape).copy()
        coords = [row.ravel(), col.ravel()]
        rp = _map_coords(strip_r, coords, order=1, mode='nearest', prefilter=False)
        ip = _map_coords(strip_i, coords, order=1, mode='nearest', prefilter=False)
        out[r0:r1] = (rp + 1j * ip).reshape(r1 - r0, Naz).astype(np.complex64)
        del strip_r, strip_i, R_t, shift, row, col, rp, ip

    return out


# ════════════════════════════════════════════════════════════════════════════
# 6.  Azimuth compression  (scipy.fft, range-chunked — unchanged from V5)
# ════════════════════════════════════════════════════════════════════════════
def azimuth_compress(src: np.ndarray, prf: float, Vr: float,
                     wavelength: float, SR: np.ndarray,
                     rng_chunk: int = 1024) -> np.ndarray:
    """
    Time-domain quadratic azimuth matched filter, range-bin chunked.
    h(t) = exp(-j·π·Ka_neg·t²), FFT-convolution padded to nextpow2(2·Naz).
    """
    Nrg, Naz = src.shape
    t      = np.arange(Naz, dtype=np.float64) / prf
    L      = 1 << int(np.ceil(np.log2(2 * Naz)))
    Ka_neg = -2.0 * Vr**2 / (wavelength * SR)
    out    = np.empty((Nrg, Naz), dtype=np.complex64)

    for r0 in range(0, Nrg, rng_chunk):
        r1   = min(r0 + rng_chunk, Nrg)
        Ka_c = Ka_neg[r0:r1, np.newaxis]
        h0   = np.exp(-1j * np.pi * Ka_c * t[np.newaxis, :]**2)
        H    = _fft(h0, n=L, axis=1)
        X    = _fft(src[r0:r1], n=L, axis=1)
        Y    = _ifft(X * H, axis=1)
        out[r0:r1] = Y[:, :Naz].astype(np.complex64)
        del h0, H, X, Y

    return out


# ════════════════════════════════════════════════════════════════════════════
# 7.  Block schedule  (unchanged from V5)
# ════════════════════════════════════════════════════════════════════════════
def _build_block_schedule(na_total: int, na_block: int,
                          step: int) -> List[dict]:
    N_runs = math.ceil((na_total - na_block) / step) + 1
    blocks = []
    for k in range(N_runs):
        az0 = k * step
        az1 = az0 + na_block
        if az1 > na_total:
            az0 = max(0, na_total - na_block)
            az1 = na_total
        blocks.append(dict(block_idx=k, az0=az0, az1=az1))
        if az1 >= na_total:
            break
    return blocks


# ════════════════════════════════════════════════════════════════════════════
# 8.  Block worker  (multiprocessing-safe)
# ════════════════════════════════════════════════════════════════════════════

# Flag so each spawned worker process warms up Numba exactly once
_WORKER_NUMBA_WARMED = False

def _process_block(args: dict) -> Tuple[int, int, np.ndarray, float]:
    """
    Full SAR processing pipeline for one azimuth block.

    When using multiprocessing (--workers N), each worker process calls
    warmup_numba_kernels() on its first block so the JIT cache is loaded.
    The global _WORKER_NUMBA_WARMED flag prevents repeated warmup calls.

    Returns (block_idx, az0, focused, fdc_mean).
    focused.shape = (nr_dec, na_actual) complex64.
    """
    global _WORKER_NUMBA_WARMED
    if HAS_NUMBA and not _WORKER_NUMBA_WARMED:
        n_threads = args.get('n_threads', 0)
        if n_threads > 0:
            numba.set_num_threads(n_threads)
        warmup_numba_kernels()
        _WORKER_NUMBA_WARMED = True

    az0         = args['az0']
    az1         = args['az1']
    nr_dec      = args['nr_dec']
    prf         = args['prf']
    r_near      = args['r_near']
    dr_dec      = args['dr_dec']
    fs_dec      = args['fs_dec']
    wavelength  = args['wavelength']
    Vr_eff      = args['Vr_eff']
    ht          = args['platform_height']
    v_mag       = args['v_mag']
    D           = args['decimate_range']
    replica_dec = args['replica_dec']
    smooth_len  = args['smooth_len']
    rng_chunk   = args['rng_chunk']
    az_batch    = args['az_batch']

    with h5py.File(args['h5_path'], 'r') as f:
        chunk = f['ST0/Raw data'][az0:az1, :, :]
    na_actual = chunk.shape[0]
    s = (chunk[:, :, 0].astype(np.float32)
       + 1j * chunk[:, :, 1].astype(np.float32)).T
    del chunk

    if D > 1:
        s = resample_poly(s, up=1, down=D, axis=0).astype(np.complex64)

    rc = range_compress(s, replica_dec, az_batch=az_batch)
    del s

    v_block = float(np.mean(v_mag[az0:az1])) if na_actual > 0 else Vr_eff
    Vr      = v_block * np.sqrt(Re / (Re + ht))

    fdc_profile = estimate_fdc_profile(rc, prf, smooth_len=smooth_len)
    rc_deramp, fdc_mean = remove_time_varying_fdc(rc, fdc_profile, prf)
    del rc

    SR      = np.ascontiguousarray(
        (r_near + np.arange(nr_dec) * dr_dec).astype(np.float64))
    rc_rcmc = rcmc_time_domain(rc_deramp, SR, Vr, fs_dec, prf)
    del rc_deramp

    focused = azimuth_compress(rc_rcmc, prf, Vr, wavelength, SR,
                               rng_chunk=rng_chunk)
    del rc_rcmc
    return args['block_idx'], az0, focused, fdc_mean


# ════════════════════════════════════════════════════════════════════════════
# 9.  SAR Processor
# ════════════════════════════════════════════════════════════════════════════
class SARProcessor:
    """
    Orchestrates block processing, rolling-buffer accumulation, and output.
    Identical structure to V5; accumulation uses Numba when available.
    """

    def __init__(self, h5_path: str, output_dir: str,
                 workers: int = 1,
                 n_threads: int = 0,
                 decimate_range: int = 1,
                 valid_lines: Optional[int] = None,
                 na_block_override: Optional[int] = None,
                 na_overlap_override: Optional[int] = None,
                 rng_chunk: int = 1024,
                 az_batch: int = 128,
                 vmin_db: float = -60.0,
                 vmax_db: float = -5.0):
        self.workers   = workers
        self.n_threads = n_threads
        self.rng_chunk = rng_chunk
        self.az_batch  = az_batch
        self.vmin_db   = vmin_db
        self.vmax_db   = vmax_db
        self.out_dir   = Path(output_dir)
        os.makedirs(self.out_dir, exist_ok=True)

        # Set Numba thread count and warm up JIT before loading metadata
        if HAS_NUMBA:
            if n_threads > 0:
                numba.set_num_threads(n_threads)
                log.info("Numba threads set to %d", n_threads)
            else:
                log.info("Numba using default %d thread(s)",
                         numba.get_num_threads())
            warmup_numba_kernels()

        self.meta = load_metadata(h5_path,
                                  decimate_range=decimate_range,
                                  valid_lines=valid_lines,
                                  na_block_override=na_block_override,
                                  na_overlap_override=na_overlap_override)
        m = self.meta
        self.schedule = _build_block_schedule(m.na_total, m.na_block, m.na_valid)
        log.info("Schedule: %d blocks  overlap=%d  step=%d  na_block=%d",
                 len(self.schedule), m.na_overlap, m.na_valid, m.na_block)

    # ─────────────────────────────────────────────────────────────────────────
    def run(self) -> dict:
        """
        Process all blocks and incrementally write the SLC GeoTIFF.
        Rolling-buffer + bounded-queue logic unchanged from V5.
        Accumulation dispatches to Numba kernel when HAS_NUMBA.
        """
        m       = self.meta
        out_slc = self.out_dir / "SLC_complex.tif"
        out_ql  = self.out_dir / "QuickLook.png"
        out_xml = self.out_dir / "SLC_metadata.xml"

        n_blk = len(self.schedule)
        win   = tukey(m.na_block, alpha=0.75).astype(np.float32)

        t0    = time.time()
        fdc_log: Dict[int, float] = {}

        buf     = np.zeros((m.na_block, m.nr_dec, 2), dtype=np.float32)
        wt      = np.zeros(m.na_block, dtype=np.float32)
        buf_az0 = 0
        written = 0

        gb_buf = m.na_block * m.nr_dec * 2 * 4 / 1e9
        log.info("Rolling buffer: %.2f GB  (%d az x %d rg x 2 bands)",
                 gb_buf, m.na_block, m.nr_dec)

        base = dict(
            h5_path         = m.h5_path,
            nr              = m.nr,
            nr_dec          = m.nr_dec,
            prf             = m.prf,
            r_near          = m.r_near,
            dr_dec          = m.dr_dec,
            fs_dec          = m.fs_dec,
            wavelength      = m.wavelength,
            Vr_eff          = m.Vr_eff,
            platform_height = m.platform_height,
            v_mag           = m.v_mag,
            decimate_range  = m.decimate_range,
            replica_dec     = m.replica_dec,
            smooth_len      = 101,
            rng_chunk       = self.rng_chunk,
            az_batch        = self.az_batch,
            n_threads       = self.n_threads,
        )

        log.info("Opening GeoTIFF for incremental strip writing…")
        tif_writer = _TiffStripWriter(str(out_slc), m.na_total, m.nr_dec,
                                      m.dr_dec, m.prf)

        # ─────────────────────────────────────────────────────────────────
        def _accumulate_and_flush(k: int, az0: int,
                                  focused: np.ndarray, fdc: float) -> None:
            """
            Accumulate one focused block into the rolling buffer, then flush
            all newly finalised lines to the output GeoTIFF.

            Numba path:
              1. Transpose focused → (na_actual, nr_dec) C-contiguous
                 for stride-1 range access inside _nb_accumulate.
              2. Separate re/im float32 for the kernel signature.
              3. Single _nb_accumulate call — prange over na_actual.

            Python fallback:
              Chunked range loop (identical to V5).
            """
            nonlocal buf_az0, written

            fdc_log[k] = fdc
            na_actual  = focused.shape[1]
            lo         = az0 - buf_az0      # == 0 by rolling invariant
            w          = win[:na_actual]
            nr_dec     = focused.shape[0]

            if HAS_NUMBA:
                # Transpose to (na_actual, nr_dec) for stride-1 range access
                # np.ascontiguousarray(focused.T) does a transposing copy
                foc_T  = np.ascontiguousarray(focused.T)     # ~3 GB copy
                foc_re = np.ascontiguousarray(foc_T.real.astype(np.float32))
                foc_im = np.ascontiguousarray(foc_T.imag.astype(np.float32))
                del foc_T
                _nb_accumulate(buf, wt, foc_re, foc_im, w, lo, na_actual)
                del foc_re, foc_im
            else:
                # Python fallback: chunked real/imag loop (V5)
                for r0 in range(0, nr_dec, _ACC_RCHUNK):
                    r1      = min(r0 + _ACC_RCHUNK, nr_dec)
                    f_chunk = focused[r0:r1, :na_actual]
                    re_T    = f_chunk.real.T.astype(np.float32)
                    im_T    = f_chunk.imag.T.astype(np.float32)
                    buf[lo:lo + na_actual, r0:r1, 0] += re_T * w[:, np.newaxis]
                    buf[lo:lo + na_actual, r0:r1, 1] += im_T * w[:, np.newaxis]
                    del re_T, im_T
                wt[lo:lo + na_actual] += w

            del focused

            # ── Flush finalised lines ──────────────────────────────────────
            flush_end = (min(self.schedule[k + 1]['az0'], m.na_total)
                         if k + 1 < n_blk else m.na_total)

            if flush_end <= written:
                return

            n_flush = flush_end - written
            lo_f    = written - buf_az0

            slab_f  = buf[lo_f : lo_f + n_flush].copy()
            safe_wt = np.maximum(wt[lo_f : lo_f + n_flush], 1e-6)
            slab_f /= safe_wt[:, np.newaxis, np.newaxis]
            tif_writer.write_strip(slab_f, written)
            del slab_f

            remain = m.na_block - n_flush
            if remain > 0:
                buf[:remain] = buf[n_flush : m.na_block].copy()
                wt[:remain]  = wt[n_flush  : m.na_block].copy()
            buf[remain:] = 0.0
            wt[remain:]  = 0.0
            buf_az0 = flush_end
            written = flush_end

            done  = k + 1
            eta   = ((time.time() - t0) / done * (n_blk - done)
                     if done < n_blk else 0.0)
            log.info("[%d/%d]  az %d-%d  fdc=%.1f Hz  written=%d  ETA %.0fs",
                     done, n_blk, az0, az0 + na_actual, fdc, written, eta)

        # ── Block dispatch ─────────────────────────────────────────────────
        if self.workers == 1:
            for k, blk in enumerate(self.schedule):
                _, az0, focused, fdc = _process_block({**base, **blk})
                _accumulate_and_flush(k, az0, focused, fdc)
        else:
            self._run_parallel(base, n_blk, _accumulate_and_flush)

        tif_writer.close()
        log.info("Processing done in %.1f s", time.time() - t0)
        fdc_mean = float(np.mean(list(fdc_log.values()))) if fdc_log else 0.0

        '''
        log.info("Generating quicklook…")
        ql_written = _write_quicklook_from_slc(
            str(out_slc), str(out_ql),
            vmin_db=self.vmin_db, vmax_db=self.vmax_db)
        '''
        write_metadata_xml(m, fdc_mean, fdc_log, n_blk, str(out_xml))
        log.info("Done → %s", self.out_dir)
        result = {'slc': str(out_slc), 'xml': str(out_xml)}
        #if ql_written:
        #    result['quicklook'] = str(out_ql)
        return result

    # ─────────────────────────────────────────────────────────────────────────
    def _run_parallel(self, base: dict, n_blk: int, drain_fn) -> None:
        """
        Bounded-queue parallel dispatch — identical to V5.
        At most (workers + _QUEUE_HEADROOM) focused blocks in RAM simultaneously.
        """
        MAX_QUEUED = self.workers + _QUEUE_HEADROOM
        schedule   = self.schedule
        pending: Dict[int, tuple]                          = {}
        fut_to_k:  Dict[concurrent.futures.Future, int]   = {}
        submitted  = 0
        next_drain = 0

        with ProcessPoolExecutor(max_workers=self.workers) as pool:
            while submitted < min(MAX_QUEUED, n_blk):
                blk = schedule[submitted]
                fut = pool.submit(_process_block, {**base, **blk})
                fut_to_k[fut] = submitted
                submitted += 1

            while next_drain < n_blk:
                done, _ = concurrent.futures.wait(
                    fut_to_k.keys(),
                    return_when=concurrent.futures.FIRST_COMPLETED)

                for fut in done:
                    k = fut_to_k.pop(fut)
                    bidx, az0, focused, fdc = fut.result()
                    pending[k] = (az0, focused, fdc)
                    if submitted < n_blk:
                        blk     = schedule[submitted]
                        new_fut = pool.submit(_process_block, {**base, **blk})
                        fut_to_k[new_fut] = submitted
                        submitted += 1

                while next_drain in pending:
                    az0_p, foc_p, fdc_p = pending.pop(next_drain)
                    drain_fn(next_drain, az0_p, foc_p, fdc_p)
                    next_drain += 1


# ════════════════════════════════════════════════════════════════════════════
# 10. Incremental GeoTIFF strip writer  (unchanged from V5)
# ════════════════════════════════════════════════════════════════════════════
class _TiffStripWriter:
    def __init__(self, path: str, n_rows: int, n_cols: int,
                 dr: float, prf: float):
        self.path = path; self.n_rows = n_rows; self.n_cols = n_cols
        self._dst = None; self._fp = None

        if HAS_RASTERIO:
            big = n_rows * n_cols * 2 * 4 > 4e9
            kw  = dict(driver='GTiff', height=n_rows, width=n_cols, count=2,
                       dtype='float32', compress='zstd', zstd_level=9,
                       predictor=2, bigtiff='YES' if big else 'NO')
            self._dst = rasterio.open(path, 'w', **kw)
            log.info("Opened GeoTIFF for incremental writing: %s", path)
        else:
            raw_path = path.replace('.tif', '.bin')
            self._fp = open(raw_path, 'wb')
            self._raw_path = raw_path
            self._hdr_path = raw_path + '.hdr'
            log.warning("rasterio not available — writing raw BIP binary: %s",
                        raw_path)

    def write_strip(self, slab: np.ndarray, row_start: int) -> None:
        n = slab.shape[0]
        if self._dst is not None:
            win = rasterio.windows.Window(0, row_start, self.n_cols, n)
            self._dst.write(slab[:, :, 0].astype(np.float32), 1, window=win)
            self._dst.write(slab[:, :, 1].astype(np.float32), 2, window=win)
        else:
            slab.astype(np.float32).tofile(self._fp)

    def close(self) -> None:
        if self._dst is not None:
            self._dst.close(); self._dst = None
            log.info("GeoTIFF closed: %s", self.path)
        if self._fp is not None:
            self._fp.close()
            with open(self._hdr_path, 'w') as fh:
                fh.write(f"ENVI\nsamples = {self.n_cols}\nlines = {self.n_rows}\n"
                         "bands = 2\ndata type = 4\ninterleave = bip\n"
                         "byte order = 0\nband names = {real, imaginary}\n")
            self._fp = None


# ════════════════════════════════════════════════════════════════════════════
# 11. Quicklook  (two-pass strip reader — unchanged from V5)
# ════════════════════════════════════════════════════════════════════════════
def _write_quicklook_from_slc(slc_path: str, ql_path: str,
                               vmin_db: float = -60.0,
                               vmax_db: float = -5.0,
                               strip_rows: int = 512,
                               max_px: int = 8192) -> bool:
    if not HAS_MPL or not HAS_RASTERIO:
        return False
    with rasterio.open(slc_path) as src:
        n_rows, n_cols = src.height, src.width
        ds = max(1, max(n_rows, n_cols) // max_px)
        gmax = 0.0
        for r0 in range(0, n_rows, strip_rows):
            r1  = min(r0 + strip_rows, n_rows)
            win = rasterio.windows.Window(0, r0, n_cols, r1 - r0)
            re  = src.read(1, window=win).astype(np.float32)
            im  = src.read(2, window=win).astype(np.float32)
            gmax = max(gmax, float(np.sqrt(re**2 + im**2).max()))
        if gmax <= 0.0:
            return False
        segs = []
        with np.errstate(divide='ignore', invalid='ignore'):
            for r0 in range(0, n_rows, strip_rows):
                r1  = min(r0 + strip_rows, n_rows)
                win = rasterio.windows.Window(0, r0, n_cols, r1 - r0)
                re  = src.read(1, window=win).astype(np.float32)[:, ::ds]
                im  = src.read(2, window=win).astype(np.float32)[:, ::ds]
                amp = np.sqrt(re**2 + im**2)
                db  = 20.0 * np.log10(np.maximum(amp / gmax, 1e-30))
                segs.append(np.clip(db, vmin_db, vmax_db)[::ds])
    db_img = np.vstack(segs)
    plt.imsave(ql_path, db_img, cmap='gray', vmin=vmin_db, vmax=vmax_db)
    log.info("Quicklook → %s  (%dx%d px)", ql_path, db_img.shape[0], db_img.shape[1])
    return True


# ════════════════════════════════════════════════════════════════════════════
# 12. Minimal TIFF fallback
# ════════════════════════════════════════════════════════════════════════════
def _write_minimal_tiff(data, out_path, n_bands):
    rows = data.shape[0]; cols = data.shape[1]
    if rows * cols * n_bands * 4 > 3.5e9:
        raw = out_path.replace('.tif', '.bin')
        data.astype(np.float32).tofile(raw)
        with open(out_path + '.hdr', 'w') as fh:
            fh.write(f"ENVI\nsamples={cols}\nlines={rows}\nbands={n_bands}\n"
                     "data type=4\ninterleave=bsq\nbyte order=0\n")
        return
    sbs = cols * n_bands * 4; ns = rows
    tg  = [(256,4,1,cols),(257,4,1,rows),(258,3,1,32),(259,3,1,1),
           (262,3,1,1),(277,3,1,n_bands),(284,3,1,1),(339,3,1,3)]
    nt  = len(tg)+2; h0 = 8; ids = 2+nt*12+4
    oso = h0+ids; osc = oso+ns*4; oi = osc+ns*4
    sa  = np.array([oi+i*sbs for i in range(ns)], dtype=np.uint32)
    sc  = np.full(ns, sbs, dtype=np.uint32)
    with open(out_path, 'wb') as fh:
        fh.write(b'II\x2A\x00'); fh.write(struct.pack('<I', h0))
        fh.write(struct.pack('<H', nt))
        for t,tt,c,v in tg: fh.write(struct.pack('<HHII', t,tt,c,v))
        fh.write(struct.pack('<HHII',273,4,ns,oso))
        fh.write(struct.pack('<HHII',279,4,ns,osc))
        fh.write(struct.pack('<I',0))
        fh.write(sa.tobytes()); fh.write(sc.tobytes())
        for row in range(rows):
            if n_bands == 1:
                fh.write(data[row].astype(np.float32).tobytes())
            else:
                d = np.empty(cols*2, dtype=np.float32)
                d[0::2] = data[row,:,0]; d[1::2] = data[row,:,1]
                fh.write(d.tobytes())


# ════════════════════════════════════════════════════════════════════════════
# 13. XML metadata writer
# ════════════════════════════════════════════════════════════════════════════
def write_metadata_xml(m: Meta, fdc_mean: float, fdc_log: dict,
                       n_blocks: int, out_path: str):
    root = ET.Element("SARProcessingMetadata", version='7.0',
                      created=datetime.now(UTC).isoformat().replace('+00:00', 'Z'))
    def sub(parent, tag, text=None, **attrs):
        el = ET.SubElement(parent, tag, attrib=attrs)
        if text is not None: el.text = str(text)
        return el

    pi = sub(root,'ProductInfo')
    sub(pi,'ProductType','SLC'); sub(pi,'ProcessingLevel','L1')
    sub(pi,'Processor','sar_rda_processorV7.py v7.0')
    sub(pi,'ProcessingDate', datetime.now(UTC).isoformat().replace('+00:00','Z'))
    sub(pi,'InputFile', m.h5_path)
    sub(pi,'NumbaAcceleration', 'YES' if HAS_NUMBA else 'NO (pip install numba)')

    ins = sub(root,'Instrument')
    sub(ins,'CarrierFrequency', f'{m.fc:.6e}',            unit='Hz')
    sub(ins,'Wavelength',       f'{m.wavelength:.6f}',    unit='m')
    sub(ins,'PRF',              f'{m.prf:.4f}',           unit='Hz')
    sub(ins,'SamplingFrequency',f'{m.fs:.6e}',            unit='Hz')
    sub(ins,'PulseWidth',       f'{m.pulse_width:.2e}',   unit='s')
    sub(ins,'ChirpBandwidth',   f'{abs(m.bw_stop-m.bw_start):.4e}', unit='Hz')
    sub(ins,'BeamwidthAzimuth', f'{m.beamwidth:.4f}',    unit='deg')
    sub(ins,'LookAngle',        f'{m.look_angle:.4f}',    unit='deg')
    sub(ins,'SquintAngle',      f'{m.squint_angle:.6f}',  unit='deg')

    acq = sub(root,'Acquisition')
    sub(acq,'PlatformHeight', f'{m.platform_height:.2f}', unit='m')
    sub(acq,'FlightSpeed',    f'{m.flight_speed:.4f}',    unit='m/s')
    sub(acq,'Vr_eff',         f'{m.Vr_eff:.4f}',         unit='m/s')
    sub(acq,'SlantRangeNear', f'{m.r_near:.4f}',          unit='m')
    sub(acq,'SlantRangeFar',  f'{m.r_far_dec:.4f}',       unit='m')
    sub(acq,'SlantRangeMid',  f'{m.r_ref_dec:.4f}',       unit='m')
    sub(acq,'SWST',           f'{m.swst:.6e}',             unit='s')
    gp = sub(acq,'GPS')
    sub(gp,'MeanLat', f'{float(np.mean(m.lat)):.6f}', unit='deg')
    sub(gp,'MeanLon', f'{float(np.mean(m.lon)):.6f}', unit='deg')
    sub(gp,'MeanAlt', f'{float(np.mean(m.alt)):.2f}', unit='m')

    timing = sub(root,'SceneTiming')
    sub(timing,'ReferenceUTC',        m.reference_utc)
    sub(timing,'SceneSensingStartUTC',m.scene_start_utc)
    sub(timing,'SceneSensingStopUTC', m.scene_stop_utc)
    sub(timing,'FirstLineUTC', m.gps_utc_iso[0] if m.gps_utc_iso else '')
    sub(timing,'LastLineUTC',  m.gps_utc_iso[-1] if m.gps_utc_iso else '')

    orb = sub(root,'orbitList', count=str(len(m.gps_utc_iso)),
              source='GPSDATA_HQ',
              note='Vx/Vy/Vz are NED (North/East/Down) m/s as stored in HDF5')
    for i, utc in enumerate(m.gps_utc_iso):
        sv = sub(orb, 'orbit')
        sub(sv, 'time', utc)
        pos = sub(sv, 'position', unit='deg_m')
        sub(pos, 'lat', f'{m.gps_lat_raw[i]:.8f}')
        sub(pos, 'lon', f'{m.gps_lon_raw[i]:.8f}')
        sub(pos, 'alt', f'{m.gps_alt_raw[i]:.3f}')
        vel = sub(sv, 'velocity', unit='m/s', frame='NED')
        sub(vel, 'vx', f'{m.gps_vx_raw[i]:.6f}')
        sub(vel, 'vy', f'{m.gps_vy_raw[i]:.6f}')
        sub(vel, 'vz', f'{m.gps_vz_raw[i]:.6f}')

    proc = sub(root,'Processing')
    d = sub(proc,'RangeDecimation')
    sub(d,'Factor', str(m.decimate_range))
    sub(d,'Applied','YES' if m.decimate_range > 1 else 'NO')
    if m.decimate_range > 1:
        sub(d,'Method','resample_poly; FIR+downsample replica')
        sub(d,'LPF_Taps',str(m.lpf_n_taps))
        sub(d,'fs_dec',f'{m.fs_dec:.4e}', unit='Hz')
        sub(d,'nr_dec',str(m.nr_dec))
        sub(d,'dr_dec',f'{m.dr_dec:.6f}', unit='m')

    rc_el = sub(proc,'RangeCompression')
    sub(rc_el,'Method',
        'Linear MF: next_fast_len(Nrg+Nrep-1), crop, scipy.fft workers=-1')
    sub(rc_el,'RangeResolution',
        f'{C/(2*abs(m.bw_stop-m.bw_start)):.4f}', unit='m')

    dc = sub(proc,'DopplerCentroid')
    sub(dc,'Method','Per-line cross-corr, SG smooth (poly=5, len=101)')
    sub(dc,'Deramping','exp(-j*2pi*cumsum(fdc)/PRF), numpy broadcast')
    sub(dc,'MeanEstimate', f'{fdc_mean:.4f}', unit='Hz')
    for bi in sorted(fdc_log.keys()):
        sub(dc,'BlockEstimate', f'{fdc_log[bi]:.4f}', block=str(bi), unit='Hz')

    rcmc_method = (
        'Numba @njit parallel bilinear: prange(Nrg), no temporaries'
        if HAS_NUMBA else
        'Python map_coordinates strip loop (install numba for 80-150x speedup)')
    sub(proc,'RCMC', text=rcmc_method)
    sub(proc,'AzimuthCompression',
        text='Time-domain quadratic chirp, nextpow2(2*Naz) FFT-conv, '
             'scipy.fft workers=-1, range-chunked')

    blk = sub(proc,'BlockProcessing')
    acc_method = (
        'Numba @njit parallel: prange(na_actual), stride-1 range access'
        if HAS_NUMBA else
        'Python chunked real/imag loop (install numba for 20-50x speedup)')
    sub(blk,'AccumulationMethod', acc_method)
    sub(blk,'TotalBlocks',  str(n_blocks))
    sub(blk,'na_block',     str(m.na_block))
    sub(blk,'na_overlap',   str(m.na_overlap))
    sub(blk,'na_valid_step',str(m.na_valid))
    sub(blk,'TukeyAlpha',   '1.7')
    sub(blk,'SyntheticApertureLines', str(m.na_syn))
    sub(blk,'DopplerFMRateRef', f'{m.ka_ref:.4f}', unit='Hz/s')
    sub(blk,'QueueHeadroom', str(_QUEUE_HEADROOM))

    img = sub(root,'OutputImage')
    sub(img,'NumberOfLines',   str(m.na_total))
    sub(img,'NumberOfSamples', str(m.nr_dec))
    sub(img,'RangeSampleSpacing', f'{m.dr_dec:.6f}', unit='m')
    sub(img,'AzimuthLineSpacing', f'{1/m.prf:.8f}',  unit='s')
    sub(img,'DataType',
        'SLC float32 real+imag 2-band GeoTIFF; band-1=real, band-2=imaginary')
    sub(img,'GeoCoding','NOT APPLIED (slant-range geometry)')

    dom = minidom.parseString(ET.tostring(root, encoding='utf-8'))
    with open(out_path, 'wb') as fh:
        fh.write(dom.toprettyxml(indent='  ', encoding='utf-8'))
    log.info("XML → %s", out_path)


# ════════════════════════════════════════════════════════════════════════════
# 14. CLI
# ════════════════════════════════════════════════════════════════════════════
def _print_parameters(m: Meta, az_batch: int, rng_chunk: int, n_threads: int):
    bw    = abs(m.bw_stop - m.bw_start)
    D     = m.decimate_range
    n_blk = math.ceil((m.na_total - m.na_block) / m.na_valid) + 1
    max_D = max(0, int(m.fs / (2 * bw)))
    n_cpu = os.cpu_count() or 1
    nb_threads = n_threads if n_threads > 0 else (
        numba.get_num_threads() if HAS_NUMBA else n_cpu)

    buf_gb   = m.na_block * m.nr_dec * 2 * 4 / 1e9
    rcmc_gb  = m.nr_dec * m.na_block * 4 * 4 / 1e9  # 4 float32 arrays (src_re/im + out_re/im)
    accum_gb = m.nr_dec * m.na_block * 8 / 1e9       # focused.T copy

    print("\n" + "="*72)
    print("  SAR RDA Processor v7.0 — Parameters")
    print("="*72)
    print(f"  Input           : {m.h5_path}")
    print(f"  Numba           : {'ACTIVE  ← fast path' if HAS_NUMBA else 'NOT INSTALLED  (pip install numba)'}")
    if HAS_NUMBA:
        print(f"  Numba threads   : {nb_threads}  (logical CPUs: {n_cpu})")
    print()
    print(f"  Carrier         : {m.fc/1e9:.3f} GHz  (λ = {m.wavelength*100:.3f} cm)")
    print(f"  PRF             : {m.prf:.1f} Hz")
    print(f"  Sampling freq   : {m.fs/1e9:.3f} GHz")
    print(f"  Chirp BW        : {bw/1e6:.0f} MHz  →  rng-res {C/(2*bw)*100:.1f} cm")
    print(f"  Platform height : {m.platform_height:.0f} m")
    print(f"  Vr_eff          : {m.Vr_eff:.3f} m/s")
    print(f"  Look angle      : {m.look_angle:.1f}°   squint: {m.squint_angle:.4f}°")
    print()
    if D > 1:
        ok = "OK" if D <= max_D else f"WARNING — max safe D = {max_D}"
        print(f"  Range decimation: D={D}  [{ok}]")
        print(f"    nr: {m.nr} → {m.nr_dec}   dr: {m.dr:.4f} → {m.dr_dec:.4f} m")
    else:
        print(f"  Range decimation: D=1 (none).  Max safe D = {max_D}")
    print()
    print(f"  Output size     : {m.na_total} az × {m.nr_dec} rng")
    print(f"  R_near/mid/far  : {m.r_near:.0f} / {m.r_ref_dec:.0f} / {m.r_far_dec:.0f} m")
    print()
    print(f"  ── Block layout ──────────────────────────────────────────────")
    print(f"  na_syn (far rng): {m.na_syn} lines")
    print(f"  na_overlap      : {m.na_overlap} lines")
    print(f"  step / na_valid : {m.na_valid} lines")
    print(f"  na_block        : {m.na_block} lines")
    print(f"  Est. blocks     : {n_blk}")
    print()
    print(f"  ── Memory per block (D={D}) ──────────────────────────────────")
    print(f"  Rolling buffer  : {buf_gb:.2f} GB  (shared, not per-block)")
    print(f"  RCMC re/im      : {rcmc_gb:.2f} GB  (4 float32 arrays)")
    print(f"  Accum transpose : {accum_gb:.2f} GB  (focused.T copy)")
    print(f"  Working total   : ~{buf_gb + rcmc_gb + accum_gb + 3:.0f} GB peak")
    print()
    if HAS_NUMBA:
        print(f"  ── Expected speedup over V5 ({nb_threads} threads) ──────────────────")
        print(f"  RCMC            : ~80-150x  (parallel bilinear, no temporaries)")
        print(f"  Accumulate      : ~20-50x   (parallel az loop, stride-1 range)")
        print(f"  Range compress  : unchanged  (scipy.fft workers=-1)")
        print(f"  Azimuth compress: unchanged  (scipy.fft workers=-1)")
        print(f"  Est. total time : ~12min   (vs ~16 min V5 at {n_cpu} CPUs)")
    print("="*72 + "\n")


def main():
    logging.basicConfig(level=logging.INFO,
                        format='%(asctime)s  %(levelname)-5s  %(message)s',
                        datefmt='%H:%M:%S')
    ap = argparse.ArgumentParser(
        description='SAR RDA Processor v7.0 — Numba JIT accelerated',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    ap.add_argument('--input',  '-i', required=True,  help='Input HDF5 file')
    ap.add_argument('--output', '-o', required=True,  help='Output directory')
    ap.add_argument('--workers','-w', type=int, default=1,
                    help='Worker processes. '
                         '1 = single-process + Numba (RECOMMENDED for ≤128 GB RAM). '
                         'N>1 = multiprocessing; each worker uses --threads Numba threads.')
    ap.add_argument('--threads','-t', type=int, default=0,
                    help='Numba thread count for _nb_rcmc and _nb_accumulate, '
                         'AND scipy.fft workers. 0 = auto (all logical CPUs). '
                         'RECOMMENDED: --workers 1 --threads 32  (use all 32 cores). '
                         'Multiprocessing: --workers 4 --threads 8 (4x8=32 total).')
    ap.add_argument('--decimate-range', type=int, default=1, metavar='D',
                    help='Range decimation factor D >= 1.')
    ap.add_argument('--step', type=int, default=None, metavar='N',
                    help='Valid lines per step (default 1000).')
    ap.add_argument('--block', type=int, default=None, metavar='N',
                    help='Override na_block directly.')
    ap.add_argument('--overlap', type=int, default=None, metavar='N',
                    help='Override na_overlap (default = na_syn).')
    ap.add_argument('--rng-chunk', type=int, default=1024,
                    help='Range-bin batch for azimuth FFT.')
    ap.add_argument('--az-batch', type=int, default=128,
                    help='Azimuth-column batch for range FFT.')
    ap.add_argument('--vmin-db', type=float, default=-60.0)
    ap.add_argument('--vmax-db', type=float, default=-5.0)
    ap.add_argument('--dry-run', action='store_true',
                    help='Print parameters and warm up Numba, then exit.')
    args = ap.parse_args()

    if not HAS_H5PY:
        print("ERROR: pip install h5py"); return 1
    if args.decimate_range < 1:
        print("ERROR: --decimate-range must be >= 1"); return 1

    # Set scipy.fft thread count via environment variable (read on import,
    # but scipy.fft.set_global_backend / workers=-1 already uses all CPUs)
    if args.threads > 0 and HAS_SCIPY_FFT:
        try:
            _scipy_fft.set_workers(args.threads)
        except Exception:
            pass   # older scipy versions don't have set_workers; workers=-1 fallback

    m = load_metadata(args.input,
                      decimate_range=args.decimate_range,
                      valid_lines=args.step,
                      na_block_override=args.block,
                      na_overlap_override=args.overlap)
    _print_parameters(m, args.az_batch, args.rng_chunk, args.threads)

    if args.dry_run:
        if HAS_NUMBA:
            if args.threads > 0:
                numba.set_num_threads(args.threads)
            warmup_numba_kernels()
        print("Dry-run complete."); return 0

    proc   = SARProcessor(args.input, args.output,
                          workers=args.workers,
                          n_threads=args.threads,
                          decimate_range=args.decimate_range,
                          valid_lines=args.step,
                          na_block_override=args.block,
                          na_overlap_override=args.overlap,
                          rng_chunk=args.rng_chunk,
                          az_batch=args.az_batch,
                          vmin_db=args.vmin_db,
                          vmax_db=args.vmax_db)
    result = proc.run()
    print("\nOutputs:")
    for k, v in result.items():
        print(f"  {k:<12}: {v}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
