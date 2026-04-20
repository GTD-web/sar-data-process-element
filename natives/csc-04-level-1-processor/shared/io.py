import os
import struct
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from xml.dom import minidom

import numpy as np

from shared.metadata import C, Meta, log

try:
    import rasterio
    import rasterio.windows

    HAS_RASTERIO = True
except ImportError:
    rasterio = None
    HAS_RASTERIO = False

try:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    HAS_MPL = True
except ImportError:
    plt = None
    HAS_MPL = False


# ════════════════════════════════════════════════════════════════════════════
# 10. GeoTIFF writer
# ════════════════════════════════════════════════════════════════════════════
def _write_tiff(data, out_path, n_bands, r_near, dr, prf):
    rows = data.shape[0]
    cols = data.shape[1]
    if HAS_RASTERIO:
        big = rows * cols * n_bands * 4 > 4e9
        kw = dict(
            driver="GTiff",
            height=rows,
            width=cols,
            count=n_bands,
            dtype="float32",
            compress="zstd",
            zstd_level=9,
            predictor=2,
            bigtiff="YES" if big else "NO",
        )
        with rasterio.open(out_path, "w", **kw) as dst:
            if n_bands == 1:
                dst.write(data.astype(np.float32), 1)
            else:
                #dst.write((data[:, :, 0] + 1j * data[:, :, 1]).astype(np.complex64), 1)
                dst.write(data[:, :, 0].astype(np.float32), 1)
                dst.write(data[:, :, 1].astype(np.float32), 2)
    else:
        _write_minimal_tiff(data, out_path, n_bands)


def _write_minimal_tiff(data, out_path, n_bands):
    rows = data.shape[0]
    cols = data.shape[1]
    if rows * cols * n_bands * 4 > 3.5e9:
        raw = out_path.replace(".tif", ".bin")
        data.astype(np.float32).tofile(raw)
        with open(out_path + ".hdr", "w", encoding="utf-8") as fh:
            fh.write(
                f"ENVI\nsamples={cols}\nlines={rows}\nbands={n_bands}\n"
                "data type=4\ninterleave=bsq\nbyte order=0\n"
            )
        return
    strip_byte_size = cols * n_bands * 4
    n_strips = rows
    tags = [
        (256, 4, 1, cols),
        (257, 4, 1, rows),
        (258, 3, 1, 32),
        (259, 3, 1, 1),
        (262, 3, 1, 1),
        (277, 3, 1, n_bands),
        (284, 3, 1, 1),
        (339, 3, 1, 3),
    ]
    n_tags = len(tags) + 2
    header_offset = 8
    ifd_size = 2 + n_tags * 12 + 4
    offset_strip_offsets = header_offset + ifd_size
    offset_strip_counts = offset_strip_offsets + n_strips * 4
    offset_image = offset_strip_counts + n_strips * 4
    strip_offsets = np.array([offset_image + i * strip_byte_size for i in range(n_strips)], dtype=np.uint32)
    strip_counts = np.full(n_strips, strip_byte_size, dtype=np.uint32)
    with open(out_path, "wb") as fh:
        fh.write(b"II\x2A\x00")
        fh.write(struct.pack("<I", header_offset))
        fh.write(struct.pack("<H", n_tags))
        for tag, tag_type, count, value in tags:
            fh.write(struct.pack("<HHII", tag, tag_type, count, value))
        fh.write(struct.pack("<HHII", 273, 4, n_strips, offset_strip_offsets))
        fh.write(struct.pack("<HHII", 279, 4, n_strips, offset_strip_counts))
        fh.write(struct.pack("<I", 0))
        fh.write(strip_offsets.tobytes())
        fh.write(strip_counts.tobytes())
        for row in range(rows):
            if n_bands == 1:
                fh.write(data[row].astype(np.float32).tobytes())
            else:
                interleaved = np.empty(cols * 2, dtype=np.float32)
                interleaved[0::2] = data[row, :, 0]
                interleaved[1::2] = data[row, :, 1]
                fh.write(interleaved.tobytes())
    log.info("TIFF %s  (%.1f MB)", out_path, os.path.getsize(out_path) / 1e6)


