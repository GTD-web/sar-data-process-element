"""CSC-04 shared metadata and geometry utilities.

Preserved from the original V4 processor:

Range decimation  (--decimate-range D)
--------------------------------------
  Safe limit: D <= floor(fs / (2 x chirp_BW))
  For fs=1.5 GHz, B=1.2 GHz -> D_max = 0 (no decimation available).
  The code prints a warning if D exceeds this limit.

Slant range formula
-------------------
  "Sampling Window Start Time" (SWST) is the round-trip (two-way) range
  delay from pulse transmission to the start of the ADC sampling window.

  One-way slant range to first sample:
      R_near = c x SWST / 2

  Full slant range vector:
      SR[i] = R_near + i x dr    where dr = c / (2 x fs)

  Equivalently:
      SR[i] = (SWST + i/fs) x c/2

  Using R_near = c x SWST (treating SWST as one-way) doubles all slant
  ranges, halving Ka = 2V^2/(lambda R) and defocusing azimuth.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
from scipy.interpolate import interp1d
from scipy.signal import firwin, lfilter

try:
    import h5py

    HAS_H5PY = True
except ImportError:
    h5py = None
    HAS_H5PY = False

C = 299_792_458.0
Re = 6_378_144.0
log = logging.getLogger("SAR-RDA")


# ════════════════════════════════════════════════════════════════════════════
# 1.  Metadata
# ════════════════════════════════════════════════════════════════════════════
class Meta:
    """All parameters needed by every worker block."""

    # sensor
    prf: float
    fc: float
    fs: float
    bw_start: float
    bw_stop: float
    pulse_width: float
    swst: float
    look_angle: float
    platform_height: float
    flight_speed: float
    beamwidth: float
    squint_angle: float
    # data dimensions
    na_total: int
    nr: int
    nr_rep: int
    # Azimuth subset offset into raw H5 (defaults 0). Lets a caller process only
    # a slice of pulses [az_offset : az_offset + na_total) for demo speed.
    # When 0 and na_total == raw shape, behavior is identical to no slicing.
    az_offset: int = 0
    # GPS (interpolated to PRF rate, length na_total)
    v_mag: np.ndarray
    lat: np.ndarray
    lon: np.ndarray
    alt: np.ndarray
    # derived geometry
    wavelength: float
    dr: float
    r_near: float
    Vr_eff: float
    # range decimation
    decimate_range: int
    nr_dec: int
    fs_dec: float
    dr_dec: float
    r_far_dec: float
    r_ref_dec: float
    lpf_n_taps: int
    # block layout
    na_syn: int
    na_overlap: int
    na_valid: int
    na_block: int
    # Doppler FM rate at mid-swath
    ka_ref: float
    # decimated replica (complex)
    replica_dec: np.ndarray
    h5_path: str
    # raw GPS state vectors (for XML orbit block)
    gps_utc_iso: list
    gps_lat_raw: np.ndarray
    gps_lon_raw: np.ndarray
    gps_alt_raw: np.ndarray
    gps_vx_raw: np.ndarray
    gps_vy_raw: np.ndarray
    gps_vz_raw: np.ndarray
    scene_start_utc: str
    scene_stop_utc: str
    reference_utc: str


def load_metadata(
    h5_path: str,
    decimate_range: int = 1,
    valid_lines: Optional[int] = None,
    na_block_override: Optional[int] = None,
    na_overlap_override: Optional[int] = None,
    az_start: Optional[int] = None,
    az_stop: Optional[int] = None,
) -> Meta:
    """
    Read HDF5 attributes, interpolate GPS, compute all processing parameters.

    Parameters
    ----------
    decimate_range     : integer range decimation factor D >= 1
    valid_lines        : override step (valid output lines per block). Default 1000.
    na_block_override  : set na_block directly; step = na_block - na_overlap.
    na_overlap_override: set na_overlap directly (default = na_syn at far range).
    az_start, az_stop  : optional [start, stop) pulse index slice into raw H5.
        Both default None meaning process the whole array. When set, na_total
        becomes (az_stop - az_start) and m.az_offset = az_start so block reads
        in csu_04_04_slc_formation can offset accordingly. Mirrors
        Lumir_SAR_Processor_GUI's az0/az1 trick for demo-speed processing.

    Block layout priority
    ---------------------
    If na_block_override AND na_overlap_override are both given:
        step = na_block - na_overlap   (valid_lines ignored)
    If only na_block_override:
        na_overlap = na_overlap_override or na_syn
        step       = na_block - na_overlap
    If only na_overlap_override:
        step       = valid_lines or 1000
        na_block   = na_overlap + step
    Default:
        na_overlap = na_syn
        step       = valid_lines or 1000
        na_block   = na_syn + step
    """
    if not HAS_H5PY:
        raise ImportError("h5py is required: pip install h5py")
    if decimate_range < 1:
        raise ValueError("decimate_range must be >= 1")

    m = Meta()
    m.h5_path = h5_path

    with h5py.File(h5_path, "r") as f:
        grp = f["ST0"]
        a = grp.attrs
        m.prf = float(a["PRF"])
        m.fc = float(a["Carrier Frequency"])
        m.fs = float(a["Sampling Frequency"])
        m.bw_start = float(a["Chirp baseband start"])
        m.bw_stop = float(a["Chirp baseband stop"])
        m.pulse_width = float(a["Pulse Width"])
        m.swst = float(a["Sampling Window Start Time"])
        m.look_angle = float(a["Look Angle"])
        m.platform_height = float(a["Platform Height"])
        m.flight_speed = float(a["Flight Speed"])
        m.beamwidth = float(a["Beamwidth"])
        m.squint_angle = float(a["Squint Angle"])
        raw_ds = grp["Raw data"]
        raw_total = int(raw_ds.shape[0])
        # Apply az_start/az_stop slice if provided. Defaults preserve full range.
        az_start_v = 0 if az_start is None else int(az_start)
        az_stop_v = raw_total if az_stop is None else int(az_stop)
        if not (0 <= az_start_v < az_stop_v <= raw_total):
            raise ValueError(
                f"invalid azimuth range [{az_start_v}, {az_stop_v}); raw H5 has {raw_total} pulses"
            )
        m.az_offset = az_start_v
        m.na_total = az_stop_v - az_start_v
        m.nr = int(raw_ds.shape[1])
        rep_raw = grp["Replica"][:]
        m.nr_rep = int(rep_raw.shape[0])
        gps = grp["GPSDATA_HQ"][:]
        # cols: Time Lat Lon Alt Roll Pitch Heading Distance Vx Vy Vz SOG
        # UTC attributes (stored on the ST0 group or the root)

        def _read_utc_attr(group, key):
            try:
                return str(group.attrs[key])
            except KeyError:
                return str(group.parent.attrs.get(key, ""))

        m.reference_utc = _read_utc_attr(grp, "Reference UTC")
        m.scene_start_utc = _read_utc_attr(grp, "Scene Sensing Start UTC")
        m.scene_stop_utc = _read_utc_attr(grp, "Scene Sensing Stop UTC")

    # GPS → PRF-rate interpolation. GPS samples cover the full raw azimuth range,
    # so anchor gps_idx to raw_total and evaluate at the requested subset only.
    n_gps = gps.shape[0]
    gps_idx = np.linspace(0, raw_total - 1, n_gps)
    pidx = np.arange(m.az_offset, m.az_offset + m.na_total, dtype=np.float64)

    def _interp(col):
        return interp1d(gps_idx, col, kind="cubic", fill_value="extrapolate")(pidx)

    vx = _interp(gps[:, 8])
    vy = _interp(gps[:, 9])
    vz = _interp(gps[:, 10])
    m.v_mag = np.sqrt(vx**2 + vy**2 + vz**2).astype(np.float32)
    m.lat = _interp(gps[:, 1]).astype(np.float32)
    m.lon = _interp(gps[:, 2]).astype(np.float32)
    m.alt = _interp(gps[:, 3]).astype(np.float32)

    # ── Raw GPS state vectors for XML orbit block ──────────────────────────
    # GPS Time column (col 0) = seconds since Reference UTC.
    # Conversion: UTC = Reference_UTC + timedelta(seconds=gps_t[i])
    # Verified: gps_t[0]=196452.0 s → 2024-10-15T06:34:12Z = Scene Sensing Start ✓
    ref_str = m.reference_utc.strip()
    try:
        ref_dt = datetime.fromisoformat(ref_str.replace(" ", "T"))
        if ref_dt.tzinfo is None:
            ref_dt = ref_dt.replace(tzinfo=timezone.utc)
    except Exception:
        ref_dt = datetime(2000, 1, 1, tzinfo=timezone.utc)

    m.gps_utc_iso = [
        (ref_dt + timedelta(seconds=float(gps[i, 0]))).strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"
        for i in range(gps.shape[0])
    ]
    m.gps_lat_raw = gps[:, 1].astype(np.float64)
    m.gps_lon_raw = gps[:, 2].astype(np.float64)
    m.gps_alt_raw = gps[:, 3].astype(np.float64)
    m.gps_vx_raw = gps[:, 8].astype(np.float64)
    m.gps_vy_raw = gps[:, 9].astype(np.float64)
    m.gps_vz_raw = gps[:, 10].astype(np.float64)

    # ── geometry ──────────────────────────────────────────────────────────────
    m.wavelength = C / m.fc
    m.dr = C / (2.0 * m.fs)
    # SWST = round-trip (two-way) range delay  →  one-way R_near = C × SWST / 2
    # Equivalently: SR[i] = (SWST + i/fs) × c/2  (same as reference code).
    m.r_near = C * m.swst / 2
    # Curved-Earth effective radar velocity
    m.Vr_eff = m.flight_speed * np.sqrt(Re / (Re + m.platform_height))

    # ── range decimation ──────────────────────────────────────────────────────
    D = int(decimate_range)
    m.decimate_range = D
    m.nr_dec = m.nr // D
    m.fs_dec = m.fs / D
    m.dr_dec = C / (2.0 * m.fs_dec)
    m.r_far_dec = m.r_near + (m.nr_dec - 1) * m.dr_dec
    m.r_ref_dec = m.r_near + (m.nr_dec // 2) * m.dr_dec
    m.lpf_n_taps = 129 if D > 1 else 0

    chirp_bw = abs(m.bw_stop - m.bw_start)
    if chirp_bw > m.fs_dec / 2.0 * 1.05:
        max_safe = max(0, int(m.fs / (2 * chirp_bw)))
        log.warning(
            "Chirp BW %.0f MHz > decimated Nyquist %.0f MHz (D=%d). Max safe D = %d.",
            chirp_bw / 1e6,
            m.fs_dec / 2 / 1e6,
            D,
            max_safe,
        )

    # ── Doppler FM rate at mid-swath ──────────────────────────────────────────
    m.ka_ref = 2.0 * m.Vr_eff**2 / (m.wavelength * m.r_ref_dec)

    # ── synthetic aperture length at far range (worst-case) ───────────────────
    theta = np.radians(m.beamwidth)
    na_syn_f = m.prf * theta * m.r_far_dec / m.Vr_eff
    m.na_syn = int(np.ceil(na_syn_f))

    # ── block layout  (reference-code style: one-sided overlap) ──────────────
    #   na_block = na_overlap + step
    #   Tukey alpha = 2*overlap/na_block  (may exceed 1 → Hann window)
    #   Each block reads EXACTLY na_block lines; last block is slid back.
    #   Priority: explicit na_block/na_overlap > na_syn auto + step.
    na_overlap = na_overlap_override if na_overlap_override is not None else m.na_syn
    step = valid_lines if valid_lines is not None else 1000
    if na_block_override is not None:
        m.na_block = int(na_block_override)
        m.na_overlap = int(na_overlap)
        m.na_valid = m.na_block - m.na_overlap
        if m.na_valid <= 0:
            raise ValueError(
                f"na_block_override ({m.na_block}) must be > na_overlap ({m.na_overlap})"
            )
    else:
        m.na_overlap = int(na_overlap)
        m.na_valid = int(step)
        m.na_block = m.na_overlap + m.na_valid

    # ── decimated replica ─────────────────────────────────────────────────────
    rep_full = rep_raw[:, 0].astype(np.float64) + 1j * rep_raw[:, 1].astype(np.float64)
    m.replica_dec = _decimate_replica(rep_full, D, m.lpf_n_taps) if D > 1 else rep_full.astype(np.complex64)

    log.info(
        "Metadata loaded: na_total=%d  nr=%d→%d(D=%d)  na_syn=%d  overlap=%d  step=%d  "
        "na_block=%d  R_near=%.0f  R_far=%.0f  Vr_eff=%.3f",
        m.na_total,
        m.nr,
        m.nr_dec,
        D,
        m.na_syn,
        m.na_overlap,
        m.na_valid,
        m.na_block,
        m.r_near,
        m.r_far_dec,
        m.Vr_eff,
    )
    return m


def _decimate_replica(replica: np.ndarray, D: int, n_taps: int) -> np.ndarray:
    """FIR-decimate the complex replica and compensate group delay."""
    cutoff = max(0.01, min(0.99, 1.0 / D))
    h = firwin(n_taps, cutoff)
    delay = (n_taps - 1) // 2
    padded = np.concatenate([replica, np.zeros(delay, dtype=replica.dtype)])
    fr = lfilter(h, 1.0, padded.real)
    fi = lfilter(h, 1.0, padded.imag)
    return (fr[delay::D] + 1j * fi[delay::D]).astype(np.complex64)
