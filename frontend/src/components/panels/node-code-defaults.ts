import type { SarStage } from '@/types/pipeline';

export interface NodeCodeDefault {
  code: string;
  language: string;
  filename: string;
}

const L1A_RANGE_COMPRESSION = String.raw`"""CSU-04.01 range compression.

Preserved from the original V4 processor:

Range compression uses linear matched-filter convolution.
  MF   = conj(flip(replica_dec))
  Nfft = next_fast_len(Nrg + Nrep - 1)
  crop = src[Nrep-1 : Nrep-1+Nrg, :]

FFT backend note:
  Prefer scipy.fft -> pyfftw -> numpy.fft.
  scipy.fft keeps complex64 in -> complex64 out, while numpy.fft promotes to
  complex128. next_fast_len selects highly composite sizes that are faster
  while still avoiding circular wrap-around aliasing.
"""

import os

import numpy as np

# ── FFT backend: prefer scipy.fft → pyfftw → numpy.fft ─────────────────────
try:
    import scipy.fft as _scipy_fft

    def _fft(a, n=None, axis=-1, workers=-1):
        return _scipy_fft.fft(a, n=n, axis=axis, workers=workers)

    def _ifft(a, n=None, axis=-1, workers=-1):
        return _scipy_fft.ifft(a, n=n, axis=axis, workers=workers)

    def _next_fast_len(n):
        return _scipy_fft.next_fast_len(n)

except ImportError:
    try:
        import pyfftw
        import pyfftw.interfaces.numpy_fft as _pyfftw_fft

        pyfftw.interfaces.cache.enable()
        _W = os.cpu_count() or 1

        def _fft(a, n=None, axis=-1, workers=None):
            return _pyfftw_fft.fft(a, n=n, axis=axis, threads=_W)

        def _ifft(a, n=None, axis=-1, workers=None):
            return _pyfftw_fft.ifft(a, n=n, axis=axis, threads=_W)

        def _next_fast_len(n):
            return 1 << int(np.ceil(np.log2(n)))

    except ImportError:

        def _fft(a, n=None, axis=-1, workers=None):
            return np.fft.fft(a, n=n, axis=axis)

        def _ifft(a, n=None, axis=-1, workers=None):
            return np.fft.ifft(a, n=n, axis=axis)

        def _next_fast_len(n):
            return 1 << int(np.ceil(np.log2(n)))


# ════════════════════════════════════════════════════════════════════════════
# 2.  Range compression  (linear convolution, correct crop)
# ════════════════════════════════════════════════════════════════════════════
def range_compress(s: np.ndarray, replica_dec: np.ndarray, az_batch: int = 64) -> np.ndarray:
    """Apply linear range matched filtering to each azimuth column."""
    n_range, n_az = s.shape
    n_rep = len(replica_dec)
    mf = np.conj(replica_dec[::-1])                  # MF in time domain
    n_fft = _next_fast_len(n_range + n_rep - 1)      # optimal FFT size
    mf_fft = _fft(mf, n=n_fft)                       # (Nfft,) — small
    crop_lo = n_rep - 1
    crop_hi = n_rep - 1 + n_range
    out = np.empty((n_range, n_az), dtype=np.complex64)

    for c0 in range(0, n_az, az_batch):
        c1 = min(c0 + az_batch, n_az)
        s_batch = _fft(s[:, c0:c1], n=n_fft, axis=0)  # (Nfft, batch)
        rc_batch = _ifft(s_batch * mf_fft[:, np.newaxis], axis=0)
        out[:, c0:c1] = rc_batch[crop_lo:crop_hi, :].astype(np.complex64)
        del s_batch, rc_batch

    return out


__all__ = ["range_compress"]
`;