# ════════════════════════════════════════════════════════════════════════════
# 10b. Incremental TIFF strip writer
# ════════════════════════════════════════════════════════════════════════════
class _TiffStripWriter:
    def __init__(self, path: str, n_rows: int, n_cols: int, dr: float, prf: float):
        self.path = path
        self.n_rows = n_rows
        self.n_cols = n_cols
        self._dst = None
        self._fp = None

        if HAS_RASTERIO:
            big = n_rows * n_cols * 2 * 4 > 4e9
            kw = dict(
                driver="GTiff",
                height=n_rows,
                width=n_cols,
                count=2,
                dtype="float32",
                compress="zstd",
                zstd_level=9,
                predictor=2,
                bigtiff="YES" if big else "NO",
            )
            self._dst = rasterio.open(path, "w", **kw)
            log.info("Opened GeoTIFF for incremental strip writing: %s", path)
        else:
            raw_path = path.replace(".tif", ".bin")
            self._fp = open(raw_path, "wb")
            self._raw_path = raw_path
            self._hdr_path = raw_path + ".hdr"
            log.warning("rasterio not available — writing raw BIP binary: %s", raw_path)

    def write_strip(self, slab: np.ndarray, row_start: int) -> None:
        n_rows = slab.shape[0]
        if self._dst is not None:
            win = rasterio.windows.Window(col_off=0, row_off=row_start, width=self.n_cols, height=n_rows)
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
            with open(self._hdr_path, "w", encoding="utf-8") as fh:
                fh.write(
                    f"ENVI\nsamples = {self.n_cols}\nlines = {self.n_rows}\n"
                    "bands = 2\ndata type = 4\ninterleave = bip\n"
                    "byte order = 0\nband names = {real, imaginary}\n"
                )
            log.info("Raw BIP binary → %s  header → %s", self._raw_path, self._hdr_path)
            self._fp = None


def _write_quicklook(amp, out_path: str, vmin_db: float = -60.0, vmax_db: float = -5.0) -> bool:
    if not HAS_MPL:
        log.warning("matplotlib not available — skipping PNG quicklook")
        return False

    max_val = float(amp.max())
    if max_val <= 0:
        log.warning("Amplitude image is all-zero — skipping PNG quicklook")
        return False

    with np.errstate(divide="ignore", invalid="ignore"):
        db = 20.0 * np.log10(amp / max_val)
    db = np.nan_to_num(db, nan=vmin_db, posinf=vmax_db, neginf=vmin_db)

    plt.imsave(out_path, db, cmap="gray", vmin=vmin_db, vmax=vmax_db)
    log.info("Quicklook → %s  (vmin=%.0f dB  vmax=%.0f dB)", out_path, vmin_db, vmax_db)
    return True


