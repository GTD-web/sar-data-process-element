#!/usr/bin/env python3
"""
csu_04_05_multilook.py
======================
CSU-04.05 Multi-look Processor for SAR SLC data produced by the CSC-04 RDA
processor (V4/V7).

Loads the 2-band float32 GeoTIFF (band-1 = real, band-2 = imag) and the
companion XML metadata file written by the RDA processor, applies incoherent
multi-look averaging in range and azimuth, then writes:

  * <output_dir>/MLD_<RL>x<AL>.tif   — single-band float32 intensity GeoTIFF
  * <output_dir>/MLD_<RL>x<AL>.xml   — updated metadata XML

Multi-look definition (matches SNAP / ESA convention)
------------------------------------------------------
  Intensity of the SLC:   I(r, a) = |SLC(r, a)|² = real² + imag²

  Multi-looked intensity (incoherent average) equation:
      MLD(R, A) = (1 / RL·AL) · Σ_{k=0}^{RL-1} Σ_{l=0}^{AL-1}  I(R·RL+k, A·AL+l)

  Output dimensions:
      nr_ml  = floor(nr_dec / RL)
      na_ml  = floor(na_total / AL)

  Updated pixel spacings:
      dr_ml  = dr_dec  x RL      [m]    (range sample spacing)
      daz_ml = daz_slc x AL     [s]    (azimuth line spacing in time)
      daz_m  = Vr_eff x daz_ml  [m]   (approximate ground azimuth spacing)

Range-decimation awareness
--------------------------
  If the SLC was produced with range decimation factor D > 1, the SLC
  range spacing is already dr_dec = dr_full x D.  The tool reads D from
  the XML so the logged "effective range looks" = RL x D is reported
  in the output XML.

  The range spacing used in all output calculations is always dr_dec as
  read from the XML (the SLC spacing), so the user just specifies how
  many SLC pixels to average — regardless of whether decimation was applied.

Memory strategy
---------------
  The SLC is read and processed in strips of ``strip_az`` azimuth lines
  (default = AL x 64 output lines) to bound peak RAM independently of
  scene size.  Each strip is read twice: once for real, once for imag
  (rasterio band-by-band, avoiding full-image allocation).

  Peak RAM ≈ 2 x strip_az x nr_dec x 4 bytes
           = 2 x (AL x 64) x nr_dec x 4 bytes
  For AL=10, nr_dec=79504: ≈ 390 MB

Output TIFF
-----------
  Single-band float32 GeoTIFF (intensity, linear scale — not dB).
  Compressed with ZSTD level 9 + predictor=2 when rasterio is available,
  otherwise written as a minimal TIFF or ENVI binary fallback.

Usage
-----
  python csu_04_05_multilook.py --slc SLC_complex.tif --xml SLC_metadata.xml \\
                                --range-looks 4 --azimuth-looks 10 \\
                                --output ./ml_output

  python csu_04_05_multilook.py -s SLC_complex.tif -x SLC_metadata.xml \\
                                -r 4 -a 10 -o ./ml_output --strip-lines 128

  python csu_04_05_multilook.py ... --dry-run     # show parameters, don't process
  python csu_04_05_multilook.py ... --amplitude   # save sqrt(intensity) instead
"""

import argparse
import logging
import math
import os
import struct
import time
from datetime import datetime, UTC
from pathlib import Path
from typing import Optional, Tuple
import xml.etree.ElementTree as ET
from xml.dom import minidom
from copy import deepcopy

import numpy as np

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

log = logging.getLogger("SAR-ML")

__all__ = ["SLCMeta", "load_slc_meta", "multilook"]


# ════════════════════════════════════════════════════════════════════════════
# 1.  XML metadata reader
# ════════════════════════════════════════════════════════════════════════════