const L1B_RDA_AZIMUTH = String.raw`"""CSU-04.02 RDA azimuth processing.

Preserved from the original V4 processor:

Per azimuth block after range compression:
  1. Doppler centroid: per-line cross-correlation, Savitzky-Golay smoothed.
  2. Deramping       : exp(-j * 2*pi * cumsum(fdc) / PRF).
  3. RCMC            : time-domain interpolation per azimuth column.
                       R(n,R0) = sqrt(R0^2 + (Vr*n/PRF)^2)
  4. Azimuth compress: time-domain quadratic chirp, range-chunked FFT conv.
                       h(t) = exp(-j*pi*Ka*t^2), Ka = -2Vr^2/(lambda R)
"""

import numpy as np
from scipy.ndimage import map_coordinates as _map_coords
from scipy.signal import savgol_filter

from csu_04_01_range_compression import _fft, _ifft
from shared.metadata import C


# ════════════════════════════════════════════════════════════════════════════
# 3.  Doppler centroid profile  (per-line, SG-smoothed)
# ════════════════════════════════════════════════════════════════════════════
def estimate_fdc_profile(src_rc: np.ndarray, prf: float, smooth_len: int = 101) -> np.ndarray:
    """Estimate Doppler centroid by adjacent-line phase correlation."""
    n_range, n_az = src_rc.shape
    if n_az < 2:
        return np.zeros(n_az)
    corr = np.sum(src_rc[:, 1:] * np.conj(src_rc[:, :-1]), axis=0)  # (Naz-1,)
    fdc = (prf / (2.0 * np.pi)) * np.angle(corr)
    fdc = np.concatenate([fdc[:1], fdc])                            # (Naz,)
    window_length = min(smooth_len | 1, (len(fdc) // 2) * 2 + 1)
    if window_length >= 3:
        polyorder = min(5, window_length - 1)
        fdc = savgol_filter(fdc, window_length=window_length, polyorder=polyorder, mode="nearest")
    return fdc.astype(np.float64)


# ════════════════════════════════════════════════════════════════════════════
# 4.  Time-varying Doppler deramping
# ════════════════════════════════════════════════════════════════════════════
def remove_time_varying_fdc(src_rc: np.ndarray, fdc_profile: np.ndarray, prf: float):
    """Deramp the range-compressed block using the cumulative FDC phase."""
    phi = 2.0 * np.pi * np.cumsum(fdc_profile) / prf
    demod = np.exp(-1j * phi).astype(np.complex64)
    return (src_rc * demod[np.newaxis, :]), float(np.mean(fdc_profile))


# ════════════════════════════════════════════════════════════════════════════
# 5.  RCMC  (scipy.ndimage.map_coordinates — C backend, range-strip chunked)
# ════════════════════════════════════════════════════════════════════════════
def rcmc_time_domain(src: np.ndarray, SR: np.ndarray, Vr: float, fs: float, prf: float, rng_strip: int = 4096):
    """Apply range cell migration correction by interpolating slant-range shifts."""
    n_range, n_az = src.shape
    t_az = np.arange(n_az, dtype=np.float64) / prf   # (Naz,) seconds
    t_end = (n_az - 1) / prf
    delta_r_max = float(np.sqrt(SR.min() ** 2 + (Vr * t_end) ** 2) - SR.min())
    r_guard = int(np.ceil(2.0 * delta_r_max / C * fs)) + 8

    col_idx = np.arange(n_az, dtype=np.float64)
    out = np.empty_like(src)

    for r0 in range(0, n_range, rng_strip):
        r1 = min(r0 + rng_strip, n_range)
        r0e = max(0, r0 - r_guard)
        r1e = min(n_range, r1 + r_guard)

        strip_r = np.ascontiguousarray(src[r0e:r1e].real, dtype=np.float32)
        strip_i = np.ascontiguousarray(src[r0e:r1e].imag, dtype=np.float32)

        sr_out = SR[r0:r1]
        r_t = np.sqrt(sr_out[:, None] ** 2 + (Vr * t_az[None, :]) ** 2)
        shift = (2.0 * (r_t - sr_out[:, None]) / C) * fs
        row = np.arange(r0, r1, dtype=np.float64)[:, None] - r0e + shift
        col = np.broadcast_to(col_idx[None, :], row.shape).copy()
        coords = [row.ravel(), col.ravel()]
        rp = _map_coords(strip_r, coords, order=1, mode="nearest", prefilter=False)
        ip = _map_coords(strip_i, coords, order=1, mode="nearest", prefilter=False)

        out[r0:r1] = (rp + 1j * ip).reshape(r1 - r0, n_az).astype(np.complex64)
        del strip_r, strip_i, r_t, shift, row, col, rp, ip

    return out


# ════════════════════════════════════════════════════════════════════════════
# 6.  Azimuth compression  (time-domain quadratic chirp, range-chunked)
# ════════════════════════════════════════════════════════════════════════════
def azimuth_compress(src: np.ndarray, prf: float, Vr: float, wavelength: float, SR: np.ndarray, rng_chunk: int = 512):
    """Apply range-dependent azimuth matched filtering in range chunks."""
    n_range, n_az = src.shape
    t = np.arange(n_az, dtype=np.float64) / prf
    fft_len = 1 << int(np.ceil(np.log2(2 * n_az)))
    ka_neg = -2.0 * Vr**2 / (wavelength * SR)
    out = np.empty((n_range, n_az), dtype=np.complex64)

    for r0 in range(0, n_range, rng_chunk):
        r1 = min(r0 + rng_chunk, n_range)
        ka_chunk = ka_neg[r0:r1, np.newaxis]
        h0 = np.exp(-1j * np.pi * ka_chunk * t[np.newaxis, :] ** 2)
        h_fft = _fft(h0, n=fft_len, axis=1)
        x_chunk = _fft(src[r0:r1], n=fft_len, axis=1)
        y = _ifft(x_chunk * h_fft, axis=1)
        out[r0:r1] = y[:, :n_az].astype(np.complex64)
        del h0, h_fft, x_chunk, y

    return out


__all__ = [
    "azimuth_compress",
    "estimate_fdc_profile",
    "rcmc_time_domain",
    "remove_time_varying_fdc",
]
`;

