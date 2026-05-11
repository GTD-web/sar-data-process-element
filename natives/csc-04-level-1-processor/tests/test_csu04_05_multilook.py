"""Unit tests for CSU-04.05 Multi-look Processor.

The `multilook()` function couples I/O (rasterio) with the math. Tests that
need rasterio synthesize a tiny SLC GeoTIFF + companion XML on the fly and
drive the full pipeline. Tests that don't need rasterio drive `load_slc_meta`
and exercise the constant-input math invariants.
"""

import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np

PROCESSOR_DIR = Path(__file__).resolve().parents[1]
if str(PROCESSOR_DIR) not in sys.path:
    sys.path.insert(0, str(PROCESSOR_DIR))

import csu_04_05_multilook as ml

try:
    import rasterio
    from rasterio.transform import from_origin
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False


def _build_xml(path: Path, na_total: int, nr_dec: int,
               dr_dec: float = 1.0, daz_slc: float = 1e-3,
               range_dec_factor: int = 1) -> None:
    root = ET.Element("SARProcessingMetadata", version="3.0")
    img = ET.SubElement(root, "OutputImage")
    ET.SubElement(img, "NumberOfLines").text = str(na_total)
    ET.SubElement(img, "NumberOfSamples").text = str(nr_dec)
    ET.SubElement(img, "RangeSampleSpacing").text = str(dr_dec)
    ET.SubElement(img, "AzimuthLineSpacing").text = str(daz_slc)

    ins = ET.SubElement(root, "Instrument")
    ET.SubElement(ins, "PRF").text = str(1.0 / daz_slc)
    ET.SubElement(ins, "CarrierFrequency").text = "9.6e9"
    ET.SubElement(ins, "Wavelength").text = "0.03"

    acq = ET.SubElement(root, "Acquisition")
    ET.SubElement(acq, "Vr_eff").text = "7000.0"
    ET.SubElement(acq, "SlantRangeNear").text = "8.0e5"
    ET.SubElement(acq, "SlantRangeMid").text = "8.5e5"
    ET.SubElement(acq, "SlantRangeFar").text = "9.0e5"

    proc = ET.SubElement(root, "Processing")
    rd = ET.SubElement(proc, "RangeDecimation")
    ET.SubElement(rd, "Factor").text = str(range_dec_factor)
    dc = ET.SubElement(proc, "DopplerCentroid")
    ET.SubElement(dc, "MeanEstimate").text = "0.0"
    blk = ET.SubElement(proc, "BlockProcessing")
    ET.SubElement(blk, "SyntheticApertureLines").text = "100"
    ET.SubElement(blk, "DopplerFMRateRef").text = "1.0e3"

    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)


def _write_synth_slc(path: Path, real: np.ndarray, imag: np.ndarray) -> None:
    """Write a 2-band float32 GeoTIFF the multilook pipeline can consume."""
    height, width = real.shape
    transform = from_origin(0.0, 0.0, 1.0, 1.0)
    with rasterio.open(
        path, "w",
        driver="GTiff",
        height=height, width=width,
        count=2, dtype="float32",
        transform=transform,
        crs=None,
    ) as dst:
        dst.write(real.astype(np.float32), 1)
        dst.write(imag.astype(np.float32), 2)


class LoadMetadataTests(unittest.TestCase):
    def test_load_slc_meta_parses_dimensions_and_decimation(self):
        with TemporaryDirectory() as tmp:
            xml_path = Path(tmp) / "meta.xml"
            _build_xml(xml_path, na_total=200, nr_dec=400, dr_dec=2.5,
                       daz_slc=1e-3, range_dec_factor=4)
            meta = ml.load_slc_meta(str(xml_path))

            self.assertEqual(meta.na_total, 200)
            self.assertEqual(meta.nr_dec, 400)
            self.assertAlmostEqual(meta.dr_dec, 2.5)
            self.assertEqual(meta.range_dec_factor, 4)
            self.assertAlmostEqual(meta.dr_full, 2.5 / 4)
            self.assertAlmostEqual(meta.daz_slc, 1e-3)


@unittest.skipUnless(HAS_RASTERIO, "rasterio not installed")
class MultilookMathTests(unittest.TestCase):
    """Drives the full multilook() pipeline with a synthesized SLC."""

    def _run_pipeline(self, real: np.ndarray, imag: np.ndarray,
                      RL: int, AL: int, *, amplitude: bool = False) -> np.ndarray:
        with TemporaryDirectory() as tmp:
            slc_path = Path(tmp) / "SLC.tif"
            xml_path = Path(tmp) / "SLC.xml"
            out_dir  = Path(tmp) / "out"
            _build_xml(xml_path, na_total=real.shape[0], nr_dec=real.shape[1])
            _write_synth_slc(slc_path, real, imag)
            result = ml.multilook(
                slc_path=str(slc_path),
                xml_path=str(xml_path),
                output_dir=str(out_dir),
                range_looks=RL,
                azimuth_looks=AL,
                strip_out_lines=4,
                save_amplitude=amplitude,
            )
            with rasterio.open(result["mld"]) as src:
                return src.read(1)

    def test_constant_input_constant_output(self):
        real = np.full((8, 8), 3.0, dtype=np.float32)
        imag = np.full((8, 8), 4.0, dtype=np.float32)   # |SLC|² = 9 + 16 = 25
        out  = self._run_pipeline(real, imag, RL=2, AL=2)
        self.assertEqual(out.shape, (4, 4))
        np.testing.assert_allclose(out, 25.0, atol=1e-5)

    def test_output_shape_uses_floor_division(self):
        real = np.zeros((10, 9), dtype=np.float32)
        imag = np.zeros((10, 9), dtype=np.float32)
        out  = self._run_pipeline(real, imag, RL=4, AL=3)
        # na_ml = 10 // 3 = 3   nr_ml = 9 // 4 = 2
        self.assertEqual(out.shape, (3, 2))

    def test_amplitude_is_sqrt_of_intensity(self):
        real = np.full((6, 6), 3.0, dtype=np.float32)
        imag = np.full((6, 6), 4.0, dtype=np.float32)
        intensity = self._run_pipeline(real, imag, RL=2, AL=2, amplitude=False)
        amplitude = self._run_pipeline(real, imag, RL=2, AL=2, amplitude=True)
        np.testing.assert_allclose(amplitude, np.sqrt(intensity), atol=1e-5)


if __name__ == "__main__":
    unittest.main()
