"""CSU-04.01 range compression.

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
# scipy.fft keeps complex64 in → complex64 out (numpy.fft promotes to complex128).
# next_fast_len finds highly-composite sizes (e.g. 109760 vs 131072) that are
# significantly faster while still avoiding circular wrap-around aliasing.
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