const L1C_SLC_FORMATION = String.raw`"""CSU-04.04 SLC formation and block orchestration.

Preserved from the original V4 processor.

Block layout (sliding-window overlap-add, identical to reference code)
----------------------------------------------------------------------
  na_syn   = PRF x beamwidth_rad x R_far / Vr_eff
  overlap  = na_syn
  step     = na_valid  (default = 1000, user-overridable via --step)
  na_block = overlap + step

Per azimuth block:
  1. Read HDF5 raw lines -> transpose to (Nrg, Naz)
  2. Optional range decimation
  3. CSU-04.01 range compression
  4. Doppler centroid estimate and deramping
  5. RCMC
  6. Azimuth compression
  7. Overlap-add into the output SLC
"""

import math
import os
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from scipy.signal import resample_poly
from scipy.signal.windows import tukey

from csu_04_01_range_compression import range_compress
from csu_04_02_rda_azimuth import (
    azimuth_compress,
    estimate_fdc_profile,
    rcmc_time_domain,
    remove_time_varying_fdc,
)
from shared.io import _TiffStripWriter, _write_quicklook_from_slc, write_metadata_xml
from shared.metadata import HAS_H5PY, Meta, Re, h5py, load_metadata, log


def _build_block_schedule(na_total: int, na_block: int, step: int) -> List[dict]:
    n_runs = math.ceil((na_total - na_block) / step) + 1
    blocks = []
    for k in range(n_runs):
        az0 = k * step
        az1 = az0 + na_block
        if az1 > na_total:
            az0 = max(0, na_total - na_block)
            az1 = na_total
        blocks.append(dict(block_idx=k, az0=az0, az1=az1))
        if az1 >= na_total:
            break
    return blocks


def _process_block(args: dict) -> Tuple[int, int, np.ndarray, float]:
    """Process one azimuth block and return focused complex data plus mean FDC."""
    h5_path = args["h5_path"]
    az0 = args["az0"]
    az1 = args["az1"]
    nr_dec = args["nr_dec"]
    prf = args["prf"]
    r_near = args["r_near"]
    dr_dec = args["dr_dec"]
    fs_dec = args["fs_dec"]
    wavelength = args["wavelength"]
    vr_eff = args["Vr_eff"]
    ht = args["platform_height"]
    v_mag = args["v_mag"]
    decimate_range = args["decimate_range"]
    replica_dec = args["replica_dec"]
    smooth_len = args["smooth_len"]
    rng_chunk = args["rng_chunk"]

    with h5py.File(h5_path, "r") as f:
        chunk = f["ST0/Raw data"][az0:az1, :, :]

    na_actual = chunk.shape[0]
    s = chunk[:, :, 0].astype(np.float32) + 1j * chunk[:, :, 1].astype(np.float32)
    del chunk
    s = s.T

    if decimate_range > 1:
        s = resample_poly(s, up=1, down=decimate_range, axis=0).astype(np.complex64)

    rc = range_compress(s, replica_dec, az_batch=args["az_batch"])
    del s

    v_block = float(np.mean(v_mag[az0:az1])) if na_actual > 0 else vr_eff
    vr = v_block * np.sqrt(Re / (Re + ht))

    fdc_profile = estimate_fdc_profile(rc, prf, smooth_len=smooth_len)
    rc_deramp, fdc_mean = remove_time_varying_fdc(rc, fdc_profile, prf)
    del rc

    sr = r_near + np.arange(nr_dec) * dr_dec
    rc_rcmc = rcmc_time_domain(rc_deramp, sr, vr, fs_dec, prf)
    del rc_deramp

    focused = azimuth_compress(rc_rcmc, prf, vr, wavelength, sr, rng_chunk=rng_chunk)
    del rc_rcmc
    return args["block_idx"], az0, focused, fdc_mean


class SARProcessor:
    def __init__(
        self,
        h5_path: str,
        output_dir: str,
        workers: int = 1,
        decimate_range: int = 1,
        valid_lines: Optional[int] = None,
        na_block_override: Optional[int] = None,
        na_overlap_override: Optional[int] = None,
        rng_chunk: int = 512,
        az_batch: int = 64,
        vmin_db: float = -60.0,
        vmax_db: float = -5.0,
    ):
        self.workers = workers
        self.rng_chunk = rng_chunk
        self.az_batch = az_batch
        self.vmin_db = vmin_db
        self.vmax_db = vmax_db
        self.out_dir = Path(output_dir)
        os.makedirs(self.out_dir, exist_ok=True)

        self.meta = load_metadata(
            h5_path,
            decimate_range=decimate_range,
            valid_lines=valid_lines,
            na_block_override=na_block_override,
            na_overlap_override=na_overlap_override,
        )
        m = self.meta
        self.schedule = _build_block_schedule(m.na_total, m.na_block, m.na_valid)
        log.info(
            "Schedule: %d blocks  na_overlap=%d  step=%d  na_block=%d",
            len(self.schedule), m.na_overlap, m.na_valid, m.na_block,
        )

    def run(self) -> dict:
        m = self.meta
        out_slc = self.out_dir / "SLC_complex_w10dec16.tif"
        out_ql = self.out_dir / "QuickLook.png"
        out_xml = self.out_dir / "SLC_metadata_w10dec16.xml"

        n_blk = len(self.schedule)
        alpha = 1
        win = tukey(m.na_block, alpha=min(alpha, 1.5)).astype(np.float32)
        t0 = time.time()
        fdc_log: Dict[int, float] = {}

        buf = np.zeros((m.na_block, m.nr_dec, 2), dtype=np.float32)
        wt = np.zeros(m.na_block, dtype=np.float32)
        buf_az0 = 0
        written = 0

        base = dict(
            h5_path=m.h5_path, nr=m.nr, nr_dec=m.nr_dec, prf=m.prf,
            r_near=m.r_near, dr_dec=m.dr_dec, fs_dec=m.fs_dec,
            wavelength=m.wavelength, Vr_eff=m.Vr_eff,
            platform_height=m.platform_height, v_mag=m.v_mag,
            decimate_range=m.decimate_range, replica_dec=m.replica_dec,
            smooth_len=101, rng_chunk=self.rng_chunk, az_batch=self.az_batch,
        )

        tif_writer = _TiffStripWriter(str(out_slc), m.na_total, m.nr_dec, m.dr_dec, m.prf)

        def _accumulate_and_flush(k, az0, focused, fdc):
            nonlocal buf_az0, written
            fdc_log[k] = fdc
            na_actual = focused.shape[1]
            lo = az0 - buf_az0
            w = win[:na_actual]
            slab = focused.T.astype(np.complex64)
            buf[lo : lo + na_actual, :, 0] += slab.real * w[:, np.newaxis]
            buf[lo : lo + na_actual, :, 1] += slab.imag * w[:, np.newaxis]
            wt[lo : lo + na_actual] += w

            flush_end = (
                min(self.schedule[k + 1]["az0"], m.na_total)
                if k + 1 < n_blk else m.na_total
            )
            if flush_end <= written:
                return

            n_flush = flush_end - written
            lo_f = written - buf_az0
            slab_f = buf[lo_f : lo_f + n_flush].copy()
            safe_wt = np.maximum(wt[lo_f : lo_f + n_flush], 1e-6)
            slab_f /= safe_wt[:, np.newaxis, np.newaxis]
            tif_writer.write_strip(slab_f, written)

            remain = m.na_block - n_flush
            if remain > 0:
                buf[:remain] = buf[n_flush : m.na_block].copy()
                wt[:remain] = wt[n_flush : m.na_block].copy()
            buf[remain:] = 0.0
            wt[remain:] = 0.0
            buf_az0 = flush_end
            written = flush_end

            done = k + 1
            eta = (time.time() - t0) / done * (n_blk - done) if done < n_blk else 0
            log.info("[%d/%d] az %d-%d fdc=%.1f Hz written=%d ETA %.0fs",
                     done, n_blk, az0, az0 + na_actual, fdc, written, eta)

        if self.workers == 1:
            for k, blk in enumerate(self.schedule):
                _, az0, focused, fdc = _process_block({**base, **blk})
                _accumulate_and_flush(k, az0, focused, fdc)
        else:
            pending: Dict[int, tuple] = {}
            next_k = 0
            with ProcessPoolExecutor(max_workers=self.workers) as pool:
                futures = {pool.submit(_process_block, {**base, **blk}): blk["block_idx"] for blk in self.schedule}
                for fut in as_completed(futures):
                    bidx, az0, focused, fdc = fut.result()
                    pending[bidx] = (az0, focused, fdc)
                    while next_k in pending:
                        az0_p, foc_p, fdc_p = pending.pop(next_k)
                        _accumulate_and_flush(next_k, az0_p, foc_p, fdc_p)
                        next_k += 1

        tif_writer.close()
        fdc_mean = float(np.mean(list(fdc_log.values()))) if fdc_log else 0.0
        ql_written = _write_quicklook_from_slc(str(out_slc), str(out_ql), vmin_db=self.vmin_db, vmax_db=self.vmax_db)
        write_metadata_xml(m, fdc_mean, fdc_log, n_blk, str(out_xml))
        result = {"slc": str(out_slc), "xml": str(out_xml)}
        if ql_written:
            result["quicklook"] = str(out_ql)
        return result


__all__ = ["SARProcessor", "_build_block_schedule", "_process_block", "load_metadata", "Meta", "HAS_H5PY"]
`;

