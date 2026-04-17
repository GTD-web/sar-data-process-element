import sys
import unittest
from pathlib import Path

import numpy as np

PROCESSOR_DIR = Path(__file__).resolve().parents[1]
if str(PROCESSOR_DIR) not in sys.path:
    sys.path.insert(0, str(PROCESSOR_DIR))

from csu_04_01_range_compression import range_compress
from csu_04_02_rda_azimuth import (
    azimuth_compress,
    estimate_fdc_profile,
    rcmc_time_domain,
    remove_time_varying_fdc,
)
from csu_04_04_slc_formation import _build_block_schedule
from shared.metadata import _decimate_replica

from raw import sar_rda_processorV4 as original


class Csu04UnitTests(unittest.TestCase):
    def test_decimate_replica_preserves_complex_dtype_and_reduces_length(self):
        replica = np.exp(1j * np.linspace(0.0, np.pi, 64)).astype(np.complex64)
        decimated = _decimate_replica(replica, D=4, n_taps=17)
        self.assertEqual(decimated.dtype, np.complex64)
        self.assertTrue(15 <= len(decimated) <= 17)
        self.assertTrue(np.iscomplexobj(decimated))

    def test_range_compress_identity_with_unit_replica(self):
        src = np.zeros((8, 3), dtype=np.complex64)
        src[4, 1] = 1.0 + 0.0j
        out = range_compress(src, np.array([1.0 + 0.0j], dtype=np.complex64), az_batch=2)
        np.testing.assert_allclose(out, src)

    def test_estimate_fdc_profile_tracks_known_doppler(self):
        prf = 1200.0
        fdc_hz = 150.0
        n_az = 64
        phase = np.exp(1j * 2.0 * np.pi * fdc_hz * np.arange(n_az) / prf).astype(np.complex64)
        src = np.tile(phase, (6, 1))
        fdc = estimate_fdc_profile(src, prf=prf, smooth_len=9)
        self.assertEqual(fdc.shape, (n_az,))
        np.testing.assert_allclose(fdc[5:], fdc_hz, atol=1e-3)

    def test_remove_time_varying_fdc_preserves_energy_and_returns_mean(self):
        src = np.ones((4, 10), dtype=np.complex64)
        profile = np.linspace(-20.0, 20.0, 10)
        deramped, mean_fdc = remove_time_varying_fdc(src, profile, prf=1000.0)
        self.assertEqual(deramped.shape, src.shape)
        np.testing.assert_allclose(np.abs(deramped), np.abs(src), atol=1e-6)
        self.assertEqual(mean_fdc, np.mean(profile))

    def test_rcmc_time_domain_is_noop_when_velocity_zero(self):
        src = (np.arange(24).reshape(6, 4) + 1j * np.arange(24).reshape(6, 4)).astype(np.complex64)
        sr = np.linspace(1000.0, 1010.0, 6)
        out = rcmc_time_domain(src, sr, Vr=0.0, fs=20.0, prf=1000.0, rng_strip=3)
        np.testing.assert_allclose(out, src, atol=1e-6)

    def test_azimuth_compress_zero_signal_stays_zero(self):
        src = np.zeros((5, 12), dtype=np.complex64)
        sr = np.linspace(1000.0, 1200.0, 5)
        out = azimuth_compress(src, prf=1000.0, Vr=120.0, wavelength=0.03, SR=sr, rng_chunk=2)
        np.testing.assert_allclose(out, 0.0)

    def test_build_block_schedule_covers_tail_without_overrun(self):
        blocks = _build_block_schedule(na_total=220, na_block=120, step=50)
        self.assertEqual(blocks[0], {"block_idx": 0, "az0": 0, "az1": 120})
        self.assertEqual(blocks[-1]["az1"], 220)
        self.assertTrue(all((blk["az1"] - blk["az0"]) <= 120 for blk in blocks))
        self.assertEqual([blk["az0"] for blk in blocks], [0, 50, 100])

    def test_original_raw_module_is_directly_importable(self):
        src = np.zeros((4, 2), dtype=np.complex64)
        src[1, 0] = 1.0 + 0.0j
        out = original.range_compress(src, np.array([1.0 + 0.0j], dtype=np.complex64), az_batch=1)
        np.testing.assert_allclose(out, src)


if __name__ == "__main__":
    unittest.main()