class SLCMeta:
    """Parsed subset of the RDA-processor XML relevant to multi-look."""
    # Image dimensions
    na_total: int          # azimuth lines in SLC
    nr_dec: int            # range samples in SLC

    # Pixel spacings (SLC)
    dr_dec: float          # range sample spacing [m]
    daz_slc: float         # azimuth line spacing [s]  = 1/PRF

    # Sensor
    prf: float             # pulse repetition frequency [Hz]
    fc: float              # carrier frequency [Hz]
    wavelength: float      # [m]
    Vr_eff: float          # effective radar velocity [m/s]

    # Range decimation applied to the SLC
    range_dec_factor: int  # D (1 = no decimation)
    dr_full: float         # original (undecimated) range spacing [m]

    # Slant range geometry
    r_near: float          # near slant range [m]
    r_mid: float           # mid slant range  [m]
    r_far: float           # far slant range  [m]

    # Doppler centroid
    fdc_mean: float        # mean Doppler centroid [Hz]

    # Block processing
    ka_ref: float          # Doppler FM rate at mid-swath [Hz/s]
    na_syn: int            # synthetic aperture lines


def _txt(el, tag, default=''):
    """Extract text from first matching child element."""
    child = el.find(tag)
    return child.text.strip() if child is not None and child.text else default


def _float(el, tag, default=0.0) -> float:
    try:
        return float(_txt(el, tag, str(default)))
    except (ValueError, TypeError):
        return default


def _int(el, tag, default=0) -> int:
    try:
        return int(_txt(el, tag, str(default)))
    except (ValueError, TypeError):
        return default