const L2A_MAP_PRODUCTS = String.raw`"""CSU-05.01 L2A map-product generation.

Generates per-pixel ancillary map layers from a focused L1C product:
  - incidence_angle (deg)   : local incidence vs. terrain normal
  - nesz (dB)               : noise-equivalent sigma-zero
  - nlooks                  : effective number of looks per pixel
  - layover_shadow          : 0/1/2 mask (none / layover / shadow)

Inputs:
    slc_geo_path : geocoded SLC (or RTC sigma0) GeoTIFF from L1C
    dem_path     : DEM aligned to the same grid (bilinear up-sampled if needed)
    orbit_state  : per-line satellite ECEF position+velocity (npz)
Outputs:
    incidence_angle.tif, nesz.tif, nlooks.tif, layover_shadow.tif

The implementation prefers numexpr for hot loops and uses windowed
DEM gradient estimates with a 3x3 Sobel kernel.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Tuple

import numpy as np
import rasterio
from rasterio.windows import Window
from scipy.ndimage import sobel


@dataclass(frozen=True)
class GridSpec:
    rows: int
    cols: int
    pixel_m: float
    crs: str


def _load_dem(path: str | Path, grid: GridSpec) -> np.ndarray:
    with rasterio.open(path) as src:
        if (src.height, src.width) != (grid.rows, grid.cols):
            dem = src.read(
                1, out_shape=(grid.rows, grid.cols), resampling=rasterio.enums.Resampling.bilinear
            )
        else:
            dem = src.read(1)
    return dem.astype(np.float32)


def _terrain_normals(dem: np.ndarray, pixel_m: float) -> np.ndarray:
    gx = sobel(dem, axis=1, mode="reflect") / (8.0 * pixel_m)
    gy = sobel(dem, axis=0, mode="reflect") / (8.0 * pixel_m)
    nx = -gx
    ny = -gy
    nz = np.ones_like(dem, dtype=np.float32)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / norm, ny / norm, nz / norm], axis=-1).astype(np.float32)


def compute_incidence_angle(
    sat_ecef: np.ndarray,         # (rows, cols, 3) per-pixel satellite vector
    ground_ecef: np.ndarray,      # (rows, cols, 3) ground point ECEF
    terrain_normal: np.ndarray,   # (rows, cols, 3)
) -> np.ndarray:
    look = ground_ecef - sat_ecef
    look /= np.linalg.norm(look, axis=-1, keepdims=True)
    cos_inc = np.einsum("...i,...i->...", -look, terrain_normal)
    inc = np.degrees(np.arccos(np.clip(cos_inc, -1.0, 1.0)))
    return inc.astype(np.float32)


def compute_nesz(
    sigma0_db: np.ndarray, noise_floor_db: float, calibration_db: float
) -> np.ndarray:
    """Pixel-wise NESZ = noise_floor - calibration - 10*log10(thermal_correction)."""
    thermal = 10.0 ** ((sigma0_db - calibration_db) / 10.0)
    nesz = noise_floor_db - 10.0 * np.log10(np.maximum(thermal, 1e-6))
    return nesz.astype(np.float32)


def compute_nlooks(slc_intensity: np.ndarray, az_looks: int, rg_looks: int) -> np.ndarray:
    if az_looks <= 1 and rg_looks <= 1:
        return np.full(slc_intensity.shape, 1.0, dtype=np.float32)
    kernel = np.ones((az_looks, rg_looks), dtype=np.float32)
    from scipy.signal import fftconvolve

    looks = fftconvolve(slc_intensity > 0, kernel, mode="same")
    return looks.astype(np.float32)


def compute_layover_shadow(
    incidence_angle: np.ndarray, look_angle: np.ndarray, slope_along_range: np.ndarray,
) -> np.ndarray:
    layover = (slope_along_range > look_angle).astype(np.uint8)
    shadow = (incidence_angle >= 90.0).astype(np.uint8)
    mask = np.zeros_like(incidence_angle, dtype=np.uint8)
    mask[layover == 1] = 1
    mask[shadow == 1] = 2
    return mask


def run_l2a_map_products(slc_geo_path: str, dem_path: str, orbit_npz: str, out_dir: str) -> dict:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    with rasterio.open(slc_geo_path) as src:
        sigma0_db = src.read(1).astype(np.float32)
        grid = GridSpec(rows=src.height, cols=src.width, pixel_m=abs(src.res[0]), crs=src.crs.to_string())
        profile = src.profile

    dem = _load_dem(dem_path, grid)
    normals = _terrain_normals(dem, grid.pixel_m)

    orbit = np.load(orbit_npz)
    sat_ecef = orbit["sat_ecef"]
    ground_ecef = orbit["ground_ecef"]
    look_angle = orbit["look_angle"]
    slope_rg = orbit["slope_along_range"]

    inc = compute_incidence_angle(sat_ecef, ground_ecef, normals)
    nesz = compute_nesz(sigma0_db, noise_floor_db=-26.0, calibration_db=-3.5)
    nlooks = compute_nlooks(np.abs(sigma0_db), az_looks=1, rg_looks=1)
    mask = compute_layover_shadow(inc, look_angle, slope_rg)

    profile.update(dtype="float32", count=1)
    layers = {
        "incidence_angle.tif": inc,
        "nesz.tif": nesz,
        "nlooks.tif": nlooks,
    }
    for name, arr in layers.items():
        with rasterio.open(out / name, "w", **profile) as dst:
            dst.write(arr, 1)

    profile.update(dtype="uint8")
    with rasterio.open(out / "layover_shadow.tif", "w", **profile) as dst:
        dst.write(mask, 1)

    return {name: str(out / name) for name in [*layers.keys(), "layover_shadow.tif"]}


__all__ = [
    "compute_incidence_angle",
    "compute_layover_shadow",
    "compute_nesz",
    "compute_nlooks",
    "run_l2a_map_products",
]
`;

