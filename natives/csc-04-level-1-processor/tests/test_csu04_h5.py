import math
import os
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np

PROCESSOR_DIR = Path(__file__).resolve().parents[1]
if str(PROCESSOR_DIR) not in sys.path:
    sys.path.insert(0, str(PROCESSOR_DIR))

from raw import sar_rda_processorV4 as original
import csu_04_04_slc_formation as split_slc
import csu_04_05_multilook as ml
import csu_04_05_speckle_filter as sf

try:
    import rasterio
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False


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


@unittest.skipUnless(HAS_RASTERIO, "rasterio not installed")
class Csu0405SmokeTests(unittest.TestCase):
    """Chain: synthesize SLC → multilook → speckle filter.

    Confirms the multilook reader, XML metadata flow, and speckle filter
    dispatcher work together on a real on-disk GeoTIFF (the format that
    main.py emits as Level-1A SLC)."""

    def _write_synth_slc(self, slc_path: Path, real: np.ndarray, imag: np.ndarray) -> None:
        height, width = real.shape
        from rasterio.transform import from_origin
        transform = from_origin(0.0, 0.0, 1.0, 1.0)
        with rasterio.open(
            slc_path, "w",
            driver="GTiff",
            height=height, width=width,
            count=2, dtype="float32",
            transform=transform, crs=None,
        ) as dst:
            dst.write(real.astype(np.float32), 1)
            dst.write(imag.astype(np.float32), 2)

    def _write_synth_xml(self, xml_path: Path, na_total: int, nr_dec: int) -> None:
        import xml.etree.ElementTree as ET
        root = ET.Element("SARProcessingMetadata", version="3.0")
        img = ET.SubElement(root, "OutputImage")
        ET.SubElement(img, "NumberOfLines").text = str(na_total)
        ET.SubElement(img, "NumberOfSamples").text = str(nr_dec)
        ET.SubElement(img, "RangeSampleSpacing").text = "1.0"
        ET.SubElement(img, "AzimuthLineSpacing").text = "1e-3"
        ins = ET.SubElement(root, "Instrument")
        ET.SubElement(ins, "PRF").text = "1000.0"
        ET.SubElement(ins, "Wavelength").text = "0.03"
        acq = ET.SubElement(root, "Acquisition")
        ET.SubElement(acq, "Vr_eff").text = "7000.0"
        ET.SubElement(acq, "SlantRangeNear").text = "8.0e5"
        ET.SubElement(acq, "SlantRangeMid").text = "8.5e5"
        ET.SubElement(acq, "SlantRangeFar").text = "9.0e5"
        proc = ET.SubElement(root, "Processing")
        rd = ET.SubElement(proc, "RangeDecimation"); ET.SubElement(rd, "Factor").text = "1"
        dc = ET.SubElement(proc, "DopplerCentroid"); ET.SubElement(dc, "MeanEstimate").text = "0.0"
        blk = ET.SubElement(proc, "BlockProcessing")
        ET.SubElement(blk, "SyntheticApertureLines").text = "100"
        ET.SubElement(blk, "DopplerFMRateRef").text = "1.0e3"
        ET.ElementTree(root).write(xml_path, encoding="utf-8", xml_declaration=True)

    def test_slc_to_multilook_to_speckle(self):
        with TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            slc_path = tmpdir / "SLC_complex.tif"
            xml_path = tmpdir / "SLC_metadata.xml"
            mld_dir  = tmpdir / "mld"

            na_total, nr_dec = 32, 32
            real = np.random.RandomState(7).randn(na_total, nr_dec).astype(np.float32)
            imag = np.random.RandomState(13).randn(na_total, nr_dec).astype(np.float32)
            self._write_synth_slc(slc_path, real, imag)
            self._write_synth_xml(xml_path, na_total, nr_dec)

            # Stage 1: multi-look (RL=4, AL=4)
            result = ml.multilook(
                slc_path=str(slc_path),
                xml_path=str(xml_path),
                output_dir=str(mld_dir),
                range_looks=4,
                azimuth_looks=4,
                strip_out_lines=2,
            )
            self.assertTrue(Path(result["mld"]).exists(), "MLD GeoTIFF was not produced")
            self.assertTrue(Path(result["xml"]).exists(), "MLD XML was not produced")

            with rasterio.open(result["mld"]) as src:
                mld = src.read(1)
            self.assertEqual(mld.shape, (na_total // 4, nr_dec // 4))
            self.assertTrue(np.all(mld >= 0.0), "Intensity must be non-negative")

            # Stage 2: speckle filter (lee, win 3x3)
            filtered = sf.apply_filter(mld, name="lee", win_x=3, win_y=3, looks=4.0)
            self.assertEqual(filtered.shape, mld.shape)
            self.assertEqual(filtered.dtype, np.float32)
            self.assertTrue(np.all(np.isfinite(filtered)))


if __name__ == "__main__":
    unittest.main()
