import math
import os
import sys
import unittest
from pathlib import Path

import numpy as np

PROCESSOR_DIR = Path(__file__).resolve().parents[1]
if str(PROCESSOR_DIR) not in sys.path:
    sys.path.insert(0, str(PROCESSOR_DIR))

from raw import sar_rda_processorV4 as original
import csu_04_04_slc_formation as split_slc


def _get_h5_path() -> str | None:
    candidates = [
        os.environ.get("CSC04_H5_PATH"),
        r"C:\Users\USER\Downloads\16_resized.h5",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    return None


@unittest.skipUnless(_get_h5_path(), "CSC04 HDF5 sample not available")
class Csu04H5IntegrationTests(unittest.TestCase):
    H5_PATH = _get_h5_path()
    SETTINGS = dict(decimate_range=1, valid_lines=96, na_block_override=192, na_overlap_override=96)

    def test_load_metadata_matches_original(self):
        original_meta = original.load_metadata(self.H5_PATH, **self.SETTINGS)
        split_meta = split_slc.load_metadata(self.H5_PATH, **self.SETTINGS)

        scalar_fields = [
            "prf",
            "fc",
            "fs",
            "bw_start",
            "bw_stop",
            "pulse_width",
            "swst",
            "look_angle",
            "platform_height",
            "flight_speed",
            "beamwidth",
            "squint_angle",
            "na_total",
            "nr",
            "nr_rep",
            "wavelength",
            "dr",
            "r_near",
            "Vr_eff",
            "decimate_range",
            "nr_dec",
            "fs_dec",
            "dr_dec",
            "r_far_dec",
            "r_ref_dec",
            "lpf_n_taps",
            "na_syn",
            "na_overlap",
            "na_valid",
            "na_block",
            "ka_ref",
            "h5_path",
            "reference_utc",
            "scene_start_utc",
            "scene_stop_utc",
        ]
        for name in scalar_fields:
            a = getattr(original_meta, name)
            b = getattr(split_meta, name)
            if isinstance(a, float):
                self.assertTrue(math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9), name)
            else:
                self.assertEqual(a, b, name)

        array_fields = [
            "v_mag",
            "lat",
            "lon",
            "alt",
            "replica_dec",
            "gps_lat_raw",
            "gps_lon_raw",
            "gps_alt_raw",
            "gps_vx_raw",
            "gps_vy_raw",
            "gps_vz_raw",
        ]
        for name in array_fields:
            np.testing.assert_array_equal(getattr(original_meta, name), getattr(split_meta, name), err_msg=name)

    def test_first_block_processing_matches_original(self):
        meta = original.load_metadata(self.H5_PATH, **self.SETTINGS)
        schedule_original = original._build_block_schedule(meta.na_total, meta.na_block, meta.na_valid)
        schedule_split = split_slc._build_block_schedule(meta.na_total, meta.na_block, meta.na_valid)
        self.assertEqual(schedule_original, schedule_split)

        base = dict(
            h5_path=meta.h5_path,
            nr=meta.nr,
            nr_dec=meta.nr_dec,
            prf=meta.prf,
            r_near=meta.r_near,
            dr_dec=meta.dr_dec,
            fs_dec=meta.fs_dec,
            wavelength=meta.wavelength,
            Vr_eff=meta.Vr_eff,
            platform_height=meta.platform_height,
            v_mag=meta.v_mag,
            decimate_range=meta.decimate_range,
            replica_dec=meta.replica_dec,
            smooth_len=101,
            rng_chunk=64,
            az_batch=16,
        )
        block = schedule_original[0]

        result_original = original._process_block({**base, **block})
        result_split = split_slc._process_block({**base, **block})

        self.assertEqual(result_original[0], result_split[0])
        self.assertEqual(result_original[1], result_split[1])
        self.assertTrue(math.isclose(result_original[3], result_split[3], rel_tol=1e-6, abs_tol=1e-6))
        np.testing.assert_array_equal(result_original[2], result_split[2])


if __name__ == "__main__":
    unittest.main()