const L2B_SCENE_ANALYSIS = String.raw`"""CSU-05.02 L2B scene analysis (MSK / OBJ / CHG).

Produces three derived L2B layers from L2A inputs and a registered reference
acquisition:
  - MSK : water/land/urban segmentation mask (uint8 class ids)
  - OBJ : ship/structure detections as a GeoJSON FeatureCollection
  - CHG : pixel-wise change-detection ratio (sigma0 ratio in dB)

Algorithms:
  - Segmentation : K-means on (sigma0_VV, NESZ, incidence_angle) with morphological
                   opening to suppress speckle.
  - Detection    : CFAR (CA-CFAR, 31x31 reference, 3x3 guard) followed by
                   connected-component analysis; objects below min_area_m2 dropped.
  - Change       : 10*log10(sigma0_now / sigma0_ref), with bias correction using
                   stable land pixels (water masked out).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, List

import numpy as np
import rasterio
from rasterio.features import shapes
from scipy import ndimage as ndi
from scipy.signal import fftconvolve
from sklearn.cluster import MiniBatchKMeans


# ── Class IDs for the segmentation mask ──────────────────────────────────────
CLASS_WATER = 1
CLASS_LAND = 2
CLASS_URBAN = 3


def segment_scene(sigma0_db: np.ndarray, nesz_db: np.ndarray, incidence: np.ndarray) -> np.ndarray:
    feats = np.stack([sigma0_db, nesz_db, incidence], axis=-1).reshape(-1, 3).astype(np.float32)
    km = MiniBatchKMeans(n_clusters=3, batch_size=8192, n_init=4, random_state=42)
    labels = km.fit_predict(feats).reshape(sigma0_db.shape)
    centers = km.cluster_centers_

    order = np.argsort(centers[:, 0])  # darkest cluster first
    remap = np.zeros(3, dtype=np.uint8)
    remap[order[0]] = CLASS_WATER
    remap[order[1]] = CLASS_LAND
    remap[order[2]] = CLASS_URBAN
    mask = remap[labels]

    mask = ndi.binary_opening(mask == CLASS_WATER, iterations=2).astype(np.uint8) * CLASS_WATER \
        + ndi.binary_opening(mask == CLASS_LAND, iterations=1).astype(np.uint8) * CLASS_LAND \
        + (mask == CLASS_URBAN).astype(np.uint8) * CLASS_URBAN
    return mask.astype(np.uint8)


def cfar_detect(
    sigma0_lin: np.ndarray, ref_size: int = 31, guard_size: int = 3, pfa: float = 1e-6,
) -> np.ndarray:
    """Cell-averaging CFAR with a square guard region."""
    ref_kernel = np.ones((ref_size, ref_size), dtype=np.float32)
    guard_kernel = np.ones((guard_size, guard_size), dtype=np.float32)

    ref_kernel[
        ref_size // 2 - guard_size // 2 : ref_size // 2 + guard_size // 2 + 1,
        ref_size // 2 - guard_size // 2 : ref_size // 2 + guard_size // 2 + 1,
    ] = 0
    n_ref = ref_kernel.sum()

    mean_bg = fftconvolve(sigma0_lin, ref_kernel, mode="same") / max(n_ref, 1)
    threshold_factor = -np.log(pfa)  # exponential CFAR
    threshold = mean_bg * threshold_factor
    return (sigma0_lin > threshold).astype(np.uint8)


def vectorize_detections(mask: np.ndarray, transform, min_area_m2: float, pixel_m: float) -> List[dict]:
    min_area_pix = int(np.ceil(min_area_m2 / (pixel_m * pixel_m)))
    labeled, n = ndi.label(mask)
    keep = np.zeros(n + 1, dtype=bool)
    keep[1:] = ndi.sum(mask, labeled, index=np.arange(1, n + 1)) >= min_area_pix
    cleaned = keep[labeled].astype(np.uint8)

    features = []
    for geom, value in shapes(cleaned, mask=cleaned == 1, transform=transform):
        features.append({
            "type": "Feature",
            "properties": {"class": "ship_or_structure", "value": int(value)},
            "geometry": geom,
        })
    return features


def change_ratio_db(sigma0_now: np.ndarray, sigma0_ref: np.ndarray, mask: np.ndarray) -> np.ndarray:
    eps = 1e-6
    ratio = 10.0 * np.log10(np.maximum(sigma0_now, eps) / np.maximum(sigma0_ref, eps))
    land = mask == CLASS_LAND
    if land.any():
        bias = float(np.median(ratio[land]))
        ratio -= bias
    return ratio.astype(np.float32)


def run_l2b_scene_analysis(
    sigma0_now_path: str,
    sigma0_ref_path: str,
    nesz_path: str,
    incidence_path: str,
    out_dir: str,
    pixel_m: float = 10.0,
    min_object_area_m2: float = 60.0,
) -> dict:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    with rasterio.open(sigma0_now_path) as s_now, \
         rasterio.open(sigma0_ref_path) as s_ref, \
         rasterio.open(nesz_path) as nesz_src, \
         rasterio.open(incidence_path) as inc_src:
        sigma0_now_db = s_now.read(1).astype(np.float32)
        sigma0_ref_db = s_ref.read(1).astype(np.float32)
        nesz = nesz_src.read(1).astype(np.float32)
        inc = inc_src.read(1).astype(np.float32)
        profile = s_now.profile
        transform = s_now.transform

    msk = segment_scene(sigma0_now_db, nesz, inc)

    sigma0_lin = 10.0 ** (sigma0_now_db / 10.0)
    det_mask = cfar_detect(sigma0_lin, ref_size=31, guard_size=3, pfa=1e-6)
    objects = vectorize_detections(det_mask, transform, min_object_area_m2, pixel_m)

    sigma0_now_lin = 10.0 ** (sigma0_now_db / 10.0)
    sigma0_ref_lin = 10.0 ** (sigma0_ref_db / 10.0)
    chg = change_ratio_db(sigma0_now_lin, sigma0_ref_lin, msk)

    profile.update(dtype="uint8", count=1)
    with rasterio.open(out / "MSK.tif", "w", **profile) as dst:
        dst.write(msk, 1)

    profile.update(dtype="float32")
    with rasterio.open(out / "CHG.tif", "w", **profile) as dst:
        dst.write(chg, 1)

    obj_path = out / "OBJ.geojson"
    obj_path.write_text(json.dumps(
        {"type": "FeatureCollection", "features": objects}, indent=2,
    ))

    return {
        "msk": str(out / "MSK.tif"),
        "chg": str(out / "CHG.tif"),
        "obj": str(obj_path),
        "n_objects": len(objects),
    }


__all__ = [
    "cfar_detect",
    "change_ratio_db",
    "run_l2b_scene_analysis",
    "segment_scene",
    "vectorize_detections",
]
`;

