"""Unit tests for CSU-04.05 speckle filter sub-step.

Filters are exercised through `apply_filter` so the dispatcher and the
underlying numba/numpy path are both covered. JIT warm-up is paid once at
import time by the first numba-backed call (constant-input boxcar test).
"""

import sys
import unittest
from pathlib import Path

import numpy as np

PROCESSOR_DIR = Path(__file__).resolve().parents[1]
if str(PROCESSOR_DIR) not in sys.path:
    sys.path.insert(0, str(PROCESSOR_DIR))

import csu_04_05_speckle_filter as sf


class FilterInvariantTests(unittest.TestCase):
    def test_filter_names_contains_expected_modes(self):
        self.assertEqual(
            set(sf.FILTER_NAMES),
            {"boxcar", "lee", "enhanced_lee", "gamma_map", "median"},
        )

    def test_apply_filter_rejects_unknown_name(self):
        with self.assertRaises(ValueError):
            sf.apply_filter(np.ones((4, 4), np.float32), name="ridiculous")

    def test_boxcar_on_constant_returns_same_constant(self):
        img = np.full((9, 9), 42.0, dtype=np.float32)
        out = sf.apply_filter(img, name="boxcar", win_x=3, win_y=3)
        np.testing.assert_allclose(out, 42.0, atol=1e-4)

    def test_lee_on_constant_returns_same_constant(self):
        """Variance = 0 → weight collapses to 0 → output = local mean = constant."""
        img = np.full((9, 9), 7.0, dtype=np.float32)
        out = sf.apply_filter(img, name="lee", win_x=3, win_y=3, looks=4.0)
        np.testing.assert_allclose(out, 7.0, atol=1e-4)

    def test_enhanced_lee_on_constant_returns_same_constant(self):
        img = np.full((9, 9), 5.0, dtype=np.float32)
        out = sf.apply_filter(img, name="enhanced_lee", win_x=3, win_y=3,
                              looks=4.0, damping=1.0)
        np.testing.assert_allclose(out, 5.0, atol=1e-4)

    def test_gamma_map_on_constant_returns_same_constant(self):
        img = np.full((9, 9), 11.0, dtype=np.float32)
        out = sf.apply_filter(img, name="gamma_map", win_x=3, win_y=3, looks=4.0)
        np.testing.assert_allclose(out, 11.0, atol=1e-4)

    def test_median_removes_salt_and_pepper(self):
        img = np.full((9, 9), 50.0, dtype=np.float32)
        img[4, 4] = 1000.0          # impulse
        img[2, 7] = 0.0             # zero outlier
        out = sf.apply_filter(img, name="median", win_x=3, win_y=3)
        # Median over a 3×3 window of mostly-50 entries is 50.
        self.assertAlmostEqual(float(out[4, 4]), 50.0, places=3)
        self.assertAlmostEqual(float(out[2, 7]), 50.0, places=3)

    def test_boxcar_blurs_a_single_impulse_into_window(self):
        img = np.zeros((11, 11), dtype=np.float32)
        img[5, 5] = 9.0
        out = sf.apply_filter(img, name="boxcar", win_x=3, win_y=3)
        # The impulse mass = 9 spreads uniformly across 9 pixels → 1.0 each.
        np.testing.assert_allclose(out[5, 5], 1.0, atol=1e-4)
        np.testing.assert_allclose(out[4, 5], 1.0, atol=1e-4)
        np.testing.assert_allclose(out[6, 5], 1.0, atol=1e-4)
        # Pixels outside the support window remain zero.
        np.testing.assert_allclose(out[0, 0], 0.0, atol=1e-4)

    def test_output_dtype_is_float32(self):
        img = np.random.RandomState(0).rand(8, 8).astype(np.float32) * 100.0
        for name in sf.FILTER_NAMES:
            with self.subTest(filter=name):
                out = sf.apply_filter(img, name=name, win_x=3, win_y=3, looks=4.0)
                self.assertEqual(out.dtype, np.float32)
                self.assertEqual(out.shape, img.shape)


class EnlEstimatorTests(unittest.TestCase):
    def test_estimate_enl_positive_for_speckle_like_input(self):
        rng = np.random.RandomState(1)
        intensity = rng.exponential(scale=10.0, size=(64, 64)).astype(np.float32)
        enl = sf.estimate_enl(intensity)
        self.assertGreater(enl, 0.0)


if __name__ == "__main__":
    unittest.main()