def load_slc_meta(xml_path: str) -> SLCMeta:
    """
    Parse the RDA-processor XML and return an SLCMeta object.

    Reads the following XML paths (all produced by sar_rda_processor.py v3.0):
      OutputImage/NumberOfLines
      OutputImage/NumberOfSamples
      OutputImage/RangeSampleSpacing
      OutputImage/AzimuthLineSpacing
      Instrument/PRF
      Instrument/CarrierFrequency
      Instrument/Wavelength
      Acquisition/Vr_eff
      Acquisition/SlantRangeNear / SlantRangeFar / SlantRangeMid
      Processing/RangeDecimation/Factor
      Processing/DopplerCentroid/MeanEstimate
      Processing/BlockProcessing/SyntheticApertureLines
      Processing/BlockProcessing/DopplerFMRateRef
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()

    m = SLCMeta()

    img = root.find('OutputImage')
    if img is None:
        raise ValueError("XML missing <OutputImage> element — not an RDA-processor XML?")

    m.na_total = _int(img, 'NumberOfLines')
    m.nr_dec   = _int(img, 'NumberOfSamples')
    m.dr_dec   = _float(img, 'RangeSampleSpacing')
    m.daz_slc  = _float(img, 'AzimuthLineSpacing')   # [s]

    ins = root.find('Instrument')
    m.prf        = _float(ins, 'PRF') if ins is not None else 1.0 / m.daz_slc
    m.fc         = _float(ins, 'CarrierFrequency') if ins is not None else 0.0
    m.wavelength = _float(ins, 'Wavelength') if ins is not None else 0.0

    acq = root.find('Acquisition')
    if acq is not None:
        m.Vr_eff = _float(acq, 'Vr_eff')
        m.r_near  = _float(acq, 'SlantRangeNear')
        m.r_mid   = _float(acq, 'SlantRangeMid')
        m.r_far   = _float(acq, 'SlantRangeFar')
    else:
        m.Vr_eff = 0.0; m.r_near = 0.0; m.r_mid = 0.0; m.r_far = 0.0

    proc = root.find('Processing')
    if proc is not None:
        rd = proc.find('RangeDecimation')
        m.range_dec_factor = _int(rd, 'Factor', default=1) if rd is not None else 1

        dc = proc.find('DopplerCentroid')
        m.fdc_mean = _float(dc, 'MeanEstimate') if dc is not None else 0.0

        blk = proc.find('BlockProcessing')
        if blk is not None:
            m.na_syn  = _int(blk,   'SyntheticApertureLines')
            m.ka_ref  = _float(blk, 'DopplerFMRateRef')
        else:
            m.na_syn = 0; m.ka_ref = 0.0
    else:
        m.range_dec_factor = 1
        m.fdc_mean = 0.0; m.na_syn = 0; m.ka_ref = 0.0

    # Derive original (pre-decimation) range spacing
    m.dr_full = m.dr_dec / m.range_dec_factor

    log.info("SLC metadata loaded:")
    log.info("  Dimensions  : %d az × %d rg", m.na_total, m.nr_dec)
    log.info("  dr_dec      : %.4f m  (D=%d,  dr_full=%.4f m)",
             m.dr_dec, m.range_dec_factor, m.dr_full)
    log.info("  daz_slc     : %.8f s  (PRF=%.4f Hz)", m.daz_slc, m.prf)
    log.info("  Vr_eff      : %.3f m/s", m.Vr_eff)
    log.info("  R_near/mid/far: %.0f / %.0f / %.0f m",
             m.r_near, m.r_mid, m.r_far)

    return m


# ════════════════════════════════════════════════════════════════════════════
# 2.  Multi-look processor
# ════════════════════════════════════════════════════════════════════════════

def multilook(slc_path: str,
              xml_path: str,
              output_dir: str,
              range_looks: int,
              azimuth_looks: int,
              strip_out_lines: int = 64,
              save_amplitude: bool = False,
              vmin_db: float = -30.0,
              vmax_db: float = 3.0) -> dict:
    """
    Apply incoherent multi-look averaging to an SLC GeoTIFF.

    Parameters
    ----------
    slc_path        : path to 2-band float32 SLC GeoTIFF (band1=re, band2=im)
    xml_path        : path to companion RDA-processor XML metadata
    output_dir      : directory for output files (created if absent)
    range_looks     : number of range pixels to average (RL ≥ 1)
    azimuth_looks   : number of azimuth lines to average (AL ≥ 1)
    strip_out_lines : output lines per processing strip (memory control)
    save_amplitude  : if True, save sqrt(intensity); default is intensity
    vmin_db / vmax_db : dB window for PNG quicklook

    Returns
    -------
    dict with keys 'mld', 'xml', optionally 'quicklook'
    """
    RL = range_looks
    AL = azimuth_looks

    if RL < 1 or AL < 1:
        raise ValueError(f"range_looks and azimuth_looks must be >= 1 "
                         f"(got RL={RL}, AL={AL})")

    if not HAS_RASTERIO:
        raise ImportError(
            "rasterio is required for strip-based SLC reading:\n"
            "  pip install rasterio")

    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    meta = load_slc_meta(xml_path)

    # ── Output dimensions ─────────────────────────────────────────────────
    na_ml = meta.na_total // AL      # azimuth output lines
    nr_ml = meta.nr_dec   // RL      # range  output samples

    if na_ml < 1 or nr_ml < 1:
        raise ValueError(
            f"Not enough SLC pixels for {RL}R × {AL}A looks.\n"
            f"  SLC size: {meta.na_total} az × {meta.nr_dec} rg\n"
            f"  Output  : {na_ml} az × {nr_ml} rg")

    # ── Updated pixel spacings ────────────────────────────────────────────
    dr_ml      = meta.dr_dec * RL                    # [m] range spacing
    daz_ml_s   = meta.daz_slc * AL                  # [s] azimuth spacing
    daz_ml_m   = meta.Vr_eff * daz_ml_s             # [m] azimuth spacing (approx)

    # Effective looks accounting for prior range decimation
    eff_range_looks = RL * meta.range_dec_factor     # total range looks from raw
    enl_theoretical = RL * AL                        # equivalent number of looks

    suffix   = f"{RL}R{AL}A"
    tag      = "amplitude" if save_amplitude else "intensity"
    out_tif  = out_dir / f"MLD_{suffix}.tif"
    out_xml  = out_dir / f"MLD_{suffix}.xml"
    out_ql   = out_dir / f"MLD_{suffix}_ql.png"

    log.info("Multi-look: RL=%d  AL=%d  → %d az × %d rg output",
             RL, AL, na_ml, nr_ml)
    log.info("  dr_ml = %.4f m   daz_ml = %.6f s  (%.4f m)",
             dr_ml, daz_ml_s, daz_ml_m)
    log.info("  Effective range looks (incl. decimation D=%d): %d",
             meta.range_dec_factor, eff_range_looks)
    log.info("  ENL (theoretical) = %d", enl_theoretical)

    t0 = time.time()

    # ── Open SLC for strip reading ────────────────────────────────────────
    with rasterio.open(slc_path) as src:
        slc_rows = src.height
        slc_cols = src.width

        if slc_rows != meta.na_total or slc_cols != meta.nr_dec:
            log.warning(
                "TIFF dimensions (%d × %d) differ from XML metadata (%d × %d). "
                "Using actual TIFF dimensions.",
                slc_rows, slc_cols, meta.na_total, meta.nr_dec)
            meta.na_total = slc_rows
            meta.nr_dec   = slc_cols
            na_ml = meta.na_total // AL
            nr_ml = meta.nr_dec   // RL

        # Number of SLC pixels used (tail discarded to keep integer blocks)
        na_used = na_ml * AL
        nr_used = nr_ml * RL

        log.info("  SLC pixels used: %d az × %d rg  "
                 "(tail discarded: %d az, %d rg)",
                 na_used, nr_used,
                 meta.na_total - na_used, meta.nr_dec - nr_used)

        # ── Open output TIFF ──────────────────────────────────────────────
        big = na_ml * nr_ml * 4 > 4e9
        kw  = dict(
            driver    = 'GTiff',
            height    = na_ml,
            width     = nr_ml,
            count     = 1,
            dtype     = 'float32',
            compress  = 'zstd',
            zstd_level = 9,
            predictor  = 2,
            bigtiff    = 'YES' if big else 'NO',
        )
        with rasterio.open(str(out_tif), 'w', **kw) as dst:

            strip_in  = strip_out_lines * AL    # input SLC lines per strip
            written   = 0                       # output lines written so far

            for r0_in in range(0, na_used, strip_in):
                r1_in = min(r0_in + strip_in, na_used)
                n_in  = r1_in - r0_in
                n_out = n_in // AL              # complete azimuth look blocks

                if n_out == 0:
                    continue

                n_in_used = n_out * AL          # SLC lines actually consumed

                win = rasterio.windows.Window(0, r0_in, nr_used, n_in_used)

                # Read real and imaginary bands
                re = src.read(1, window=win).astype(np.float32)  # (n_in_used, nr_used)
                im = src.read(2, window=win).astype(np.float32)

                # ── Intensity ────────────────────────────────────────────
                intensity = re * re + im * im   # (n_in_used, nr_used)
                del re, im

                # ── Range multi-look: reshape and mean over RL columns ──
                # (n_in_used, nr_used) → (n_in_used, nr_ml, RL) → (n_in_used, nr_ml)
                intensity = (intensity
                             .reshape(n_in_used, nr_ml, RL)
                             .mean(axis=2))                    # (n_in_used, nr_ml)

                # ── Azimuth multi-look: reshape and mean over AL rows ───
                # (n_in_used, nr_ml) → (n_out, AL, nr_ml) → (n_out, nr_ml)
                ml_strip = (intensity
                            .reshape(n_out, AL, nr_ml)
                            .mean(axis=1))                     # (n_out, nr_ml)
                del intensity

                if save_amplitude:
                    ml_strip = np.sqrt(np.maximum(ml_strip, 0.0))

                # ── Write strip ──────────────────────────────────────────
                out_win = rasterio.windows.Window(0, written, nr_ml, n_out)
                dst.write(ml_strip.astype(np.float32), 1, window=out_win)
                written += n_out

                pct = 100.0 * r1_in / na_used
                log.info("  Processed SLC lines %d–%d  →  output rows %d–%d  (%.1f %%)",
                         r0_in, r1_in - 1, written - n_out, written - 1, pct)
                del ml_strip

    elapsed = time.time() - t0
    log.info("Multi-look done in %.1f s  →  %s", elapsed, out_tif)

    # ── Quicklook ─────────────────────────────────────────────────────────
    ql_written = _write_quicklook(str(out_tif), str(out_ql),
                                  is_amplitude=save_amplitude,
                                  vmin_db=vmin_db, vmax_db=vmax_db)

    # ── Updated XML ───────────────────────────────────────────────────────
    _write_output_xml(
        src_xml_path  = xml_path,
        out_xml_path  = str(out_xml),
        meta          = meta,
        RL            = RL,
        AL            = AL,
        na_ml         = na_ml,
        nr_ml         = nr_ml,
        na_used       = na_used,
        nr_used       = nr_used,
        dr_ml         = dr_ml,
        daz_ml_s      = daz_ml_s,
        daz_ml_m      = daz_ml_m,
        eff_range_looks = eff_range_looks,
        enl_theoretical = enl_theoretical,
        save_amplitude  = save_amplitude,
        elapsed         = elapsed,
    )

    result = {'mld': str(out_tif), 'xml': str(out_xml)}
    if ql_written:
        result['quicklook'] = str(out_ql)
    return result


# ════════════════════════════════════════════════════════════════════════════
# 3.  Quicklook writer
# ════════════════════════════════════════════════════════════════════════════

def _write_quicklook(tif_path: str, ql_path: str,
                     is_amplitude: bool = False,
                     vmin_db: float = -30.0,
                     vmax_db: float = 3.0,
                     strip_rows: int = 512,
                     max_px: int = 4096) -> bool:
    """
    Two-pass strip reader quicklook.  Pass 1 = global max, Pass 2 = dB image.
    Works for both intensity and amplitude outputs.
    """
    if not HAS_MPL:
        log.warning("matplotlib not available — skipping quicklook")
        return False
    if not HAS_RASTERIO:
        log.warning("rasterio not available — skipping quicklook")
        return False

    with rasterio.open(tif_path) as src:
        n_rows, n_cols = src.height, src.width
        ds = max(1, max(n_rows, n_cols) // max_px)

        # Pass 1: global max
        gmax = 0.0
        for r0 in range(0, n_rows, strip_rows):
            r1  = min(r0 + strip_rows, n_rows)
            win = rasterio.windows.Window(0, r0, n_cols, r1 - r0)
            data = src.read(1, window=win).astype(np.float32)
            gmax = max(gmax, float(data.max()))

        if gmax <= 0.0:
            log.warning("Output image is all-zero — skipping quicklook")
            return False

        # Pass 2: dB image
        segs = []
        with np.errstate(divide='ignore', invalid='ignore'):
            for r0 in range(0, n_rows, strip_rows):
                r1   = min(r0 + strip_rows, n_rows)
                win  = rasterio.windows.Window(0, r0, n_cols, r1 - r0)
                data = src.read(1, window=win).astype(np.float32)[:, ::ds]
                if is_amplitude:
                    db = 20.0 * np.log10(np.maximum(data / gmax, 1e-30))
                else:
                    # intensity → 10 log10
                    db = 10.0 * np.log10(np.maximum(data / gmax, 1e-30))
                segs.append(np.clip(db, vmin_db, vmax_db)[::ds])

    db_img = np.vstack(segs)
    scale  = "20·log10" if is_amplitude else "10·log10"
    plt.imsave(ql_path, db_img, cmap='gray', vmin=vmin_db, vmax=vmax_db)
    log.info("Quicklook → %s  (%dx%d px,  %s,  vmin=%.0f  vmax=%.0f dB)",
             ql_path, db_img.shape[0], db_img.shape[1],
             scale, vmin_db, vmax_db)
    return True


# ════════════════════════════════════════════════════════════════════════════
# 4.  XML output writer
# ════════════════════════════════════════════════════════════════════════════

def _write_output_xml(src_xml_path: str, out_xml_path: str,
                      meta: SLCMeta,
                      RL: int, AL: int,
                      na_ml: int, nr_ml: int,
                      na_used: int, nr_used: int,
                      dr_ml: float, daz_ml_s: float, daz_ml_m: float,
                      eff_range_looks: int, enl_theoretical: int,
                      save_amplitude: bool, elapsed: float) -> None:
    """
    Copy the SLC XML tree, update OutputImage fields, and append a
    <MultiLook> block describing all multi-look parameters.
    """
    # ── Load and deep-copy source XML ─────────────────────────────────────
    tree = ET.parse(src_xml_path)
    root = deepcopy(tree.getroot())

    def _set(parent, tag, text, **attrs):
        """Update existing child or create new one."""
        el = parent.find(tag)
        if el is None:
            el = ET.SubElement(parent, tag, attrib=attrs)
        else:
            el.attrib.update(attrs)
        el.text = str(text)
        return el

    def _sub(parent, tag, text=None, **attrs):
        el = ET.SubElement(parent, tag, attrib=attrs)
        if text is not None:
            el.text = str(text)
        return el

    # ── Update <OutputImage> ──────────────────────────────────────────────
    img = root.find('OutputImage')
    if img is None:
        img = ET.SubElement(root, 'OutputImage')

    _set(img, 'NumberOfLines',         str(na_ml))
    _set(img, 'NumberOfSamples',       str(nr_ml))
    _set(img, 'RangeSampleSpacing',    f'{dr_ml:.6f}',    unit='m')
    _set(img, 'AzimuthLineSpacing',    f'{daz_ml_s:.10f}', unit='s')
    _set(img, 'AzimuthSampleSpacing',  f'{daz_ml_m:.4f}',  unit='m')
    _set(img, 'DataType',
         ('Amplitude (sqrt of incoherent multi-looked intensity): '
          'float32, 1-band GeoTIFF'
          if save_amplitude else
          'Intensity (incoherent multi-looked |SLC|²): '
          'float32, 1-band GeoTIFF'))
    _set(img, 'GeoCoding', 'NOT APPLIED (slant-range geometry)')

    # ── Update root attributes ─────────────────────────────────────────────
    root.set('version', '3.0-MLD')
    root.set('created', datetime.now(UTC).isoformat().replace('+00:00', 'Z'))

    # ── Update <ProductInfo> ──────────────────────────────────────────────
    pi = root.find('ProductInfo')
    if pi is None:
        pi = ET.SubElement(root, 'ProductInfo')
    _set(pi, 'ProductType',      'MLD')
    _set(pi, 'ProcessingLevel',  'L2')
    _set(pi, 'Processor',        'csu_04_05_multilook.py v1.0')
    _set(pi, 'ProcessingDate',
         datetime.now(UTC).isoformat().replace('+00:00', 'Z'))
    _set(pi, 'InputSLC', src_xml_path)

    # ── Append <MultiLook> block ──────────────────────────────────────────
    # Remove old MultiLook block if re-processing
    old_ml = root.find('MultiLook')
    if old_ml is not None:
        root.remove(old_ml)

    ml = ET.SubElement(root, 'MultiLook')
    ml.set('processor',  'csu_04_05_multilook.py v1.0')
    ml.set('applied',    datetime.now(UTC).isoformat().replace('+00:00', 'Z'))

    _sub(ml, 'Method',
         'Incoherent averaging of SLC intensity |re²+im²|: '
         'reshape and mean over (AL, RL) blocks.  '
         'Matches SNAP/ESA multi-look convention.')

    _sub(ml, 'RangeLooks',   str(RL),
         description='SLC range pixels averaged per output pixel')
    _sub(ml, 'AzimuthLooks', str(AL),
         description='SLC azimuth lines averaged per output line')

    _sub(ml, 'RangeDecimationFactor', str(meta.range_dec_factor),
         description='Range decimation D already applied to the SLC')
    _sub(ml, 'EffectiveRangeLooks', str(eff_range_looks),
         description='Total range looks from raw (= RL x D)',
         unit='looks')
    _sub(ml, 'ENL_Theoretical', str(enl_theoretical),
         description='Equivalent Number of Looks (RL x AL, no correlation)')

    _sub(ml, 'InputSLCSize',
         f'{meta.na_total} az × {meta.nr_dec} rg',
         unit='lines x samples')
    _sub(ml, 'InputPixelsUsed',
         f'{na_used} az × {nr_used} rg',
         note='tail pixels discarded to maintain integer look blocks')
    _sub(ml, 'OutputSize',
         f'{na_ml} az × {nr_ml} rg',
         unit='lines x samples')

    sp = _sub(ml, 'OutputPixelSpacing')
    _sub(sp, 'RangeSampleSpacing',   f'{dr_ml:.6f}',   unit='m',
         slc_spacing=f'{meta.dr_dec:.6f}',
         note=f'SLC spacing × RL ({RL})')
    _sub(sp, 'AzimuthLineSpacing_s', f'{daz_ml_s:.10f}', unit='s',
         slc_spacing=f'{meta.daz_slc:.10f}',
         note=f'SLC spacing × AL ({AL})')
    _sub(sp, 'AzimuthLineSpacing_m', f'{daz_ml_m:.4f}',  unit='m',
         note='Approximate ground spacing = Vr_eff × daz_ml_s')

    _sub(ml, 'OutputDataType',
         'Amplitude (sqrt intensity)' if save_amplitude else 'Intensity (|SLC|²)')
    _sub(ml, 'ProcessingTime', f'{elapsed:.2f}', unit='s')

    # ── Serialise pretty-printed XML ──────────────────────────────────────
    raw   = ET.tostring(root, encoding='utf-8')
    dom   = minidom.parseString(raw)
    with open(out_xml_path, 'wb') as fh:
        fh.write(dom.toprettyxml(indent='  ', encoding='utf-8'))
    log.info("Updated XML → %s", out_xml_path)


# ════════════════════════════════════════════════════════════════════════════
# 5.  CLI
# ════════════════════════════════════════════════════════════════════════════

def _print_plan(meta: SLCMeta, RL: int, AL: int,
                strip_out: int, save_amp: bool) -> None:
    """Pretty-print the processing plan before executing."""
    na_ml = meta.na_total // AL
    nr_ml = meta.nr_dec   // RL
    dr_ml = meta.dr_dec * RL
    daz_ml_s = meta.daz_slc * AL
    daz_ml_m = meta.Vr_eff * daz_ml_s
    enl = RL * AL
    eff_rl = RL * meta.range_dec_factor

    strip_in_lines = strip_out * AL
    peak_mb = strip_in_lines * meta.nr_dec * 4 * 2 / 1e6   # re + im

    print("\n" + "=" * 68)
    print("  SAR Multi-Look Processor — Processing Plan")
    print("=" * 68)
    print(f"  Input SLC       : {meta.na_total} az × {meta.nr_dec} rg")
    print(f"  Range spacing   : {meta.dr_dec:.4f} m  "
          f"(D={meta.range_dec_factor}, dr_full={meta.dr_full:.4f} m)")
    print(f"  Azimuth spacing : {meta.daz_slc:.8f} s  (PRF={meta.prf:.4f} Hz)")
    print(f"  Vr_eff          : {meta.Vr_eff:.3f} m/s")
    print()
    print(f"  Range looks     : {RL}")
    print(f"  Azimuth looks   : {AL}")
    print(f"  ENL (theoretical): {enl}  (= RL × AL)")
    print(f"  Eff. range looks : {eff_rl}  (= RL × D)")
    print()
    print(f"  Output size     : {na_ml} az × {nr_ml} rg")
    print(f"  Output dr       : {dr_ml:.4f} m  (= {meta.dr_dec:.4f} × {RL})")
    print(f"  Output daz      : {daz_ml_s:.8f} s  ≈ {daz_ml_m:.4f} m  "
          f"(= {meta.daz_slc:.8f} × {AL})")
    print(f"  Discarded tail  : {meta.na_total - na_ml*AL} az,  "
          f"{meta.nr_dec - nr_ml*RL} rg  (integer-block trim)")
    print()
    print(f"  Output type     : {'amplitude sqrt(I)' if save_amp else 'intensity |SLC|²'}")
    print(f"  Strip (in/out)  : {strip_in_lines} / {strip_out} lines")
    print(f"  Peak RAM/strip  : ~{peak_mb:.0f} MB  (2 × re + im bands)")
    print("=" * 68 + "\n")


def main() -> int:
    logging.basicConfig(level=logging.INFO,
                        format='%(asctime)s  %(levelname)-5s  %(message)s',
                        datefmt='%H:%M:%S')

    ap = argparse.ArgumentParser(
        description='SAR Multi-Look Processor v1.0',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter)

    ap.add_argument('--slc', '-s', required=True,
                    help='Input 2-band float32 SLC GeoTIFF '
                         '(band-1 = real, band-2 = imag)')
    ap.add_argument('--xml', '-x', required=True,
                    help='Companion RDA-processor XML metadata file')
    ap.add_argument('--output', '-o', required=True,
                    help='Output directory (created if absent)')

    ap.add_argument('--range-looks', '-r', type=int, required=True,
                    metavar='RL',
                    help='Number of range SLC pixels to average (≥ 1). '
                         'Effective look count includes any prior range '
                         'decimation: total_range_looks = RL × D.')
    ap.add_argument('--azimuth-looks', '-a', type=int, required=True,
                    metavar='AL',
                    help='Number of azimuth SLC lines to average (≥ 1).')

    ap.add_argument('--strip-lines', type=int, default=64, metavar='N',
                    help='Output lines per processing strip (memory control). '
                         'Input lines read per strip = N × AL. '
                         'Peak RAM ≈ 2 × (N × AL) × nr_dec × 4 bytes.')
    ap.add_argument('--amplitude', action='store_true',
                    help='Save square-root of intensity (amplitude) instead '
                         'of intensity. Default: save intensity.')
    ap.add_argument('--vmin-db', type=float, default=-30.0,
                    help='Quicklook dB floor.')
    ap.add_argument('--vmax-db', type=float, default=3.0,
                    help='Quicklook dB ceiling.')
    ap.add_argument('--dry-run', action='store_true',
                    help='Print processing plan only; do not process.')

    args = ap.parse_args()

    # ── Validate inputs ───────────────────────────────────────────────────
    if not os.path.isfile(args.slc):
        print(f"ERROR: SLC file not found: {args.slc}"); return 1
    if not os.path.isfile(args.xml):
        print(f"ERROR: XML file not found: {args.xml}"); return 1
    if args.range_looks < 1:
        print("ERROR: --range-looks must be >= 1"); return 1
    if args.azimuth_looks < 1:
        print("ERROR: --azimuth-looks must be >= 1"); return 1
    if not HAS_RASTERIO:
        print("ERROR: rasterio is required.  pip install rasterio"); return 1

    # ── Load metadata & print plan ────────────────────────────────────────
    meta = load_slc_meta(args.xml)
    _print_plan(meta, args.range_looks, args.azimuth_looks,
                args.strip_lines, args.amplitude)

    if args.dry_run:
        print("Dry-run complete."); return 0

    # ── Run ───────────────────────────────────────────────────────────────
    result = multilook(
        slc_path        = args.slc,
        xml_path        = args.xml,
        output_dir      = args.output,
        range_looks     = args.range_looks,
        azimuth_looks   = args.azimuth_looks,
        strip_out_lines = args.strip_lines,
        save_amplitude  = args.amplitude,
        vmin_db         = args.vmin_db,
        vmax_db         = args.vmax_db,
    )

    print("\nOutputs:")
    for k, v in result.items():
        print(f"  {k:<12}: {v}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())