const L0_RAW_DATA_FORMATTING = String.raw`"""CSU-03.01 raw data formatting (L0).

Reads the raw downlink frames written by the ground station (CSC-02), sorts
the pulses into chronological order, extracts per-pulse metadata, formats the
range lines into a (Naz, Nrg, 2) HDF5 layout used by the L1A SAR focuser, and
applies the per-channel calibration factors recorded with the bitstream.

Input:
  raw_path : downlink bitstream (binary)
  cal_path : calibration table CSV exported by the radiometric lab
Output:
  out_h5   : HDF5 file with /ST0/Raw data, /ST0/Replica, attribute metadata
"""

from __future__ import annotations

import csv
import struct
from pathlib import Path
from typing import Iterable, List

import h5py
import numpy as np


# ── Time Ordering & Synchronization ─────────────────────────────────────────
def time_order_pulses(frames: List[dict]) -> List[dict]:
    """Sort raw frames by satellite UTC and drop duplicates from PRF-jitter."""
    frames_sorted = sorted(frames, key=lambda fr: (fr["pri_count"], fr["pulse_idx"]))
    deduped: List[dict] = []
    last_key = None
    for fr in frames_sorted:
        key = (fr["pri_count"], fr["pulse_idx"])
        if key == last_key:
            continue
        deduped.append(fr)
        last_key = key
    return deduped


# ── Metadata Extraction ─────────────────────────────────────────────────────
_HEADER_FMT = "<IIddffffff"  # pri_count, pulse_idx, t_utc, t_sat, prf, fc, fs, pw, look, sq

def extract_metadata(header_bytes: bytes) -> dict:
    """Parse the fixed CADU/VCDU pulse header into a structured dict."""
    fields = struct.unpack(_HEADER_FMT, header_bytes[: struct.calcsize(_HEADER_FMT)])
    keys = (
        "pri_count", "pulse_idx", "t_utc", "t_sat",
        "prf", "fc", "fs", "pw", "look_angle", "squint_angle",
    )
    return dict(zip(keys, fields))


def aggregate_acquisition_metadata(frames: Iterable[dict]) -> dict:
    """Collapse per-pulse metadata into per-acquisition attributes."""
    frames = list(frames)
    if not frames:
        return {}
    return {
        "PRF": float(np.mean([fr["prf"] for fr in frames])),
        "Carrier Frequency": float(frames[0]["fc"]),
        "Sampling Frequency": float(frames[0]["fs"]),
        "Pulse Width": float(frames[0]["pw"]),
        "Look Angle": float(frames[0]["look_angle"]),
        "Squint Angle": float(frames[0]["squint_angle"]),
        "Acquisition Start UTC": float(frames[0]["t_utc"]),
        "Acquisition End UTC": float(frames[-1]["t_utc"]),
    }


# ── Range Line Formatting ───────────────────────────────────────────────────
def format_range_lines(frames: List[dict], n_rg: int) -> np.ndarray:
    """Assemble (Naz, Nrg, 2) int16 raw cube from per-pulse I/Q payloads."""
    n_az = len(frames)
    cube = np.empty((n_az, n_rg, 2), dtype=np.int16)
    for k, fr in enumerate(frames):
        iq = np.frombuffer(fr["iq"], dtype=np.int16).reshape(n_rg, 2)
        cube[k] = iq
    return cube


# ── Calibration ─────────────────────────────────────────────────────────────
def load_calibration(cal_path: str | Path) -> dict:
    """Load (gain_db, phase_deg, noise_floor_db) per channel from CSV."""
    table: dict = {}
    with open(cal_path, newline="") as fh:
        for row in csv.DictReader(fh):
            table[row["channel"]] = {
                "gain_db": float(row["gain_db"]),
                "phase_deg": float(row["phase_deg"]),
                "noise_floor_db": float(row["noise_floor_db"]),
            }
    return table


def apply_calibration(cube: np.ndarray, cal: dict, channel: str = "VV") -> np.ndarray:
    """Apply linear gain and phase correction to the raw cube in place."""
    g_lin = 10.0 ** (cal[channel]["gain_db"] / 20.0)
    phi_rad = np.deg2rad(cal[channel]["phase_deg"])
    cos_p = np.cos(phi_rad)
    sin_p = np.sin(phi_rad)

    re = cube[..., 0].astype(np.float32) * g_lin
    im = cube[..., 1].astype(np.float32) * g_lin
    re_rot = re * cos_p - im * sin_p
    im_rot = re * sin_p + im * cos_p

    out = np.empty_like(cube, dtype=np.int16)
    out[..., 0] = np.clip(re_rot, -32768, 32767).astype(np.int16)
    out[..., 1] = np.clip(im_rot, -32768, 32767).astype(np.int16)
    return out


# ── Pipeline orchestrator ───────────────────────────────────────────────────
def build_l0_h5(raw_path: str, cal_path: str, out_h5: str, n_rg: int) -> dict:
    raw = Path(raw_path).read_bytes()
    frames: List[dict] = []
    cursor = 0
    header_size = struct.calcsize(_HEADER_FMT)
    payload_size = n_rg * 2 * 2  # int16 I + int16 Q
    while cursor + header_size + payload_size <= len(raw):
        meta = extract_metadata(raw[cursor : cursor + header_size])
        meta["iq"] = raw[cursor + header_size : cursor + header_size + payload_size]
        frames.append(meta)
        cursor += header_size + payload_size

    frames = time_order_pulses(frames)
    cube = format_range_lines(frames, n_rg)
    cal = load_calibration(cal_path)
    cube = apply_calibration(cube, cal, channel="VV")

    attrs = aggregate_acquisition_metadata(frames)
    with h5py.File(out_h5, "w") as h5:
        grp = h5.create_group("ST0")
        grp.create_dataset("Raw data", data=cube, chunks=True, compression="gzip", compression_opts=4)
        for k, v in attrs.items():
            grp.attrs[k] = v
    return {"out_h5": out_h5, "n_pulses": len(frames), "n_range_bins": n_rg}


__all__ = [
    "aggregate_acquisition_metadata",
    "apply_calibration",
    "build_l0_h5",
    "extract_metadata",
    "format_range_lines",
    "load_calibration",
    "time_order_pulses",
]
`;

