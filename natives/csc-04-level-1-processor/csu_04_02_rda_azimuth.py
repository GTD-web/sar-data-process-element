"""CSU-04.02 RDA azimuth processing.

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
    # Maximum RCMC shift (at the far end of slow-time axis, near range)
    t_end = (n_az - 1) / prf
    delta_r_max = float(np.sqrt(SR.min() ** 2 + (Vr * t_end) ** 2) - SR.min())
    r_guard = int(np.ceil(2.0 * delta_r_max / C * fs)) + 8

    col_idx = np.arange(n_az, dtype=np.float64)       # (Naz,) — reused per strip
    out = np.empty_like(src)

    for r0 in range(0, n_range, rng_strip):
        r1 = min(r0 + rng_strip, n_range)
        # Extended source strip: include r_guard bins on each side so that
        # interpolation coordinates always land within the loaded strip.
        r0e = max(0, r0 - r_guard)
        r1e = min(n_range, r1 + r_guard)

        # Separate real/imag arrays for map_coordinates (operates on real arrays)
        strip_r = np.ascontiguousarray(src[r0e:r1e].real, dtype=np.float32)
        strip_i = np.ascontiguousarray(src[r0e:r1e].imag, dtype=np.float32)

        sr_out = SR[r0:r1]                                        # (nout,)
        r_t = np.sqrt(sr_out[:, None] ** 2 + (Vr * t_az[None, :]) ** 2)
        shift = (2.0 * (r_t - sr_out[:, None]) / C) * fs          # (nout, Naz)
        # Row coordinates IN the extended strip
        row = np.arange(r0, r1, dtype=np.float64)[:, None] - r0e + shift
        col = np.broadcast_to(col_idx[None, :], row.shape).copy()  # (nout, Naz)
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
    fft_len = 1 << int(np.ceil(np.log2(2 * n_az)))    # nextpow2 above 2·Naz
    ka_neg = -2.0 * Vr**2 / (wavelength * SR)         # (Nrg,) < 0
    out = np.empty((n_range, n_az), dtype=np.complex64)

    for r0 in range(0, n_range, rng_chunk):
        r1 = min(r0 + rng_chunk, n_range)
        ka_chunk = ka_neg[r0:r1, np.newaxis]                           # (chunk,1)
        # chirp filter — Ka_neg<0, so −j·π·Ka_neg·t² has positive exponent
        h0 = np.exp(-1j * np.pi * ka_chunk * t[np.newaxis, :] ** 2)
        h_fft = _fft(h0, n=fft_len, axis=1)
        x_chunk = _fft(src[r0:r1], n=fft_len, axis=1)                   # (chunk,L)
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
