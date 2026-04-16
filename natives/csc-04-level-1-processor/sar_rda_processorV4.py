#!/usr/bin/env python3
"""
sar_rda_processor.py  v3.0
==========================
Range-Doppler Algorithm (RDA) SAR Processor — HDF5 airborne raw data

Written by Ahmad Bilal (bilal.ahmad@lumir.space)
Property of Lumir Inc.

Algorithm
--------------------------------------------------
Per azimuth block:
  1.  Read na_block raw lines from HDF5  →  (na_block, nr)
      Transpose to  (nr, na_block)  =  (Nrg, Naz)
  2.  Range decimation  :  resample_poly(up=1, down=D, axis=0)         [if D>1]
                            Replica decimated with FIR + group-delay fix
  3.  Range compression :  LINEAR matched-filter convolution
                              MF = conj(flip(replica_dec))
                              Nfft = nextpow2(Nrg + Nrep - 1)
                              crop  src[Nrep-1 : Nrep-1+Nrg, :]
  4.  Doppler centroid  :  per-line cross-correlation, Savitzky-Golay smoothed
  5.  Deramping         :  exp(-j·2π·cumsum(fdc)/PRF)
  6.  RCMC              :  time-domain per-azimuth-column np.interp
                              R(n,R₀) = sqrt(R₀² + (Vr·n/PRF)²)
  7.  Azimuth compress  :  time-domain quadratic chirp (range-chunked FFT conv)
                              h(t) = exp(-j·π·Ka·t²),  Ka = -2Vr²/(λR)

Block layout  (sliding-window overlap-add, identical to reference code)
-----------------------------------------------------------------------
  na_syn   = PRF x beamwidth_rad x R_far / Vr_eff   (aperture at far range)
  overlap  = na_syn                                   (full aperture each side)
  step     = na_valid  (default = 1000,  user-overridable via --step)
  na_block = overlap + step

  Each block reads na_block raw lines — NO zero-padding.
  Last block is slid back:  az0 = na_total - na_block.
  The entire focused block is written to the accumulator weighted by a Tukey
  window (alpha = 2·overlap/na_block ≥ 1 → Hann-like), then normalised by
  the accumulated weight sum. Alpha hardcoded to 1 (Hann Window, change if required)

  Example (your data, D=8):
    na_syn  ≈ 3767   na_block ≈ 4767   step = 1000
    ~46 blocks x ~379 MB/block (complex64)

Range decimation  (--decimate-range D)
--------------------------------------
  Safe limit:  D ≤ floor(fs / (2 x chirp_BW))
  For fs=1.5 GHz, B=1.2 GHz  →  D_max = 0  (no decimation available).
  The code prints a warning if D exceeds this limit.

Slant range formula
-------------------
  "Sampling Window Start Time" (SWST) is the round-trip (two-way) range
  delay from pulse transmission to the start of the ADC sampling window.

  One-way slant range to first sample:
      R_near = c x SWST / 2

  Full slant range vector:
      SR[i] = R_near + i x dr    where dr = c / (2 x fs)

  Equivalently:
      SR[i] = (SWST + i/fs) x c/2

  Using R_near = c x SWST (treating SWST as one-way) doubles all slant
  ranges, halving Ka = 2V²/(λR) → matched-filter chirp rate wrong by 2x
  → azimuth defocus.  Also inflates na_syn by 33%, so blocks become
  smaller than the synthetic aperture and additional defocus results.

Usage
-----
  python sar_rda_processor.py --input 16_resized.h5 --output ./output
  python sar_rda_processor.py ... --workers 8
  python sar_rda_processor.py ... --decimate-range 4
  python sar_rda_processor.py ... --step 2000 --dry-run
"""

import argparse
import logging
import math
import os
import struct
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timedelta, UTC
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

# ── FFT backend: prefer scipy.fft → pyfftw → numpy.fft ─────────────────────
# scipy.fft keeps complex64 in → complex64 out (numpy.fft promotes to complex128).
# next_fast_len finds highly-composite sizes (e.g. 109760 vs 131072) that are
# significantly faster while still avoiding circular wrap-around aliasing.
try:
    import scipy.fft as _scipy_fft
    def _fft(a, n=None, axis=-1, workers=-1):
        return _scipy_fft.fft(a, n=n, axis=axis, workers=workers)
    def _ifft(a, n=None, axis=-1, workers=-1):
        return _scipy_fft.ifft(a, n=n, axis=axis, workers=workers)
    def _next_fast_len(n): return _scipy_fft.next_fast_len(n)
    HAS_SCIPY_FFT = True
except ImportError:
    try:
        import pyfftw.interfaces.numpy_fft as _pyfftw_fft
        import pyfftw
        pyfftw.interfaces.cache.enable()
        _W = os.cpu_count() or 1
        def _fft(a, n=None, axis=-1, workers=None):
            return _pyfftw_fft.fft(a, n=n, axis=axis, threads=_W)
        def _ifft(a, n=None, axis=-1, workers=None):
            return _pyfftw_fft.ifft(a, n=n, axis=axis, threads=_W)
        def _next_fast_len(n): return 1 << int(np.ceil(np.log2(n)))
        HAS_SCIPY_FFT = False
    except ImportError:
        def _fft(a, n=None, axis=-1, workers=None):
            return np.fft.fft(a, n=n, axis=axis)
        def _ifft(a, n=None, axis=-1, workers=None):
            return np.fft.ifft(a, n=n, axis=axis)
        def _next_fast_len(n): return 1 << int(np.ceil(np.log2(n)))
        HAS_SCIPY_FFT = False

C  = 299_792_458.0
Re = 6_378_144.0
log = logging.getLogger("SAR-RDA")


# ════════════════════════════════════════════════════════════════════════════
# 1.  Metadata
# ════════════════════════════════════════════════════════════════════════════
class Meta:
    """All parameters needed by every worker block."""
    # sensor
    prf: float; fc: float; fs: float
    bw_start: float; bw_stop: float; pulse_width: float; swst: float
    look_angle: float; platform_height: float; flight_speed: float
    beamwidth: float; squint_angle: float
    # data dimensions
    na_total: int; nr: int; nr_rep: int
    # GPS (interpolated to PRF rate, length na_total)
    v_mag: np.ndarray; lat: np.ndarray; lon: np.ndarray; alt: np.ndarray
    # derived geometry
    wavelength: float; dr: float; r_near: float; Vr_eff: float
    # range decimation
    decimate_range: int; nr_dec: int; fs_dec: float; dr_dec: float
    r_far_dec: float; r_ref_dec: float; lpf_n_taps: int
    # block layout
    na_syn: int; na_overlap: int; na_valid: int; na_block: int
    # Doppler FM rate at mid-swath
    ka_ref: float
    # decimated replica (complex)
    replica_dec: np.ndarray
    h5_path: str
    # raw GPS state vectors (for XML orbit block)
    gps_utc_iso: list        # [str] UTC ISO string per GPS sample
    gps_lat_raw: np.ndarray  # (N_gps,) deg
    gps_lon_raw: np.ndarray  # (N_gps,) deg
    gps_alt_raw: np.ndarray  # (N_gps,) m
    gps_vx_raw:  np.ndarray  # (N_gps,) m/s (NED North or ECEF-X)
    gps_vy_raw:  np.ndarray  # (N_gps,) m/s (NED East  or ECEF-Y)
    gps_vz_raw:  np.ndarray  # (N_gps,) m/s (NED Down  or ECEF-Z)
    scene_start_utc: str     # Scene Sensing Start UTC (from HDF5)
    scene_stop_utc:  str     # Scene Sensing Stop  UTC (from HDF5)
    reference_utc:   str     # Reference UTC (from HDF5)