export const NODE_CODE_DEFAULTS_BY_STAGE: Partial<Record<SarStage, NodeCodeDefault>> = {
  L0: {
    code: L0_RAW_DATA_FORMATTING,
    language: 'python',
    filename: 'csu_03_01_raw_data_formatting.py',
  },
  L1A: {
    code: L1A_RANGE_COMPRESSION,
    language: 'python',
    filename: 'csu_04_01_range_compression.py',
  },
  L1B: {
    code: L1B_RDA_AZIMUTH,
    language: 'python',
    filename: 'csu_04_02_rda_azimuth.py',
  },
  L1C: {
    code: L1C_SLC_FORMATION,
    language: 'python',
    filename: 'csu_04_04_slc_formation.py',
  },
  L2A: {
    code: L2A_MAP_PRODUCTS,
    language: 'python',
    filename: 'csu_05_01_map_products.py',
  },
  L2B: {
    code: L2B_SCENE_ANALYSIS,
    language: 'python',
    filename: 'csu_05_02_scene_analysis.py',
  },
};

export function getDefaultCode(stage: SarStage | undefined): NodeCodeDefault | null {
  if (!stage) return null;
  return NODE_CODE_DEFAULTS_BY_STAGE[stage] ?? null;
}

/**
 * Task name → 코드에서 그 task가 "활성"인지 판단할 키워드 목록.
 * 비주석 코드 라인에 키워드가 하나라도 포함되어 있으면 task가 활성으로 간주된다.
 * 사용자가 # 주석 처리하면 그 라인은 무시되어 task가 비활성으로 표시된다.
 */