def _write_quicklook_from_slc(
    slc_path: str,
    ql_path: str,
    vmin_db: float = -60.0,
    vmax_db: float = -5.0,
    strip_rows: int = 512,
    max_px: int = 8192,
) -> bool:
    if not HAS_MPL:
        log.warning("matplotlib not available — skipping quicklook")
        return False
    if not HAS_RASTERIO:
        log.warning("rasterio not available — cannot read TIFF in strips; skipping quicklook")
        return False

    with rasterio.open(slc_path) as src:
        n_rows, n_cols = src.height, src.width
        ds = max(1, max(n_rows, n_cols) // max_px)
        gmax = 0.0
        # ── Pass 1: global max amplitude ─────────────────────────────────
        for r0 in range(0, n_rows, strip_rows):
            r1 = min(r0 + strip_rows, n_rows)
            win = rasterio.windows.Window(0, r0, n_cols, r1 - r0)
            re = src.read(1, window=win).astype(np.float32)
            im = src.read(2, window=win).astype(np.float32)
            gmax = max(gmax, float(np.sqrt(re**2 + im**2).max()))

        if gmax <= 0.0:
            log.warning("Amplitude image is all-zero — skipping quicklook")
            return False

        segments = []
        with np.errstate(divide="ignore", invalid="ignore"):
            # ── Pass 2: build downsampled dB image ───────────────────────────
            for r0 in range(0, n_rows, strip_rows):
                r1 = min(r0 + strip_rows, n_rows)
                win = rasterio.windows.Window(0, r0, n_cols, r1 - r0)
                re = src.read(1, window=win).astype(np.float32)[:, ::ds]
                im = src.read(2, window=win).astype(np.float32)[:, ::ds]
                amp = np.sqrt(re**2 + im**2)
                db = 20.0 * np.log10(np.maximum(amp / gmax, 1e-30))
                segments.append(np.clip(db, vmin_db, vmax_db)[::ds])

    db_img = np.vstack(segments)
    plt.imsave(ql_path, db_img, cmap="gray", vmin=vmin_db, vmax=vmax_db)
    log.info("Quicklook → %s  (%dx%d px,  vmin=%.0f dB  vmax=%.0f dB)", ql_path, db_img.shape[0], db_img.shape[1], vmin_db, vmax_db)
    return True


# ════════════════════════════════════════════════════════════════════════════
# 11. XML metadata writer
# ════════════════════════════════════════════════════════════════════════════
def write_metadata_xml(m: Meta, fdc_mean: float, fdc_log: dict, n_blocks: int, out_path: str):
    root = ET.Element("SARProcessingMetadata", version="3.0", created=datetime.now(UTC).isoformat().replace("+00:00", "Z"))

    def sub(parent, tag, text=None, **attrs):
        el = ET.SubElement(parent, tag, attrib=attrs)
        if text is not None:
            el.text = str(text)
        return el

    pi = sub(root, "ProductInfo")
    sub(pi, "ProductType", "SLC")
    sub(pi, "ProcessingLevel", "L1")
    sub(pi, "Processor", "sar_rda_processor.py v3.0")
    sub(pi, "ProcessingDate", datetime.now(UTC).isoformat().replace("+00:00", "Z"))
    sub(pi, "InputFile", m.h5_path)

    ins = sub(root, "Instrument")
    sub(ins, "CarrierFrequency", f"{m.fc:.6e}", unit="Hz")
    sub(ins, "Wavelength", f"{m.wavelength:.6f}", unit="m")
    sub(ins, "PRF", f"{m.prf:.4f}", unit="Hz")
    sub(ins, "SamplingFrequency", f"{m.fs:.6e}", unit="Hz")
    sub(ins, "PulseWidth", f"{m.pulse_width:.2e}", unit="s")
    sub(ins, "ChirpBandwidth", f"{abs(m.bw_stop - m.bw_start):.4e}", unit="Hz")
    sub(ins, "BeamwidthAzimuth", f"{m.beamwidth:.4f}", unit="deg")
    sub(ins, "LookAngle", f"{m.look_angle:.4f}", unit="deg")
    sub(ins, "SquintAngle", f"{m.squint_angle:.6f}", unit="deg")

    acq = sub(root, "Acquisition")
    sub(acq, "PlatformHeight", f"{m.platform_height:.2f}", unit="m")
    sub(acq, "FlightSpeed", f"{m.flight_speed:.4f}", unit="m/s")
    sub(acq, "Vr_eff", f"{m.Vr_eff:.4f}", unit="m/s")
    sub(acq, "SlantRangeNear", f"{m.r_near:.4f}", unit="m")
    sub(acq, "SlantRangeFar", f"{m.r_far_dec:.4f}", unit="m")
    sub(acq, "SlantRangeMid", f"{m.r_ref_dec:.4f}", unit="m")
    sub(acq, "SWST", f"{m.swst:.6e}", unit="s")
    gp = sub(acq, "GPS")
    sub(gp, "MeanLat", f"{float(np.mean(m.lat)):.6f}", unit="deg")
    sub(gp, "MeanLon", f"{float(np.mean(m.lon)):.6f}", unit="deg")
    sub(gp, "MeanAlt", f"{float(np.mean(m.alt)):.2f}", unit="m")

    # ── Scene UTC timing ─────────────────────────────────────────────────
    timing = sub(root, "SceneTiming")
    sub(timing, "ReferenceUTC", m.reference_utc)
    sub(timing, "SceneSensingStartUTC", m.scene_start_utc)
    sub(timing, "SceneSensingStopUTC", m.scene_stop_utc)
    sub(timing, "FirstLineUTC", m.gps_utc_iso[0] if m.gps_utc_iso else "")
    sub(timing, "LastLineUTC", m.gps_utc_iso[-1] if m.gps_utc_iso else "")

    # ── Orbit / State Vector list (Sentinel-1 style orbitList) ──────────
    # GPS Time column = seconds since Reference UTC.
    # UTC[i] = Reference_UTC + gps_t[i].  Verified: gps_t[0]=196452 s
    # → 2024-10-15T06:34:12Z = Scene Sensing Start UTC. ✓
    orb = sub(
        root,
        "orbitList",
        count=str(len(m.gps_utc_iso)),
        source="GPSDATA_HQ",
        columns="Time Lat Lon Alt Vx Vy Vz",
        note="Time=seconds since Reference UTC; Vx/Vy/Vz are NED (North/East/Down) m/s as stored in HDF5",
    )
    for i, utc in enumerate(m.gps_utc_iso):
        sv = sub(orb, "orbit")
        sub(sv, "time", utc)
        pos = sub(sv, "position", unit="deg_m")
        sub(pos, "lat", f"{m.gps_lat_raw[i]:.8f}")
        sub(pos, "lon", f"{m.gps_lon_raw[i]:.8f}")
        sub(pos, "alt", f"{m.gps_alt_raw[i]:.3f}")
        vel = sub(sv, "velocity", unit="m/s", frame="NED")
        sub(vel, "vx", f"{m.gps_vx_raw[i]:.6f}")  # North
        sub(vel, "vy", f"{m.gps_vy_raw[i]:.6f}")  # East
        sub(vel, "vz", f"{m.gps_vz_raw[i]:.6f}")  # Down

    proc = sub(root, "Processing")
    dec = sub(proc, "RangeDecimation")
    sub(dec, "Factor", str(m.decimate_range))
    sub(dec, "Applied", "YES" if m.decimate_range > 1 else "NO")
    if m.decimate_range > 1:
        sub(dec, "Method", "resample_poly (data); FIR+downsample (replica)")
        sub(dec, "LPF_Taps", str(m.lpf_n_taps))
        sub(dec, "fs_dec", f"{m.fs_dec:.4e}", unit="Hz")
        sub(dec, "nr_dec", str(m.nr_dec))
        sub(dec, "dr_dec", f"{m.dr_dec:.6f}", unit="m")

    rc_el = sub(proc, "RangeCompression")
    sub(rc_el, "Method", "Linear matched-filter: MF=conj(flip(replica)), Nfft=nextpow2(Nrg+Nrep-1), crop=[Nrep-1:Nrep-1+Nrg]")
    sub(rc_el, "RangeResolution", f"{C / (2 * abs(m.bw_stop - m.bw_start)):.4f}", unit="m")

    dc = sub(proc, "DopplerCentroid")
    sub(dc, "Method", "Per-line cross-correlation: corr=sum(s[:,n]*conj(s[:,n-1]),axis=0), fdc=PRF/(2pi)*arg(corr), Savitzky-Golay smoothed (poly=5,len=101)")
    sub(dc, "Deramping", "Cumulative phase: exp(-j*2pi*cumsum(fdc)/PRF)")
    sub(dc, "MeanEstimate", f"{fdc_mean:.4f}", unit="Hz")
    for bi in sorted(fdc_log.keys()):
        sub(dc, "BlockEstimate", f"{fdc_log[bi]:.4f}", block=str(bi), unit="Hz")

    sub(proc, "RCMC", text="Time-domain per-column: R(n,R0)=sqrt(R0^2+(Vr*n/PRF)^2), shift=(R-R0)*2fs/c, np.interp")
    sub(proc, "AzimuthCompression", text="Time-domain quadratic: h(t)=exp(-j*pi*Ka_neg*t^2), Ka_neg=-2Vr^2/(lam*R), FFT-conv padded to nextpow2(2*Naz), vectorised over range chunks")

    blk = sub(proc, "BlockProcessing")
    sub(blk, "Method", "Sliding-window overlap-add (reference-code approach): each block reads exactly na_block lines, no zero-padding; last block slid back; entire block Tukey-weighted and accumulated")
    sub(blk, "TotalBlocks", str(n_blocks))
    sub(blk, "na_block", str(m.na_block))
    sub(blk, "na_overlap", str(m.na_overlap))
    sub(blk, "na_valid_step", str(m.na_valid))
    sub(blk, "TukeyAlpha", "1.0000")
    sub(blk, "SyntheticApertureLines", str(m.na_syn))
    sub(blk, "DopplerFMRateRef", f"{m.ka_ref:.4f}", unit="Hz/s")

    img = sub(root, "OutputImage")
    sub(img, "NumberOfLines", str(m.na_total))
    sub(img, "NumberOfSamples", str(m.nr_dec))
    sub(img, "RangeSampleSpacing", f"{m.dr_dec:.6f}", unit="m")
    sub(img, "AzimuthLineSpacing", f"{1 / m.prf:.8f}", unit="s")
    sub(img, "DataType", "Complex SLC: float32 real + float32 imag (2-band GeoTIFF), band-1 = real, band-2 = imaginary")
    sub(img, "GeoCoding", "NOT APPLIED (slant-range geometry)")

    dom = minidom.parseString(ET.tostring(root, encoding="utf-8"))
    with open(out_path, "wb") as fh:
        fh.write(dom.toprettyxml(indent="  ", encoding="utf-8"))
    log.info("XML → %s", out_path)