def load_metadata(h5_path: str,
                  decimate_range: int = 1,
                  valid_lines: Optional[int] = None,
                  na_block_override: Optional[int] = None,
                  na_overlap_override: Optional[int] = None) -> Meta:
    """
    Read HDF5 attributes, interpolate GPS, compute all processing parameters.

    Parameters
    ----------
    decimate_range     : integer range decimation factor D ≥ 1
    valid_lines        : override step (valid output lines per block). Default 1000.
    na_block_override  : set na_block directly; step = na_block − na_overlap.
    na_overlap_override: set na_overlap directly (default = na_syn at far range).

    Block layout priority
    ─────────────────────
    If na_block_override AND na_overlap_override are both given:
        step = na_block − na_overlap   (valid_lines ignored)
    If only na_block_override:
        na_overlap = na_overlap_override or na_syn
        step       = na_block − na_overlap
    If only na_overlap_override:
        step       = valid_lines or 1000
        na_block   = na_overlap + step
    Default (neither given):
        na_overlap = na_syn
        step       = valid_lines or 1000
        na_block   = na_overlap + step
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
        rep_raw           = grp['Replica'][:]          # (nr_rep, 2)
        m.nr_rep          = int(rep_raw.shape[0])
        gps               = grp['GPSDATA_HQ'][:]       # (N_gps, 12)
        # cols: Time Lat Lon Alt Roll Pitch Heading Distance Vx Vy Vz SOG
        # UTC attributes (stored on the ST0 group or the root)
        def _read_utc_attr(group, key):
            """Try the given group first, then its parent (root)."""
            try:
                return str(group.attrs[key])
            except KeyError:
                return str(group.parent.attrs.get(key, ''))
        m.reference_utc   = _read_utc_attr(grp, 'Reference UTC')
        m.scene_start_utc = _read_utc_attr(grp, 'Scene Sensing Start UTC')
        m.scene_stop_utc  = _read_utc_attr(grp, 'Scene Sensing Stop UTC')

    # GPS → PRF-rate interpolation
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

    # ── Raw GPS state vectors for XML orbit block ──────────────────────────
    # GPS Time column (col 0) = seconds since Reference UTC.
    # Conversion: UTC = Reference_UTC + timedelta(seconds=gps_t[i])
    # Verified: gps_t[0]=196452.0 s → 2024-10-15T06:34:12Z = Scene Sensing Start ✓
    _ref_str = m.reference_utc.strip()
    try:
        _ref_dt = datetime.fromisoformat(_ref_str.replace(' ', 'T'))
        if _ref_dt.tzinfo is None:
            from datetime import timezone as _tz
            _ref_dt = _ref_dt.replace(tzinfo=_tz.utc)
    except Exception:
        from datetime import timezone as _tz
        _ref_dt = datetime(2000, 1, 1, tzinfo=_tz.utc)  # fallback
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

    # ── geometry ──────────────────────────────────────────────────────────────
    m.wavelength = C / m.fc
    m.dr         = C / (2.0 * m.fs)
    # SWST = round-trip (two-way) range delay  →  one-way R_near = C × SWST / 2
    # Equivalently: SR[i] = (SWST + i/fs) × c/2  (same as reference code).
    m.r_near     = C * m.swst / 2
    # Curved-Earth effective radar velocity
    m.Vr_eff     = m.flight_speed * np.sqrt(Re / (Re + m.platform_height))

    # ── range decimation ──────────────────────────────────────────────────────
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
                    "Max safe D = %d.", chirp_bw/1e6, m.fs_dec/2/1e6,
                    D, max_safe)

    # ── Doppler FM rate at mid-swath ──────────────────────────────────────────
    m.ka_ref = 2.0 * m.Vr_eff**2 / (m.wavelength * m.r_ref_dec)

    # ── synthetic aperture length at far range (worst-case) ───────────────────
    theta    = np.radians(m.beamwidth)
    na_syn_f = m.prf * theta * m.r_far_dec / m.Vr_eff
    m.na_syn = int(np.ceil(na_syn_f))

    # ── block layout  (reference-code style: one-sided overlap) ──────────────
    #   na_block = na_overlap + step
    #   Tukey alpha = 2*overlap/na_block  (may exceed 1 → Hann window)
    #   Each block reads EXACTLY na_block lines; last block is slid back.
    #   Priority: explicit na_block/na_overlap > na_syn auto + step.
    _na_ov  = na_overlap_override if na_overlap_override is not None else m.na_syn
    _step   = valid_lines if valid_lines is not None else 1000
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

    # ── decimated replica ─────────────────────────────────────────────────────
    rep_full = (rep_raw[:, 0].astype(np.float64)
                + 1j * rep_raw[:, 1].astype(np.float64))
    m.replica_dec = (_decimate_replica(rep_full, D, m.lpf_n_taps)
                     if D > 1 else rep_full.astype(np.complex64))

    log.info("Metadata loaded: na_total=%d  nr=%d→%d(D=%d)  "
             "na_syn=%d  overlap=%d  step=%d  na_block=%d  "
             "R_near=%.0f  R_far=%.0f  Vr_eff=%.3f",
             m.na_total, m.nr, m.nr_dec, D,
             m.na_syn, m.na_overlap, m.na_valid, m.na_block,
             m.r_near, m.r_far_dec, m.Vr_eff)
    return m


def _decimate_replica(replica: np.ndarray, D: int, n_taps: int) -> np.ndarray:
    """
    FIR LPF + decimate complex replica by D.
    Replica is padded by `delay` zeros before filtering so the group-delay
    compensation window always covers the full signal regardless of lengths.
    """
    cutoff = max(0.01, min(0.99, 1.0 / D))
    h      = firwin(n_taps, cutoff)
    delay  = (n_taps - 1) // 2
    padded = np.concatenate([replica, np.zeros(delay, dtype=replica.dtype)])
    fr     = lfilter(h, 1.0, padded.real)
    fi     = lfilter(h, 1.0, padded.imag)
    return (fr[delay::D] + 1j * fi[delay::D]).astype(np.complex64)


# ════════════════════════════════════════════════════════════════════════════
# 2.  Range compression  (linear convolution, correct crop)
# ════════════════════════════════════════════════════════════════════════════
def range_compress(s: np.ndarray, replica_dec: np.ndarray,
                   az_batch: int = 64) -> np.ndarray:
    """
    Matched-filter range compression via proper LINEAR convolution.

    Parameters
    ----------
    s           : (Nrg, Naz) complex  — raw IQ, range-decimated
    replica_dec : (Nrep,) complex
    az_batch    : number of azimuth columns per FFT batch (memory control).
                  Peak RAM per batch = Nfft x az_batch x 16 bytes.
                  Default 64 → ~134 MB per batch for the full-rate sensor
                  (Nfft=131072, az_batch=64).  Increase for speed at the
                  cost of higher peak memory.

    Returns
    -------
    rc : (Nrg, Naz) complex64

    Memory note
    -----------
    The naive approach  S = fft(s, Nfft, axis=0)  allocates
    (Nfft x Naz) complex128 — for the full sensor (Nfft=131072, Naz=4767)
    that is 10 GB, which OOMs on most systems.  Processing az_batch columns
    at a time reduces the peak FFT buffer to ~134 MB regardless of Naz.
    """
    Nrg, Naz = s.shape
    Nrep     = len(replica_dec)
    mf       = np.conj(replica_dec[::-1])                  # MF in time domain
    Nfft     = _next_fast_len(Nrg + Nrep - 1)             # optimal FFT size
    MF       = _fft(mf, n=Nfft)                            # (Nfft,) — small
    crop_lo  = Nrep - 1
    crop_hi  = Nrep - 1 + Nrg
    out      = np.empty((Nrg, Naz), dtype=np.complex64)

    for c0 in range(0, Naz, az_batch):
        c1          = min(c0 + az_batch, Naz)
        S_batch     = _fft(s[:, c0:c1], n=Nfft, axis=0)   # (Nfft, batch)
        rc_batch    = _ifft(S_batch * MF[:, np.newaxis], axis=0)
        out[:, c0:c1] = rc_batch[crop_lo:crop_hi, :].astype(np.complex64)
        del S_batch, rc_batch

    return out


# ════════════════════════════════════════════════════════════════════════════
# 3.  Doppler centroid profile  (per-line, SG-smoothed)
# ════════════════════════════════════════════════════════════════════════════
def estimate_fdc_profile(src_rc: np.ndarray, prf: float,
                         smooth_len: int = 101) -> np.ndarray:
    """
    Time-varying Doppler centroid — one value per azimuth line.

        corr[n] = Σ_r  src[r,n] · src*[r,n-1]   (summed over all range bins)
        fdc[n]  = PRF/(2π) · arg(corr[n])

    Savitzky-Golay smoothed (poly=5) to reject pulse-to-pulse noise.
    """
    Nrg, Naz = src_rc.shape
    if Naz < 2:
        return np.zeros(Naz)
    corr = np.sum(src_rc[:, 1:] * np.conj(src_rc[:, :-1]), axis=0)  # (Naz-1,)
    fdc  = (prf / (2.0 * np.pi)) * np.angle(corr)
    fdc  = np.concatenate([fdc[:1], fdc])                             # (Naz,)
    wl   = min(smooth_len | 1, (len(fdc) // 2) * 2 + 1)
    if wl >= 3:
        fdc = savgol_filter(fdc, window_length=wl,
                            polyorder=5, mode='nearest')
    return fdc.astype(np.float64)


# ════════════════════════════════════════════════════════════════════════════
# 4.  Time-varying Doppler deramping
# ════════════════════════════════════════════════════════════════════════════
def remove_time_varying_fdc(src_rc: np.ndarray,
                            fdc_profile: np.ndarray,
                            prf: float) -> Tuple[np.ndarray, float]:
    """
    Multiply by exp(-j·2π·cumsum(fdc)/PRF) to baseband the azimuth signal.
    Returns (deramped_block, mean_fdc_Hz).
    """
    phi   = 2.0 * np.pi * np.cumsum(fdc_profile) / prf
    demod = np.exp(-1j * phi).astype(np.complex64)
    return (src_rc * demod[np.newaxis, :]), float(np.mean(fdc_profile))


# ════════════════════════════════════════════════════════════════════════════
# 5.  RCMC  (scipy.ndimage.map_coordinates — C backend, range-strip chunked)
# ════════════════════════════════════════════════════════════════════════════
def rcmc_time_domain(src: np.ndarray, SR: np.ndarray,
                     Vr: float, fs: float, prf: float,
                     rng_strip: int = 4096) -> np.ndarray:
    """
    Range Cell Migration Correction (RCMC) using scipy.ndimage.map_coordinates.

    For each azimuth sample n, every range bin r experiences a range walk:
        R(r, n) = √(SR[r]² + (Vr · n/PRF)²)
        shift(r,n) = (R - SR[r]) · 2fs / c   [fractional range samples]

    The corrected value at (r, n) is interpolated from the source at row
    position r + shift(r, n) using bilinear interpolation (order=1).

    C-backend advantage
    ───────────────────
    scipy.ndimage.map_coordinates is a compiled C routine that processes
    an entire 2-D coordinate grid without any Python loop.  For large blocks
    it is 3-10x faster than the equivalent Python loop over np.interp.

    Range-strip chunking (memory control)
    ──────────────────────────────────────
    The coordinate arrays (row, col) are (Nrg, Naz) float64 — at full
    resolution (79504 x 4767) they alone consume 6 GB.  Processing
    rng_strip range bins at a time bounds the coordinate memory to:
        2 x (rng_strip + r_guard) x Naz x 8 bytes
    e.g. rng_strip=4096, Naz=4767 → ~630 MB per strip.

    Parameters
    ----------
    src       : (Nrg, Naz) complex64 — range-compressed, deramped block
    SR        : (Nrg,) slant-range vector [m]
    Vr        : effective radar velocity [m/s]
    fs        : range sampling frequency after decimation [Hz]
    prf       : pulse repetition frequency [Hz]
    rng_strip : range bins processed per iteration.  Reduce if OOM.
    """
    Nrg, Naz = src.shape
    t_az  = np.arange(Naz, dtype=np.float64) / prf   # (Naz,) seconds

    # Maximum RCMC shift (at the far end of slow-time axis, near range)
    t_end       = (Naz - 1) / prf
    delta_R_max = float(np.sqrt(SR.min()**2 + (Vr * t_end)**2) - SR.min())
    r_guard     = int(np.ceil(2.0 * delta_R_max / C * fs)) + 8

    col_idx = np.arange(Naz, dtype=np.float64)       # (Naz,) — reused per strip
    out     = np.empty_like(src)

    for r0 in range(0, Nrg, rng_strip):
        r1   = min(r0 + rng_strip, Nrg)
        # Extended source strip: include r_guard bins on each side so that
        # interpolation coordinates always land within the loaded strip.
        r0e  = max(0, r0 - r_guard)
        r1e  = min(Nrg, r1 + r_guard)

        # Separate real/imag arrays for map_coordinates (operates on real arrays)
        strip_r = np.ascontiguousarray(src[r0e:r1e].real, dtype=np.float32)
        strip_i = np.ascontiguousarray(src[r0e:r1e].imag, dtype=np.float32)

        SR_out  = SR[r0:r1]                                        # (nout,)
        R_t     = np.sqrt(SR_out[:, None]**2 + (Vr * t_az[None, :])**2)
        shift   = (2.0 * (R_t - SR_out[:, None]) / C) * fs        # (nout, Naz)

        # Row coordinates IN the extended strip
        row = (np.arange(r0, r1, dtype=np.float64)[:, None]
               - r0e + shift)                                       # (nout, Naz)
        col = np.broadcast_to(col_idx[None, :], row.shape).copy()  # (nout, Naz)

        coords = [row.ravel(), col.ravel()]
        rp = _map_coords(strip_r, coords, order=1, mode='nearest', prefilter=False)
        ip = _map_coords(strip_i, coords, order=1, mode='nearest', prefilter=False)

        out[r0:r1] = (rp + 1j * ip).reshape(r1 - r0, Naz).astype(np.complex64)
        del strip_r, strip_i, R_t, shift, row, col, rp, ip

    return out


# ════════════════════════════════════════════════════════════════════════════
# 6.  Azimuth compression  (time-domain quadratic chirp, range-chunked)
# ════════════════════════════════════════════════════════════════════════════
def azimuth_compress(src: np.ndarray, prf: float, Vr: float,
                     wavelength: float, SR: np.ndarray,
                     rng_chunk: int = 512) -> np.ndarray:
    """
    Time-domain azimuth matched filter, range-bin chunked.

    Signal phase after RC+deramping:  φ(t) ≈ -π·Ka·t²   (Ka > 0)
    Matched filter:  h(t) = exp(-j·π·Ka_neg·t²),  Ka_neg = -2Vr²/(λR) < 0.

    Memory strategy
    ───────────────
    The naive approach pre-computes  X = fft(src, L, axis=1)  over ALL
    Nrg rows at once.  For the full sensor (Nrg=79504, L=16384) that
    allocation is 10 GB and OOMs.

    Fix: the fft is now done INSIDE the rng_chunk loop, so the peak
    extra allocation is only  rng_chunk x L x 8 bytes ≈ 67 MB (at
    rng_chunk=512, L=16384), independent of Nrg.

    Uses pyfftw when available (typically 2-4x faster than numpy.fft).
    """
    Nrg, Naz = src.shape
    t      = np.arange(Naz, dtype=np.float64) / prf
    L      = 1 << int(np.ceil(np.log2(2 * Naz)))    # nextpow2 above 2·Naz
    Ka_neg = -2.0 * Vr**2 / (wavelength * SR)        # (Nrg,) < 0
    out    = np.empty((Nrg, Naz), dtype=np.complex64)

    for r0 in range(0, Nrg, rng_chunk):
        r1     = min(r0 + rng_chunk, Nrg)
        Ka_c   = Ka_neg[r0:r1, np.newaxis]                           # (chunk,1)
        # chirp filter — Ka_neg<0, so −j·π·Ka_neg·t² has positive exponent
        h0     = np.exp(-1j * np.pi * Ka_c * t[np.newaxis, :]**2)   # (chunk,Naz)
        H      = _fft(h0, n=L, axis=1)
        X_chunk = _fft(src[r0:r1], n=L, axis=1)                     # (chunk,L)
        Y      = _ifft(X_chunk * H, axis=1)
        out[r0:r1] = Y[:, :Naz].astype(np.complex64)
        del h0, H, X_chunk, Y

    return out


# ════════════════════════════════════════════════════════════════════════════
# 7.  Block schedule
# ════════════════════════════════════════════════════════════════════════════
def _build_block_schedule(na_total: int, na_block: int,
                          step: int) -> List[dict]:
    """
    Sliding-window schedule.  Each entry specifies an EXACT na_block-line
    window to read from the HDF5.  No zero-padding.

        for k in 0..N_runs-1:
            az0 = k * step
            az1 = az0 + na_block
            if az1 > na_total:          ← slide last block back
                az0 = na_total - na_block
                az1 = na_total

    Duplicate windows (can occur when na_total - na_block < step) are kept
    because the Tukey weighting makes their contribution double-counted but
    the weight normalisation corrects for this.
    """
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
# 8.  Block worker  (module-level for multiprocessing pickling)
# ════════════════════════════════════════════════════════════════════════════
def _process_block(args: dict) -> Tuple[int, int, np.ndarray, float]:
    """
    Full processing pipeline for one azimuth block.

    Returns
    -------
    (block_idx, az0, focused, fdc_mean)
    focused.shape = (nr_dec, na_actual)  where na_actual = az1 - az0
    (Nrg, Naz) orientation — transposed to (Naz, Nrg) during accumulation.
    """
    h5_path    = args['h5_path']
    az0        = args['az0']
    az1        = args['az1']
    nr         = args['nr']
    nr_dec     = args['nr_dec']
    prf        = args['prf']
    r_near     = args['r_near']
    dr_dec     = args['dr_dec']
    fs_dec     = args['fs_dec']
    wavelength = args['wavelength']
    Vr_eff     = args['Vr_eff']
    ht         = args['platform_height']
    v_mag      = args['v_mag']
    D          = args['decimate_range']
    replica_dec= args['replica_dec']
    smooth_len = args['smooth_len']
    rng_chunk  = args['rng_chunk']

    # ── 1. Read raw HDF5 block ────────────────────────────────────────────────
    with h5py.File(h5_path, 'r') as f:
        chunk = f['ST0/Raw data'][az0:az1, :, :]      # (na_actual, nr, 2)

    na_actual = chunk.shape[0]                         # = az1 - az0

    s = (chunk[:, :, 0].astype(np.float32)
       + 1j * chunk[:, :, 1].astype(np.float32))      # (na_actual, nr)
    del chunk

    s = s.T                                            # (nr, na_actual) = (Nrg, Naz)

    # ── 2. Range decimation ───────────────────────────────────────────────────
    if D > 1:
        s = resample_poly(s, up=1, down=D, axis=0).astype(np.complex64)
    # s: (nr_dec, na_actual)

    # ── 3. Range compression  (linear convolution) ────────────────────────────
    rc = range_compress(s, replica_dec, az_batch=args['az_batch'])  # (nr_dec, na_actual)
    del s

    # ── 4. Block-local effective velocity ─────────────────────────────────────
    v_block = float(np.mean(v_mag[az0:az1])) if na_actual > 0 else Vr_eff
    Vr = v_block * np.sqrt(Re / (Re + ht))

    # ── 5. Doppler centroid profile (per-line) ────────────────────────────────
    fdc_profile = estimate_fdc_profile(rc, prf, smooth_len=smooth_len)

    # ── 6. Time-varying deramping ─────────────────────────────────────────────
    rc_deramp, fdc_mean = remove_time_varying_fdc(rc, fdc_profile, prf)
    del rc

    # ── 7. RCMC (time-domain, per azimuth column) ─────────────────────────────
    SR = r_near + np.arange(nr_dec) * dr_dec           # (nr_dec,) [m]
    rc_rcmc = rcmc_time_domain(rc_deramp, SR, Vr, fs_dec, prf)
    del rc_deramp

    # ── 8. Azimuth compression ────────────────────────────────────────────────
    focused = azimuth_compress(rc_rcmc, prf, Vr, wavelength, SR,
                               rng_chunk=rng_chunk)
    del rc_rcmc

    return args['block_idx'], az0, focused, fdc_mean


# ════════════════════════════════════════════════════════════════════════════
# 9.  SAR Processor  (orchestration + sliding-window overlap-add)
# ════════════════════════════════════════════════════════════════════════════
class SARProcessor:
    """
    Orchestrates block processing and GeoTIFF / XML output writing.

    Parameters
    ----------
    h5_path            : input HDF5 file
    output_dir         : output directory (created if absent)
    workers            : parallel worker processes (1 = sequential)
    decimate_range     : range decimation factor D ≥ 1
    valid_lines        : step size in lines (default 1000)
    na_block_override  : set na_block directly
    na_overlap_override: set na_overlap directly (default = na_syn)
    rng_chunk          : range-bin batch size for azimuth compression (default 512)
    az_batch           : azimuth-column batch size for range compression (default 64)
    vmin_db / vmax_db  : dB scale for PNG quicklook
    """

    def __init__(self, h5_path: str, output_dir: str,
                 workers: int = 1,
                 decimate_range: int = 1,
                 valid_lines: Optional[int] = None,
                 na_block_override: Optional[int] = None,
                 na_overlap_override: Optional[int] = None,
                 rng_chunk: int = 512,
                 az_batch: int = 64,
                 vmin_db: float = -60.0,
                 vmax_db: float = -5.0):
        self.workers    = workers
        self.rng_chunk  = rng_chunk
        self.az_batch   = az_batch
        self.vmin_db    = vmin_db
        self.vmax_db    = vmax_db
        self.out_dir    = Path(output_dir)
        os.makedirs(self.out_dir, exist_ok=True)

        self.meta = load_metadata(h5_path,
                                  decimate_range=decimate_range,
                                  valid_lines=valid_lines,
                                  na_block_override=na_block_override,
                                  na_overlap_override=na_overlap_override)
        m = self.meta
        self.schedule = _build_block_schedule(
            m.na_total, m.na_block, m.na_valid)
        log.info("Schedule: %d blocks  na_overlap=%d  step=%d  na_block=%d",
                 len(self.schedule), m.na_overlap, m.na_valid, m.na_block)

    # ─────────────────────────────────────────────────────────────────────────
    def run(self) -> dict:
        """
        Process all blocks and write output, flushing each strip of finalized
        lines to the GeoTIFF immediately after it is ready.

        Rolling-buffer strategy
        -----------------------
        Instead of allocating a (na_total x nr_dec x 2) accumulator
        (≈ 32 GB without decimation), a rolling buffer of exactly ``na_block``
        lines is maintained.  Because the sliding-window advances by
        ``na_valid`` lines per block, a line is finalized (will receive no
        further contributions) as soon as the next block's ``az0`` passes it:

            flush_end = schedule[k+1]['az0']   (na_total for the last block)

        Lines [written_ptr, flush_end) are weight-normalised and written to
        the GeoTIFF via ``_TiffStripWriter``.  The buffer is then compacted
        (shifted left by ``n_flush`` lines) so its first row always maps to
        the next block's ``az0``.

        Memory footprint (rolling buffer vs old approach)
        -------------------------------------------------
        Rolling buffer : na_block  x nr_dec x 2 x 4 B
          e.g. D=1 : 4767 x 79504 x 8 ≈  3 GB   ← replaces 32 GB temp file
               D=8 : 4767 x  9938 x 8 ≈ 380 MB

        Parallel workers
        ----------------
        Results are buffered in a dict keyed by block index and drained in
        ascending schedule order, preserving the rolling-buffer invariant.

        Block layout (identical to reference code):
            na_syn   = PRF x θ_bw x R_far / Vr_eff
            overlap  = na_syn
            step     = na_valid  (default 1000)
            na_block = overlap + step
            alpha    = 2 x overlap / na_block  (≥ 1 → Hann window)
        """
        m       = self.meta
        out_slc = self.out_dir / "SLC_complex_w10dec16.tif"
        out_ql  = self.out_dir / "QuickLook.png"
        out_xml = self.out_dir / "SLC_metadata_w10dec16.xml"

        n_blk = len(self.schedule)
        alpha = 1 #2.0 * m.na_overlap / m.na_block
        win   = tukey(m.na_block, alpha=min(alpha, 1.5)).astype(np.float32)
        #win = np.ones(m.na_block, dtype=np.float32)
        t0    = time.time()
        fdc_log: Dict[int, float] = {}

        # ── Rolling accumulation buffer ───────────────────────────────────────
        # buf[i] corresponds to az index (buf_az0 + i).
        # Invariant maintained after every flush: buf_az0 == written_ptr.
        buf     = np.zeros((m.na_block, m.nr_dec, 2), dtype=np.float32)
        wt      = np.zeros(m.na_block, dtype=np.float32)
        buf_az0 = 0    # az index of buf[0]
        written = 0    # next az line to write to the output file
        gb_buf  = m.na_block * m.nr_dec * 2 * 4 / 1e9
        log.info("Rolling buffer: %.2f GB  (%d az x %d rg x 2 bands)",
                 gb_buf, m.na_block, m.nr_dec)

        # ── Worker base args ──────────────────────────────────────────────────
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
        )

        # ── Open output TIFF for incremental strip writing ────────────────────
        log.info("Opening output GeoTIFF for incremental writing…")
        tif_writer = _TiffStripWriter(str(out_slc), m.na_total, m.nr_dec,
                                      m.dr_dec, m.prf)

        # ─────────────────────────────────────────────────────────────────────
        def _accumulate_and_flush(k: int, az0: int,
                                  focused: np.ndarray, fdc: float) -> None:
            """
            Accumulate one focused block into the rolling buffer, then flush
            all newly finalized lines to the output GeoTIFF.

            The invariant buf_az0 == written_ptr guarantees that
            lo = az0 - buf_az0 == 0 for every call under normal scheduling,
            so the block always fills buf[0 : na_actual].

            After accumulation:
              1. Determine flush_end = next block's az0 (or na_total).
              2. Normalize buf[0 : n_flush] by accumulated weights.
              3. Write the strip to disk via _TiffStripWriter.
              4. Shift the buffer left by n_flush (compact) and update
                 buf_az0 = written = flush_end.
            """
            nonlocal buf_az0, written

            fdc_log[k] = fdc
            na_actual   = focused.shape[1]

            # 1. Weighted accumulation into rolling buffer
            lo   = az0 - buf_az0          # == 0 by invariant
            w    = win[:na_actual]
            slab = focused.T.astype(np.complex64)   # (na_actual, nr_dec)
            buf[lo : lo + na_actual, :, 0] += slab.real * w[:, np.newaxis]
            buf[lo : lo + na_actual, :, 1] += slab.imag * w[:, np.newaxis]
            wt[lo : lo + na_actual]         += w

            # 2. Flush boundary: lines before the next block's start are final
            flush_end = (min(self.schedule[k + 1]['az0'], m.na_total)
                         if k + 1 < n_blk else m.na_total)

            if flush_end <= written:
                return                     # nothing new to flush this round

            n_flush = flush_end - written
            lo_f    = written - buf_az0    # == 0 by invariant

            # 3. Normalize and write the strip
            slab_f  = buf[lo_f : lo_f + n_flush].copy()
            safe_wt = np.maximum(wt[lo_f : lo_f + n_flush], 1e-6)
            slab_f /= safe_wt[:, np.newaxis, np.newaxis]
            tif_writer.write_strip(slab_f, written)

            # 4. Compact buffer: shift left by n_flush, zero the vacated tail
            remain = m.na_block - n_flush
            if remain > 0:
                buf[:remain] = buf[n_flush : m.na_block].copy()
                wt[:remain]  = wt[n_flush  : m.na_block].copy()
            buf[remain:] = 0.0
            wt[remain:]  = 0.0
            buf_az0 = flush_end
            written = flush_end

            done = k + 1
            eta  = (time.time() - t0) / done * (n_blk - done) if done < n_blk else 0
            log.info("[%d/%d]  az %d-%d  fdc=%.1f Hz  written=%d  ETA %.0fs",
                     done, n_blk, az0, az0 + na_actual, fdc, written, eta)

        # ── Block dispatch ────────────────────────────────────────────────────
        if self.workers == 1:
            for k, blk in enumerate(self.schedule):
                bidx, az0, focused, fdc = _process_block({**base, **blk})
                _accumulate_and_flush(k, az0, focused, fdc)

        else:
            # Submit all blocks; drain results in ascending schedule order so
            # the rolling-buffer invariant (buf_az0 advances monotonically)
            # is never violated.
            pending: Dict[int, tuple] = {}   # block_idx → (az0, focused, fdc)
            next_k = 0

            with ProcessPoolExecutor(max_workers=self.workers) as pool:
                futures = {
                    pool.submit(_process_block, {**base, **blk}): blk['block_idx']
                    for blk in self.schedule
                }
                for fut in as_completed(futures):
                    bidx, az0, focused, fdc = fut.result()
                    pending[bidx] = (az0, focused, fdc)
                    # Drain as many consecutive results as are ready
                    while next_k in pending:
                        az0_p, foc_p, fdc_p = pending.pop(next_k)
                        _accumulate_and_flush(next_k, az0_p, foc_p, fdc_p)
                        next_k += 1

        tif_writer.close()
        log.info("All blocks written — total time: %.1f s", time.time() - t0)

        fdc_mean = float(np.mean(list(fdc_log.values()))) if fdc_log else 0.0

        # ── Quicklook (two-pass strip reader, no full image in RAM) ──────────
        log.info("Generating quicklook from SLC strips…")
        ql_written = _write_quicklook_from_slc(
            str(out_slc), str(out_ql),
            vmin_db=self.vmin_db, vmax_db=self.vmax_db)

        write_metadata_xml(m, fdc_mean, fdc_log, n_blk, str(out_xml))
        log.info("Done → %s", self.out_dir)

        result = {'slc': str(out_slc), 'xml': str(out_xml)}
        if ql_written:
            result['quicklook'] = str(out_ql)
        return result

    # ─────────────────────────────────────────────────────────────────────────
    @staticmethod
    def _accumulate(slc_mm, wt_mm, focused, az0, win_full):
        """
        Weighted overlap-add — stores real and imaginary parts separately.

        slc_mm shape : (na_total, nr_dec, 2)   band 0 = real, band 1 = imag

        Why not sum complex directly:
            Each block's absolute phase depends on its own deramping reference.
            Summing complex values across blocks would cause phase-dependent
            partial cancellation in the overlap zones.  Summing real and imag
            independently (equivalent to summing amplitudes) is incoherent
            but phase-independent and gives the correct weighted average.
            The real/imag representation preserves phase information within
            each block while being robust to the inter-block phase jumps.

        focused.shape = (nr_dec, na_actual)
        """
        na_total  = slc_mm.shape[0]
        na_actual = focused.shape[1]

        az1 = min(az0 + na_actual, na_total)
        n   = az1 - az0

        win_local = win_full[:n]                          # (n,)
        slab = focused[:, :n].T.astype(np.complex64)     # (n, nr_dec)

        slc_mm[az0:az1, :, 0] += slab.real * win_local[:, np.newaxis]
        slc_mm[az0:az1, :, 1] += slab.imag * win_local[:, np.newaxis]
        wt_mm[az0:az1]        += win_local

    def _write_slc(self, slc_mm, path):
        """Write 2-band float32 GeoTIFF: band 1 = real, band 2 = imag."""
        m = self.meta
        _write_tiff(slc_mm, str(path), 2, m.r_near, m.dr_dec, m.prf)
        log.info("SLC complex → %s", path)


def _write_quicklook(amp, out_path: str,
                     vmin_db: float = -60.0, vmax_db: float = -5.0) -> bool:
    """
    Write a dB-scale PNG preview of the amplitude image.

    Mirrors the reference code:
        plt.imsave(path, 20*log10(img / max(img)), cmap='gray',
                   vmin=-60, vmax=-5)

    Returns True if written, False if matplotlib is unavailable.
    """
    if not HAS_MPL:
        log.warning("matplotlib not available — skipping PNG quicklook")
        return False

    max_val = float(amp.max())
    if max_val <= 0:
        log.warning("Amplitude image is all-zero — skipping PNG quicklook")
        return False

    with np.errstate(divide='ignore', invalid='ignore'):
        db = 20.0 * np.log10(amp / max_val)
    db = np.nan_to_num(db, nan=vmin_db, posinf=vmax_db, neginf=vmin_db)

    plt.imsave(out_path, db, cmap='gray', vmin=vmin_db, vmax=vmax_db)
    log.info("Quicklook → %s  (vmin=%.0f dB  vmax=%.0f dB)", out_path, vmin_db, vmax_db)
    return True


def _write_quicklook_from_slc(slc_path: str, ql_path: str,
                               vmin_db: float = -60.0,
                               vmax_db: float = -5.0,
                               strip_rows: int = 512,
                               max_px: int = 8192) -> bool:
    """
    Generate a dB-scale PNG quicklook by reading the SLC GeoTIFF in strips.

    Two passes over the file:
      1.  Find global maximum amplitude for normalisation.
      2.  Compute 20·log10(amp / max) strip by strip, spatially downsampled
          so the PNG longest axis is ≤ ``max_px`` pixels.

    Returns True if the PNG was written, False otherwise.
    """
    if not HAS_MPL:
        log.warning("matplotlib not available — skipping quicklook")
        return False
    if not HAS_RASTERIO:
        log.warning("rasterio not available — cannot read TIFF in strips; "
                    "skipping quicklook")
        return False

    with rasterio.open(slc_path) as src:
        n_rows, n_cols = src.height, src.width
        ds = max(1, max(n_rows, n_cols) // max_px)   # spatial downsample factor

        # ── Pass 1: global max amplitude ─────────────────────────────────
        gmax = 0.0
        for r0 in range(0, n_rows, strip_rows):
            r1  = min(r0 + strip_rows, n_rows)
            win = rasterio.windows.Window(0, r0, n_cols, r1 - r0)
            re  = src.read(1, window=win).astype(np.float32)
            im  = src.read(2, window=win).astype(np.float32)
            gmax = max(gmax, float(np.sqrt(re**2 + im**2).max()))

        if gmax <= 0.0:
            log.warning("Amplitude image is all-zero — skipping quicklook")
            return False

        # ── Pass 2: build downsampled dB image ───────────────────────────
        segs: list = []
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
    log.info("Quicklook → %s  (%dx%d px,  vmin=%.0f dB  vmax=%.0f dB)",
             ql_path, db_img.shape[0], db_img.shape[1], vmin_db, vmax_db)
    return True


# ════════════════════════════════════════════════════════════════════════════
# 10. GeoTIFF writer
# ════════════════════════════════════════════════════════════════════════════

def _write_tiff(data, out_path, n_bands, r_near, dr, prf):
    rows = data.shape[0]; cols = data.shape[1]
    if HAS_RASTERIO:
        transform = rasterio.transform.from_origin(0.0, 0.0, dr, 1.0/prf)
        big = rows * cols * n_bands * 4 > 4e9
        kw  = dict(driver='GTiff', height=rows, width=cols, count=n_bands,
                   dtype='float32', compress='zstd',zstd_level=9, predictor=2,
                   bigtiff='YES' if big else 'NO')
        with rasterio.open(out_path, 'w', **kw) as dst:
            if n_bands == 1:
                dst.write(data.astype(np.float32), 1)
            else:
                #dst.write((data[:, :, 0] + 1j * data[:, :, 1]).astype(np.complex64), 1)
                dst.write(data[:, :, 0].astype(np.float32), 1)
                dst.write(data[:, :, 1].astype(np.float32), 2)
    else:
        _write_minimal_tiff(data, out_path, n_bands)
    

def _write_minimal_tiff(data, out_path, n_bands):
    """Minimal TIFF writer (no rasterio), falls back to ENVI binary for >3.5 GB."""
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
    log.info("TIFF %s  (%.1f MB)", out_path, os.path.getsize(out_path)/1e6)


# ════════════════════════════════════════════════════════════════════════════
# 10b. Incremental TIFF strip writer
# ════════════════════════════════════════════════════════════════════════════
class _TiffStripWriter:
    """
    Write a 2-band float32 GeoTIFF one strip of rows at a time.

    When rasterio is available the output is a proper compressed GeoTIFF
    written via rasterio's windowed-write API — no full image is ever held
    in RAM.  Without rasterio the data are written as a flat float32 BIP
    binary with an ENVI header.

    Usage
    -----
        writer = _TiffStripWriter(path, na_total, nr_dec, dr, prf)
        writer.write_strip(slab, row_start)   # slab: (n, nr_dec, 2)
        writer.close()
    """

    def __init__(self, path: str, n_rows: int, n_cols: int,
                 dr: float, prf: float):
        self.path   = path
        self.n_rows = n_rows
        self.n_cols = n_cols
        self._dst   = None    # rasterio dataset handle
        self._fp    = None    # raw binary fallback

        if HAS_RASTERIO:
            big = n_rows * n_cols * 2 * 4 > 4e9
            kw  = dict(
                driver    = 'GTiff',
                height    = n_rows,
                width     = n_cols,
                count     = 2,
                dtype     = 'float32',
                compress  = 'zstd',
                zstd_level = 9,
                predictor  = 2,
                bigtiff    = 'YES' if big else 'NO',
            )
            self._dst = rasterio.open(path, 'w', **kw)
            log.info("Opened GeoTIFF for incremental strip writing: %s", path)
        else:
            raw_path       = path.replace('.tif', '.bin')
            self._fp       = open(raw_path, 'wb')
            self._raw_path = raw_path
            self._hdr_path = raw_path + '.hdr'
            log.warning("rasterio not available — writing raw BIP binary: %s",
                        raw_path)

    def write_strip(self, slab: np.ndarray, row_start: int) -> None:
        """
        Parameters
        ----------
        slab      : (n_strip, n_cols, 2) float32 — band-0=real, band-1=imag
        row_start : first row index in the full output image
        """
        n = slab.shape[0]
        if self._dst is not None:
            win = rasterio.windows.Window(
                col_off=0, row_off=row_start, width=self.n_cols, height=n)
            self._dst.write(slab[:, :, 0].astype(np.float32), 1, window=win)
            self._dst.write(slab[:, :, 1].astype(np.float32), 2, window=win)
        else:
            # BIP: for each row, write real and imag interleaved
            slab.astype(np.float32).tofile(self._fp)

    def close(self) -> None:
        if self._dst is not None:
            self._dst.close()
            self._dst = None
            log.info("GeoTIFF closed: %s", self.path)
        if self._fp is not None:
            self._fp.close()
            with open(self._hdr_path, 'w') as fh:
                fh.write(
                    f"ENVI\nsamples = {self.n_cols}\nlines = {self.n_rows}\n"
                    f"bands = 2\ndata type = 4\ninterleave = bip\n"
                    f"byte order = 0\nband names = {{real, imaginary}}\n"
                )
            log.info("Raw BIP binary → %s  header → %s",
                     self._raw_path, self._hdr_path)
            self._fp = None


# ════════════════════════════════════════════════════════════════════════════
# 11. XML metadata writer
# ════════════════════════════════════════════════════════════════════════════
def write_metadata_xml(m: Meta, fdc_mean: float, fdc_log: dict,
                       n_blocks: int, out_path: str):
    root = ET.Element("SARProcessingMetadata", version='3.0',
                      created=datetime.now(UTC).isoformat().replace('+00:00', 'Z'))
    def sub(parent, tag, text=None, **attrs):
        el = ET.SubElement(parent, tag, attrib=attrs)
        if text is not None: el.text = str(text)
        return el

    pi = sub(root,'ProductInfo')
    sub(pi,'ProductType','SLC'); sub(pi,'ProcessingLevel','L1')
    sub(pi,'Processor','sar_rda_processor.py v3.0')
    sub(pi,'ProcessingDate', datetime.now(UTC).isoformat().replace('+00:00', 'Z'))
    sub(pi,'InputFile', m.h5_path)

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

    # ── Scene UTC timing ─────────────────────────────────────────────────
    timing = sub(root,'SceneTiming')
    sub(timing,'ReferenceUTC',       m.reference_utc)
    sub(timing,'SceneSensingStartUTC', m.scene_start_utc)
    sub(timing,'SceneSensingStopUTC',  m.scene_stop_utc)
    sub(timing,'FirstLineUTC',
        m.gps_utc_iso[0] if m.gps_utc_iso else '')
    sub(timing,'LastLineUTC',
        m.gps_utc_iso[-1] if m.gps_utc_iso else '')

    # ── Full orbit state vector list (Sentinel-style) ─────────────────────
    # Format mirrors Sentinel-1 annotation XML:
    #   <orbitList count="N">
    #     <orbit>
    #       <time>UTC</time>
    #       <position>
    #         <latitude unit="deg">…</latitude>
    #         <longitude unit="deg">…</longitude>
    #         <height unit="m">…</height>
    #       </position>
    #       <velocity>
    #         <x unit="m/s">…</x>   <!-- NED North (or ECEF-X) -->
    #         <y unit="m/s">…</y>   <!-- NED East  (or ECEF-Y) -->
    #         <z unit="m/s">…</z>   <!-- NED Down  (or ECEF-Z) -->
    #       </velocity>
    #     </orbit>
    #     …
    #   </orbitList>
    #
    # GPS Time column = seconds since Reference UTC.
    # UTC = Reference_UTC + timedelta(seconds=GPS_Time[i]).
    # Verified: GPS_Time[0]=196452 s → 2024-10-15T06:34:12Z = Scene Sensing Start.
    '''
    n_sv = len(m.gps_utc_iso)
    ol   = sub(root,'orbitList', count=str(n_sv))
    for i in range(n_sv):
        o = sub(ol,'orbit')
        sub(o, 'time', m.gps_utc_iso[i])
        pos = sub(o, 'position')
        sub(pos, 'latitude',  f'{m.gps_lat_raw[i]:.10f}', unit='deg')
        sub(pos, 'longitude', f'{m.gps_lon_raw[i]:.10f}', unit='deg')
        sub(pos, 'height',    f'{m.gps_alt_raw[i]:.4f}',  unit='m')
        vel = sub(o, 'velocity')
        sub(vel, 'x', f'{m.gps_vx_raw[i]:.6f}', unit='m/s')
        sub(vel, 'y', f'{m.gps_vy_raw[i]:.6f}', unit='m/s')
        sub(vel, 'z', f'{m.gps_vz_raw[i]:.6f}', unit='m/s')
    sub(gp,'SceneSensingStartUTC', m.scene_start_utc)
    sub(gp,'SceneSensingStopUTC',  m.scene_stop_utc)
    sub(gp,'ReferenceUTC',         m.reference_utc)
    '''
    # ── Orbit / State Vector list (Sentinel-1 style orbitList) ──────────
    # GPS Time column = seconds since Reference UTC.
    # UTC[i] = Reference_UTC + gps_t[i].  Verified: gps_t[0]=196452 s
    # → 2024-10-15T06:34:12Z = Scene Sensing Start UTC. ✓
    orb = sub(root,'orbitList',
              count=str(len(m.gps_utc_iso)),
              source='GPSDATA_HQ',
              columns='Time Lat Lon Alt Vx Vy Vz',
              note='Time=seconds since Reference UTC; '
                   'Vx/Vy/Vz are NED (North/East/Down) m/s as stored in HDF5')
    for i, utc in enumerate(m.gps_utc_iso):
        sv = sub(orb, 'orbit')
        sub(sv, 'time', utc)
        pos = sub(sv, 'position', unit='deg_m')
        sub(pos, 'lat',  f'{m.gps_lat_raw[i]:.8f}')
        sub(pos, 'lon',  f'{m.gps_lon_raw[i]:.8f}')
        sub(pos, 'alt',  f'{m.gps_alt_raw[i]:.3f}')
        vel = sub(sv, 'velocity', unit='m/s', frame='NED')
        sub(vel, 'vx',   f'{m.gps_vx_raw[i]:.6f}')  # North
        sub(vel, 'vy',   f'{m.gps_vy_raw[i]:.6f}')  # East
        sub(vel, 'vz',   f'{m.gps_vz_raw[i]:.6f}')  # Down

    proc = sub(root,'Processing')

    d = sub(proc,'RangeDecimation')
    sub(d,'Factor', str(m.decimate_range))
    sub(d,'Applied','YES' if m.decimate_range > 1 else 'NO')
    if m.decimate_range > 1:
        sub(d,'Method','resample_poly (data); FIR+downsample (replica)')
        sub(d,'LPF_Taps', str(m.lpf_n_taps))
        sub(d,'fs_dec',  f'{m.fs_dec:.4e}', unit='Hz')
        sub(d,'nr_dec',  str(m.nr_dec))
        sub(d,'dr_dec',  f'{m.dr_dec:.6f}', unit='m')

    rc_el = sub(proc,'RangeCompression')
    sub(rc_el,'Method',
        'Linear matched-filter: MF=conj(flip(replica)), '
        'Nfft=nextpow2(Nrg+Nrep-1), crop=[Nrep-1:Nrep-1+Nrg]')
    sub(rc_el,'RangeResolution',
        f'{C/(2*abs(m.bw_stop-m.bw_start)):.4f}', unit='m')

    dc = sub(proc,'DopplerCentroid')
    sub(dc,'Method',
        'Per-line cross-correlation: corr=sum(s[:,n]*conj(s[:,n-1]),axis=0), '
        'fdc=PRF/(2pi)*arg(corr), Savitzky-Golay smoothed (poly=5,len=101)')
    sub(dc,'Deramping','Cumulative phase: exp(-j*2pi*cumsum(fdc)/PRF)')
    sub(dc,'MeanEstimate', f'{fdc_mean:.4f}', unit='Hz')
    for bi in sorted(fdc_log.keys()):
        sub(dc,'BlockEstimate', f'{fdc_log[bi]:.4f}', block=str(bi), unit='Hz')

    sub(proc,'RCMC',
        text='Time-domain per-column: R(n,R0)=sqrt(R0^2+(Vr*n/PRF)^2), '
             'shift=(R-R0)*2fs/c, np.interp')
    sub(proc,'AzimuthCompression',
        text='Time-domain quadratic: h(t)=exp(-j*pi*Ka_neg*t^2), '
             'Ka_neg=-2Vr^2/(lam*R), FFT-conv padded to nextpow2(2*Naz), '
             'vectorised over range chunks')

    blk = sub(proc,'BlockProcessing')
    sub(blk,'Method',
        'Sliding-window overlap-add (reference-code approach): '
        'each block reads exactly na_block lines, no zero-padding; '
        'last block slid back; entire block Tukey-weighted and accumulated')
    sub(blk,'TotalBlocks',  str(n_blocks))
    sub(blk,'na_block',     str(m.na_block))
    sub(blk,'na_overlap',   str(m.na_overlap))
    sub(blk,'na_valid_step',str(m.na_valid))
    alpha = 1 #2.0 * m.na_overlap / m.na_block
    sub(blk,'TukeyAlpha',   f'{alpha:.4f}')
    sub(blk,'SyntheticApertureLines', str(m.na_syn))
    sub(blk,'DopplerFMRateRef', f'{m.ka_ref:.4f}', unit='Hz/s')

    img = sub(root,'OutputImage')
    sub(img,'NumberOfLines',   str(m.na_total))
    sub(img,'NumberOfSamples', str(m.nr_dec))
    sub(img,'RangeSampleSpacing', f'{m.dr_dec:.6f}', unit='m')
    sub(img,'AzimuthLineSpacing', f'{1/m.prf:.8f}',  unit='s')
    sub(img,'DataType',
        'Complex SLC: float32 real + float32 imag (2-band GeoTIFF), '
        'band-1 = real, band-2 = imaginary')
    sub(img,'GeoCoding','NOT APPLIED (slant-range geometry)')

    dom = minidom.parseString(ET.tostring(root, encoding='utf-8'))
    with open(out_path, 'wb') as fh:
        fh.write(dom.toprettyxml(indent='  ', encoding='utf-8'))
    log.info("XML → %s", out_path)


# ════════════════════════════════════════════════════════════════════════════
# 12. CLI
# ════════════════════════════════════════════════════════════════════════════
def _print_parameters(m: Meta, az_batch: int = 64, rng_chunk: int = 512):
    bw    = abs(m.bw_stop - m.bw_start)
    D     = m.decimate_range
    alpha = 1 #2.0 * m.na_overlap / m.na_block
    n_blk = math.ceil((m.na_total - m.na_block) / m.na_valid) + 1

    # Memory estimates
    Nfft     = 1 << int(np.ceil(np.log2(m.nr_dec + m.nr_rep - 1)))
    L        = 1 << int(np.ceil(np.log2(2 * m.na_block)))
    raw_mb   = m.na_block * m.nr_dec * 4 / 1e6        # complex64, one block
    rg_mb    = Nfft * az_batch      * 16 / 1e6        # range FFT batch (complex128)
    az_mb    = rng_chunk * L        *  8 / 1e6        # az FFT chunk (complex64)
    peak_mb  = raw_mb * 3                             # 3 rolling buffers

    print("\n" + "="*70)
    print("  SAR RDA Processor v3.0 — Parameters")
    print("="*70)
    print(f"  Input           : {m.h5_path}")
    #print(f"  FFTW backend    : {'pyfftw (FFTW3) ← fast C library' if HAS_PYFFTW else 'numpy.fft  (pip install pyfftw for ~3× speedup)'}")
    print()
    print(f"  Carrier         : {m.fc/1e9:.3f} GHz  (λ = {m.wavelength*100:.3f} cm)")
    print(f"  PRF             : {m.prf:.1f} Hz")
    print(f"  Sampling freq   : {m.fs/1e9:.3f} GHz")
    print(f"  Chirp BW        : {bw/1e6:.0f} MHz  →  rng-res {C/(2*bw)*100:.1f} cm")
    print(f"  Platform height : {m.platform_height:.0f} m")
    print(f"  Vr_eff          : {m.Vr_eff:.3f} m/s  "
          f"(= {m.flight_speed:.3f} x {np.sqrt(Re/(Re+m.platform_height)):.6f})")
    print(f"  Look angle      : {m.look_angle:.1f}°   squint: {m.squint_angle:.4f}°")
    print()
    max_D = max(0, int(m.fs / (2*bw)))
    if D > 1:
        ok = "OK" if D <= max_D else f"WARNING — max safe D = {max_D}"
        print(f"  Range decimation: D={D}  [{ok}]")
        print(f"    fs: {m.fs/1e9:.3f} → {m.fs_dec/1e9:.4f} GHz")
        print(f"    nr: {m.nr} → {m.nr_dec}   dr: {m.dr:.4f} → {m.dr_dec:.4f} m")
    else:
        print(f"  Range decimation: D=1 (none).  Max safe D = {max_D}")
    print()
    print(f"  Output size     : {m.na_total} az x {m.nr_dec} rng")
    print(f"  R_near/mid/far  : {m.r_near:.0f} / {m.r_ref_dec:.0f} / {m.r_far_dec:.0f} m")
    print(f"  dr_dec          : {m.dr_dec:.4f} m")
    print()
    print(f"  ── Block layout ─────────────────────────────────────────────")
    print(f"  na_syn (far rng): {m.na_syn} lines  ({m.na_syn/m.prf:.2f} s)")
    print(f"  na_overlap      : {m.na_overlap} lines")
    print(f"  step / na_valid : {m.na_valid} lines")
    print(f"  na_block        : {m.na_block} lines  (= overlap + step)")
    print(f"  Tukey alpha     : {alpha:.3f}  "
          f"({'Hann (no flat top)' if alpha >= 1 else 'partial taper'})")
    print(f"  Est. blocks     : {n_blk}")
    print()
    print(f"  ── Memory per worker (estimated) ────────────────────────────")
    print(f"  Raw block       : {raw_mb:.0f} MB  complex64  ({m.nr_dec}x{m.na_block})")
    print(f"  Range FFT batch : {rg_mb:.0f} MB  (Nfft={Nfft}, az_batch={az_batch})")
    print(f"  Azimuth FFT chk : {az_mb:.0f} MB  (rng_chunk={rng_chunk}, L={L})")
    print(f"  Peak per worker : ~{peak_mb:.0f} MB  (3 rolling buffers)")
    print(f"  N workers x peak: ~{peak_mb*1:.0f}-{peak_mb*2:.0f} MB  (1-2 workers shown)")
    print("="*70 + "\n")


def main():
    logging.basicConfig(level=logging.INFO,
                        format='%(asctime)s  %(levelname)-5s  %(message)s',
                        datefmt='%H:%M:%S')
    ap = argparse.ArgumentParser(description='SAR RDA Processor v3.0',
                                 formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    ap.add_argument('--input',  '-i', required=True, help='Input HDF5 file')
    ap.add_argument('--output', '-o', required=True, help='Output directory')
    ap.add_argument('--workers','-w', type=int, default=1,
                    help='Parallel worker processes')
    ap.add_argument('--decimate-range', type=int, default=1, metavar='D',
                    help='Range decimation factor D >= 1  '
                         '(safe only when chirp_BW < fs/(2D))')
    ap.add_argument('--step', type=int, default=None, metavar='N',
                    help='Valid (output) lines per step.  '
                         'na_block = na_syn + step.  Default=1000.  '
                         'Ignored if --block is given.')
    ap.add_argument('--block', type=int, default=None, metavar='N',
                    help='Total azimuth block size in pulses (na_block). '
                         'Sets step = na_block − na_overlap. '
                         'Example: --block 3000 --overlap 2000  → step=1000.')
    ap.add_argument('--overlap', type=int, default=None, metavar='N',
                    help='Overlap in pulses (na_overlap). '
                         'Default = synthetic aperture length at far range '
                         '(≈3767 pulses for this sensor).')
    ap.add_argument('--rng-chunk', type=int, default=512,
                    help='Range-bin batch size for azimuth compression FFTs. '
                         'Peak RAM per batch = rng_chunk x L x 8 bytes. '
                         'Default 512 → ~67 MB.')
    ap.add_argument('--az-batch', type=int, default=64,
                    help='Azimuth-column batch size for range compression FFTs. '
                         'Peak RAM per batch = Nfft x az_batch x 16 bytes. '
                         'Default 64 → ~134 MB (no decimation).')
    ap.add_argument('--vmin-db', type=float, default=-60.0,
                    help='QuickLook dB floor (darker = below this)')
    ap.add_argument('--vmax-db', type=float, default=-5.0,
                    help='QuickLook dB ceiling')
    ap.add_argument('--dry-run', action='store_true',
                    help='Print parameters only, do not process')
    args = ap.parse_args()

    if not HAS_H5PY:
        print("ERROR: pip install h5py"); return 1
    if args.decimate_range < 1:
        print("ERROR: --decimate-range must be >= 1"); return 1

    m = load_metadata(args.input,
                      decimate_range=args.decimate_range,
                      valid_lines=args.step,
                      na_block_override=args.block,
                      na_overlap_override=args.overlap)
    _print_parameters(m, az_batch=getattr(args,'az_batch',64), rng_chunk=getattr(args,'rng_chunk',512))

    if args.dry_run:
        print("Dry-run complete."); return 0

    proc   = SARProcessor(args.input, args.output,
                          workers=args.workers,
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