export const TASK_KEYWORDS_BY_STAGE: Partial<Record<SarStage, Record<string, string[]>>> = {
  L0: {
    'Time Ordering & Synchronization': ['time_order', 'sort_by_time', 'time ordering', 'sync', 'synchroniz'],
    'Metadata Extraction': ['metadata', 'extract_meta', 'parse_header'],
    'Range Line Formatting': ['range_line', 'format_range', 'range line', 'reshape'],
    'Calibration': ['calibrat', 'calib_factor', 'apply_cal'],
  },
  L1A: {
    'Range Compression': ['range_compress', 'range compression'],
    'Azimuth Compression': ['azimuth_compress', 'azimuth compression'],
    'Autofocusing': ['autofocus', 'autofocusing'],
    'Multi-mode Support': ['multi_mode', 'multimode', 'multi-mode'],
    'SLC Product': ['slc', 'sarprocessor', 'slc product'],
  },
  L1B: {
    'Multi-look Processing': ['multilook', 'multi_look', 'multi-look'],
    'Speckle Filtering': ['speckle', 'lee_filter', 'frost_filter'],
    'Ground-range Projection': ['ground_range', 'gr_projection', 'ground-range'],
    'Amplitude/phase Product': ['amplitude', 'phase'],
  },
  L1C: {
    'DEM Integration': ['dem', 'digital_elevation'],
    'Geometric Correction': ['geometric', 'geocoding', 'geocode'],
    'Radiometric Terrain Correction': ['rtc', 'radiometric', 'terrain_correction'],
    'Map Projection': ['map_projection', 'reproject', 'projection'],
  },
  L2A: {
    'Incidence Angle Map': ['incidence_angle', 'incidence'],
    'NESZ Map': ['nesz'],
    'Number-of-looks Map': ['nlooks', 'number_of_looks', 'compute_nlooks'],
    'Layover and Shadow Masks': ['layover', 'shadow'],
  },
  L2B: {
    'Object Detection': ['cfar', 'detect', 'vectorize_detections', 'object_detection'],
    'Change Detection': ['change_detection', 'change_ratio', 'segment_scene'],
  },
};

/** Python `"""..."""` / `'''...'''` 블록 도큐스트링을 모두 빈 문자열로 치환한다. */
function stripPythonDocstrings(code: string): string {
  return code
    .replace(/"""[\s\S]*?"""/g, '')
    .replace(/'''[\s\S]*?'''/g, '');
}

/** `#` 주석 라인만 모아 한 문자열로 (task 이름 어노테이션 검사용). */
function collectHashComments(code: string): string {
  const noDocs = stripPythonDocstrings(code);
  const out: string[] = [];
  for (const line of noDocs.split('\n')) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('#')) {
      out.push(trimmed.slice(1));
      continue;
    }
    const hashIdx = line.indexOf('#');
    if (hashIdx >= 0) {
      const before = line.slice(0, hashIdx);
      const sq = (before.match(/'/g) ?? []).length;
      const dq = (before.match(/"/g) ?? []).length;
      if (sq % 2 === 0 && dq % 2 === 0) {
        out.push(line.slice(hashIdx + 1));
      }
    }
  }
  return out.join('\n').toLowerCase();
}

/** 도큐스트링과 `#` 주석을 모두 제거한 "실제 코드 본문"만 남긴다. */
function stripPythonCommentsAndDocstrings(code: string): string {
  const noDocs = stripPythonDocstrings(code);
  return noDocs
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('#')) return '';
      const hashIdx = line.indexOf('#');
      if (hashIdx >= 0) {
        const before = line.slice(0, hashIdx);
        const sq = (before.match(/'/g) ?? []).length;
        const dq = (before.match(/"/g) ?? []).length;
        if (sq % 2 === 0 && dq % 2 === 0) return before;
      }
      return line;
    })
    .join('\n')
    .toLowerCase();
}

/**
 * task 활성 여부 판단:
 *   1) `#` 주석 라인에 task 이름이 적혀 있으면 활성 — 예: `# DEM Integration` 한 줄이면 그 task가 명시적으로 켜진다.
 *      (도큐스트링 `"""…"""` 안의 언급은 활성 신호로 보지 않음 — 모듈 설명일 뿐)
 *   2) 또는 비-주석/비-도큐스트링 본문에서 task 키워드(예: `dem`)가 등장하면 활성 — 실제 구현 신호.
 *   둘 다 아니면 비활성.
 */
export function isTaskActiveInCode(code: string, taskName: string, keywords: string[]): boolean {
  if (!code) return false;
  // 1) `#` 주석 라인에 명시적 task 이름 어노테이션
  const hashComments = collectHashComments(code);
  if (hashComments.includes(taskName.toLowerCase())) return true;
  // 2) 실제 코드 본문에서 키워드 매칭 (도큐스트링/주석 모두 제외)
  const body = stripPythonCommentsAndDocstrings(code);
  return keywords.some((kw) => body.includes(kw.toLowerCase()));
}
