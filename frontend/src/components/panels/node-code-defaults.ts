import type { SarStage } from '@/types/pipeline';

export interface NodeCodeDefault {
  code: string;
  language: string;
  filename: string;
}

const L1A_RANGE_COMPRESSION = String.raw`"""CSU-04.01 range compression.

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
`;

const L1B_MULTILOOK_GRD = String.raw`"""CSC-04 L1B Multi-look / GRD pipeline.

Implements the L1B portion of the CSC-04 ICD interface:

  CSU-04.05 Multi-look Processing — range/azimuth boxcar averaging
  CSU-04.06 Speckle Filtering    — Lee / Frost / refined-Lee filtering
  CSU-04.07 Ground-range Projection — slant→ground projection
  CSU-04.08 GRD Product           — Ground Range Detected product output

OPS-02 (ICD §3.2). Produces a Cloud Optimized GeoTIFF at L1B (sigma0 GRD).

Inputs:
  slc_path : Level-1A SLC GeoTIFF (complex64)
  out_path : output L1B GRD GeoTIFF
"""

from __future__ import annotations

from pathlib import Path
from typing import Tuple

import numpy as np
import rasterio
from scipy.ndimage import uniform_filter


# ════════════════════════════════════════════════════════════════════════════
# CSU-04.05  Multi-look Processing
# Range·Azimuth 방향으로 박스 평균(boxcar)을 적용해 픽셀 수를 줄이고 ENL을 늘려
# 스페클을 1차로 완화한다.
# ════════════════════════════════════════════════════════════════════════════
def multilook_processing(
    slc: np.ndarray, range_looks: int = 4, azimuth_looks: int = 1,
) -> np.ndarray:
    """Apply multi-look boxcar averaging to a complex SLC input."""
    if range_looks < 1 or azimuth_looks < 1:
        raise ValueError("multi-look factors must be >= 1")
    intensity = (slc.real ** 2 + slc.imag ** 2).astype(np.float32)
    h, w = intensity.shape
    h_out = h // azimuth_looks
    w_out = w // range_looks
    intensity = intensity[: h_out * azimuth_looks, : w_out * range_looks]
    looked = intensity.reshape(h_out, azimuth_looks, w_out, range_looks).mean(axis=(1, 3))
    return looked.astype(np.float32)


# ════════════════════════════════════════════════════════════════════════════
# Speckle Filtering
# Multi-look 후에도 남는 스페클을 통계 기반 필터로 추가 억제한다.
# 기본은 Lee filter (variance-aware), Frost filter는 옵션으로 선택 가능.
# ════════════════════════════════════════════════════════════════════════════
def lee_filter(image: np.ndarray, window: int = 5, cu: float = 0.523) -> np.ndarray:
    """Variance-aware speckle smoothing (refined Lee)."""
    mean = uniform_filter(image, size=window)
    sqr = uniform_filter(image ** 2, size=window)
    var = np.maximum(sqr - mean ** 2, 0.0)
    weight = (var / (var + (mean ** 2) * (cu ** 2) + 1e-9)).astype(np.float32)
    return (mean + weight * (image - mean)).astype(np.float32)


def frost_filter(image: np.ndarray, window: int = 5, damping: float = 2.0) -> np.ndarray:
    """Frost-style exponential decay speckle filter."""
    mean = uniform_filter(image, size=window)
    sqr = uniform_filter(image ** 2, size=window)
    var = np.maximum(sqr - mean ** 2, 0.0)
    cv2 = var / np.maximum(mean ** 2, 1e-9)
    blend = np.exp(-damping * cv2).astype(np.float32)
    return (blend * mean + (1.0 - blend) * image).astype(np.float32)


def apply_speckle_filter(image: np.ndarray, kind: str = "lee", window: int = 5) -> np.ndarray:
    """Dispatch to the selected speckle reducer (lee / frost / none)."""
    if kind == "lee":
        return lee_filter(image, window=window)
    if kind == "frost":
        return frost_filter(image, window=window)
    return image.astype(np.float32)


# ════════════════════════════════════════════════════════════════════════════
# CSU-04.06  GRD Converter — Ground-range Projection
# Slant range → ground range 투영. 평균 표고와 look angle을 이용해 픽셀 스페이싱
# (gr_projection)을 재계산하고 등간격 그라운드 그리드로 리샘플.
# ════════════════════════════════════════════════════════════════════════════
def project_to_ground_range(
    slant_image: np.ndarray, slant_spacing_m: float, look_angle_deg: float = 30.0,
) -> Tuple[np.ndarray, float]:
    """Slant→ground-range resample on the reference ellipsoid (gr_projection)."""
    sin_look = max(np.sin(np.deg2rad(look_angle_deg)), 1e-3)
    ground_spacing = slant_spacing_m / sin_look

    h, w = slant_image.shape
    gr_w = max(2, int(round(w * (slant_spacing_m / ground_spacing))))
    src_x = np.linspace(0.0, w - 1.0, num=gr_w)
    cols = np.clip(np.round(src_x).astype(np.int32), 0, w - 1)
    return slant_image[:, cols].astype(np.float32), ground_spacing


# ════════════════════════════════════════════════════════════════════════════
# CSU-04.06  Amplitude/phase Product
# Multi-look + speckle 처리된 결과에서 σ⁰ amplitude(진폭)와 phase(위상) 정보를
# 추출하고, GRD GeoTIFF 두 채널로 패키징한다.
# ════════════════════════════════════════════════════════════════════════════
def compute_amplitude(slc: np.ndarray) -> np.ndarray:
    """Compute amplitude (sqrt of intensity) from the complex SLC."""
    return np.sqrt(slc.real ** 2 + slc.imag ** 2).astype(np.float32)


def compute_phase(slc: np.ndarray) -> np.ndarray:
    """Compute interferometric phase (radians) from the complex SLC."""
    return np.angle(slc).astype(np.float32)


def write_grd_geotiff(
    amplitude: np.ndarray, phase: np.ndarray, profile: dict, out_path: str,
) -> str:
    """Write the amplitude/phase pair as a 2-band GRD COG."""
    out_profile = {
        **profile,
        "count": 2, "dtype": "float32",
        "driver": "COG", "compress": "deflate",
        "blockxsize": 512, "blockysize": 512,
    }
    with rasterio.open(out_path, "w", **out_profile) as dst:
        dst.write(amplitude, 1)
        dst.write(phase, 2)
    return out_path


# ── Pipeline orchestrator (OPS-02 / L1B) ────────────────────────────────────
def run_l1b_grd(slc_path: str, out_path: str) -> dict:
    with rasterio.open(slc_path) as src:
        slc = src.read(1)  # complex64 SLC
        profile = src.profile
        slant_spacing_m = abs(profile["transform"].a)

    looked = multilook_processing(slc, range_looks=4, azimuth_looks=1)
    smoothed = apply_speckle_filter(looked, kind="lee", window=5)
    grd, ground_spacing = project_to_ground_range(smoothed, slant_spacing_m)

    amplitude = np.sqrt(grd).astype(np.float32)
    h_out, w_out = amplitude.shape
    if slc.dtype == np.complex64:
        phase = compute_phase(slc[:h_out, :w_out])
    else:
        phase = np.zeros_like(amplitude, dtype=np.float32)

    write_grd_geotiff(amplitude, phase, profile, out_path)
    return {
        "out_path": out_path,
        "ground_spacing_m": ground_spacing,
        "shape": list(amplitude.shape),
    }


__all__ = [
    "apply_speckle_filter",
    "compute_amplitude",
    "compute_phase",
    "frost_filter",
    "lee_filter",
    "multilook_processing",
    "project_to_ground_range",
    "run_l1b_grd",
    "write_grd_geotiff",
]
`;

const L1C_GEOMETRIC_TERRAIN_CORRECTION = String.raw`"""CSC-04 L1C Geometric Terrain Correction (GTC) pipeline.

Implements the four CSU stages that produce a terrain-corrected, map-projected
Level-1C product from a Level-1B GRD input:

  CSU-04.09 DEM Integration              — load + reproject NAS DEM (EI-02)
  CSU-04.07 GEC Processor                — slant range → ground range geocode
                                           on the reference ellipsoid (no DEM)
  CSU-04.10 Geometric Terrain Correction — DEM-based ortho rectification
                                           (Range-Doppler model)
  CSU-04.11 Map Projection               — reproject to target CRS, write COG

OPS-02 (ICD §3.2). DEM 소스 (SRTM1/DTED-2)와 COG 타일 크기는 ICD에서 TBC.

Inputs:
  l1b_path : Level-1B GRD GeoTIFF (sigma0, slant- or ground-range)
  dem_path : NAS DEM tile path (EI-02)
  out_path : output L1C GTC GeoTIFF (Cloud Optimized)
"""

from __future__ import annotations

from pathlib import Path
from typing import Tuple

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import array_bounds, from_bounds, xy
from rasterio.warp import reproject, transform_bounds


# ════════════════════════════════════════════════════════════════════════════
# CSU-04.09  DEM Integration  (EI-02)
# NAS에 사전 배치된 SRTM-30m / DTED-2 타일을 읽어 SAR 영상 격자로 재투영한다.
# DEM 소스는 ICD §6.3 TBC — 알고리즘 팀 + 라이선스 협의에 따라 결정.
# ════════════════════════════════════════════════════════════════════════════
def load_dem_tile(dem_path: str | Path) -> Tuple[np.ndarray, dict]:
    """Read a DEM tile (digital_elevation model, e.g. SRTM-30m or DTED-2)."""
    with rasterio.open(dem_path) as src:
        dem = src.read(1).astype(np.float32)
        profile = src.profile
    # NaN sentinel handling for SRTM voids
    dem = np.where(dem < -1e4, np.nan, dem)
    return dem, profile


def reproject_dem_to_image_grid(
    dem: np.ndarray, dem_profile: dict, image_profile: dict,
) -> np.ndarray:
    """Resample the DEM into the SAR image grid via bilinear reprojection."""
    out = np.zeros((image_profile["height"], image_profile["width"]), dtype=np.float32)
    reproject(
        source=dem, destination=out,
        src_transform=dem_profile["transform"], src_crs=dem_profile["crs"],
        dst_transform=image_profile["transform"], dst_crs=image_profile["crs"],
        resampling=Resampling.bilinear,
    )
    return out


# ════════════════════════════════════════════════════════════════════════════
# CSU-04.07  Geometric Correction  (GEC Processor)
# 센서 기하모델 + 평균 표고만 반영한 ellipsoid_corrected 지오코딩.
# 슬랜트→그라운드 보정의 1차 단계로, DEM이 적용되기 전의 baseline 영상이다.
# ════════════════════════════════════════════════════════════════════════════
def build_lat_lon_grid(profile: dict) -> Tuple[np.ndarray, np.ndarray]:
    """Build per-pixel lat/lon grids from the image transform & CRS."""
    h, w = profile["height"], profile["width"]
    cols, rows = np.meshgrid(np.arange(w), np.arange(h))
    xs, ys = xy(profile["transform"], rows, cols)
    return np.array(ys, dtype=np.float64), np.array(xs, dtype=np.float64)


def gec_geocode_to_ground_range(
    sigma0_slant: np.ndarray, profile: dict, look_angle_deg: float = 30.0,
) -> np.ndarray:
    """Slant→ground range geocoding on the reference ellipsoid (no DEM)."""
    cos_look = max(np.cos(np.deg2rad(look_angle_deg)), 1e-3)
    return (sigma0_slant / cos_look).astype(np.float32)


# ════════════════════════════════════════════════════════════════════════════
# CSU-04.10  Geometric Terrain Correction  (GTC)
# DEM 기반 지형보정으로 orthorectified 영상을 생성한다 (Range-Doppler 모델).
# DEM 기울기에 의한 픽셀 변위를 계산해 픽셀 위치를 재배치한다.
# ════════════════════════════════════════════════════════════════════════════
def apply_geometric_terrain_correction(
    image: np.ndarray, dem_aligned: np.ndarray, look_angle_deg: float = 30.0,
) -> np.ndarray:
    """Apply Range-Doppler terrain_correction using the aligned DEM."""
    look_rad = np.deg2rad(look_angle_deg)
    dh_dy = np.gradient(np.nan_to_num(dem_aligned, nan=0.0), axis=0)
    pixel_shift = (dh_dy / np.tan(look_rad)).astype(np.float32)

    h, w = image.shape
    rows = np.arange(h)[:, None] - pixel_shift
    rows = np.clip(np.round(rows).astype(np.int32), 0, h - 1)
    cols = np.broadcast_to(np.arange(w), (h, w))
    return image[rows, cols]


# ════════════════════════════════════════════════════════════════════════════
# CSU-04.11  Map Projection
# 목표 CRS(UTM 50/52 N, WGS84 등)로 reproject하여 Cloud Optimized GeoTIFF 저장.
# COG 타일 크기·오버뷰 레벨은 ICD에서 TBC.
# ════════════════════════════════════════════════════════════════════════════
def reproject_to_map_projection(
    src_array: np.ndarray, src_profile: dict,
    dst_crs: str = "EPSG:32652", pixel_size_m: float = 10.0,
) -> Tuple[np.ndarray, dict]:
    """Reproject the GTC array to the target map_projection."""
    src_bounds = array_bounds(
        src_profile["height"], src_profile["width"], src_profile["transform"],
    )
    dst_bounds = transform_bounds(src_profile["crs"], dst_crs, *src_bounds, densify_pts=21)

    width = int(round((dst_bounds[2] - dst_bounds[0]) / pixel_size_m))
    height = int(round((dst_bounds[3] - dst_bounds[1]) / pixel_size_m))
    dst_transform = from_bounds(*dst_bounds, width=width, height=height)

    dst = np.zeros((height, width), dtype=np.float32)
    reproject(
        source=src_array, destination=dst,
        src_transform=src_profile["transform"], src_crs=src_profile["crs"],
        dst_transform=dst_transform, dst_crs=dst_crs,
        resampling=Resampling.bilinear,
    )

    dst_profile = {
        **src_profile,
        "crs": dst_crs,
        "transform": dst_transform,
        "width": width,
        "height": height,
        "driver": "COG",
        "compress": "deflate",
        "blockxsize": 512,
        "blockysize": 512,
    }
    return dst, dst_profile


# ── Pipeline orchestrator (OPS-02 / L1C) ────────────────────────────────────
def run_l1c_gtc(l1b_path: str, dem_path: str, out_path: str) -> dict:
    with rasterio.open(l1b_path) as src:
        sigma0 = src.read(1).astype(np.float32)
        img_profile = src.profile

    dem, dem_profile = load_dem_tile(dem_path)
    dem_aligned = reproject_dem_to_image_grid(dem, dem_profile, img_profile)

    geocoded = gec_geocode_to_ground_range(sigma0, img_profile)
    gtc = apply_geometric_terrain_correction(geocoded, dem_aligned)

    final, final_profile = reproject_to_map_projection(gtc, img_profile, dst_crs="EPSG:32652")

    with rasterio.open(out_path, "w", **final_profile) as dst:
        dst.write(final, 1)

    return {
        "out_path": out_path,
        "shape": list(final.shape),
        "dst_crs": str(final_profile["crs"]),
    }


__all__ = [
    "apply_geometric_terrain_correction",
    "build_lat_lon_grid",
    "gec_geocode_to_ground_range",
    "load_dem_tile",
    "reproject_dem_to_image_grid",
    "reproject_to_map_projection",
    "run_l1c_gtc",
]
`;

const L2A_MAP_PRODUCTS = String.raw`"""CSU-05.01 L2A map-product generation.

Generates per-pixel ancillary map layers from a focused L1C product:
  - incidence_angle (deg)   : local incidence vs. terrain normal
  - nesz (dB)               : noise-equivalent sigma-zero
  - nlooks                  : effective number of looks per pixel
  - layover_shadow          : 0/1/2 mask (none / layover / shadow)

Inputs:
    slc_geo_path : geocoded SLC (or GTC sigma0) GeoTIFF from L1C
    dem_path     : DEM aligned to the same grid (bilinear up-sampled if needed)
    orbit_state  : per-line satellite ECEF position+velocity (npz)
Outputs:
    incidence_angle.tif, nesz.tif, nlooks.tif, layover_shadow.tif

The implementation prefers numexpr for hot loops and uses windowed
DEM gradient estimates with a 3x3 Sobel kernel.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Tuple

import numpy as np
import rasterio
from rasterio.windows import Window
from scipy.ndimage import sobel


@dataclass(frozen=True)
class GridSpec:
    rows: int
    cols: int
    pixel_m: float
    crs: str


def _load_dem(path: str | Path, grid: GridSpec) -> np.ndarray:
    with rasterio.open(path) as src:
        if (src.height, src.width) != (grid.rows, grid.cols):
            dem = src.read(
                1, out_shape=(grid.rows, grid.cols), resampling=rasterio.enums.Resampling.bilinear
            )
        else:
            dem = src.read(1)
    return dem.astype(np.float32)


def _terrain_normals(dem: np.ndarray, pixel_m: float) -> np.ndarray:
    gx = sobel(dem, axis=1, mode="reflect") / (8.0 * pixel_m)
    gy = sobel(dem, axis=0, mode="reflect") / (8.0 * pixel_m)
    nx = -gx
    ny = -gy
    nz = np.ones_like(dem, dtype=np.float32)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / norm, ny / norm, nz / norm], axis=-1).astype(np.float32)


def compute_incidence_angle(
    sat_ecef: np.ndarray,         # (rows, cols, 3) per-pixel satellite vector
    ground_ecef: np.ndarray,      # (rows, cols, 3) ground point ECEF
    terrain_normal: np.ndarray,   # (rows, cols, 3)
) -> np.ndarray:
    look = ground_ecef - sat_ecef
    look /= np.linalg.norm(look, axis=-1, keepdims=True)
    cos_inc = np.einsum("...i,...i->...", -look, terrain_normal)
    inc = np.degrees(np.arccos(np.clip(cos_inc, -1.0, 1.0)))
    return inc.astype(np.float32)


def compute_nesz(
    sigma0_db: np.ndarray, noise_floor_db: float, calibration_db: float
) -> np.ndarray:
    """Pixel-wise NESZ = noise_floor - calibration - 10*log10(thermal_correction)."""
    thermal = 10.0 ** ((sigma0_db - calibration_db) / 10.0)
    nesz = noise_floor_db - 10.0 * np.log10(np.maximum(thermal, 1e-6))
    return nesz.astype(np.float32)


def compute_nlooks(slc_intensity: np.ndarray, az_looks: int, rg_looks: int) -> np.ndarray:
    if az_looks <= 1 and rg_looks <= 1:
        return np.full(slc_intensity.shape, 1.0, dtype=np.float32)
    kernel = np.ones((az_looks, rg_looks), dtype=np.float32)
    from scipy.signal import fftconvolve

    looks = fftconvolve(slc_intensity > 0, kernel, mode="same")
    return looks.astype(np.float32)


def compute_layover_shadow(
    incidence_angle: np.ndarray, look_angle: np.ndarray, slope_along_range: np.ndarray,
) -> np.ndarray:
    layover = (slope_along_range > look_angle).astype(np.uint8)
    shadow = (incidence_angle >= 90.0).astype(np.uint8)
    mask = np.zeros_like(incidence_angle, dtype=np.uint8)
    mask[layover == 1] = 1
    mask[shadow == 1] = 2
    return mask


def run_l2a_map_products(slc_geo_path: str, dem_path: str, orbit_npz: str, out_dir: str) -> dict:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    with rasterio.open(slc_geo_path) as src:
        sigma0_db = src.read(1).astype(np.float32)
        grid = GridSpec(rows=src.height, cols=src.width, pixel_m=abs(src.res[0]), crs=src.crs.to_string())
        profile = src.profile

    dem = _load_dem(dem_path, grid)
    normals = _terrain_normals(dem, grid.pixel_m)

    orbit = np.load(orbit_npz)
    sat_ecef = orbit["sat_ecef"]
    ground_ecef = orbit["ground_ecef"]
    look_angle = orbit["look_angle"]
    slope_rg = orbit["slope_along_range"]

    inc = compute_incidence_angle(sat_ecef, ground_ecef, normals)
    nesz = compute_nesz(sigma0_db, noise_floor_db=-26.0, calibration_db=-3.5)
    nlooks = compute_nlooks(np.abs(sigma0_db), az_looks=1, rg_looks=1)
    mask = compute_layover_shadow(inc, look_angle, slope_rg)

    profile.update(dtype="float32", count=1)
    layers = {
        "incidence_angle.tif": inc,
        "nesz.tif": nesz,
        "nlooks.tif": nlooks,
    }
    for name, arr in layers.items():
        with rasterio.open(out / name, "w", **profile) as dst:
            dst.write(arr, 1)

    profile.update(dtype="uint8")
    with rasterio.open(out / "layover_shadow.tif", "w", **profile) as dst:
        dst.write(mask, 1)

    return {name: str(out / name) for name in [*layers.keys(), "layover_shadow.tif"]}


__all__ = [
    "compute_incidence_angle",
    "compute_layover_shadow",
    "compute_nesz",
    "compute_nlooks",
    "run_l2a_map_products",
]
`;

const L2B_SCENE_ANALYSIS = String.raw`"""CSU-05.02 L2B scene analysis (preprocessing + MSK / OBJ / CHG).

Co-registers the current acquisition to a reference, derives per-scene
geometry layers, and then runs detection + change analysis:
  - incidence_angle_map : per-pixel local incidence (deg)
  - shadow_mask         : binary radar shadow mask (1 = in shadow)
  - layover_mask        : binary layover mask (1 = layover)
  - co-registration     : sub-pixel align current acquisition to reference
  - MSK : water/land/urban segmentation mask (uint8 class ids)
  - OBJ : ship/structure detections as a GeoJSON FeatureCollection
  - CHG : pixel-wise change-detection ratio (sigma0 ratio in dB)

Algorithms:
  - Co-registration : phase-cross-correlation on log-amplitude tiles, then
                      sub-pixel shift via scipy.ndimage.shift.
  - Geometry        : DEM-derived slope/aspect → local incidence; shadow when
                      incidence > 90°; layover when range slope > look angle.
  - Segmentation    : K-means on (sigma0_VV, NESZ, incidence_angle) with
                      morphological opening to suppress speckle.
  - Detection       : CFAR (CA-CFAR, 31x31 reference, 3x3 guard) followed by
                      connected-component analysis; objects below min_area_m2 dropped.
  - Change          : 10*log10(sigma0_now / sigma0_ref), with bias correction
                      using stable land pixels (water masked out).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, List, Tuple

import numpy as np
import rasterio
from rasterio.features import shapes
from scipy import ndimage as ndi
from scipy.ndimage import shift as ndi_shift
from scipy.ndimage import sobel
from scipy.signal import fftconvolve
from skimage.registration import phase_cross_correlation
from sklearn.cluster import MiniBatchKMeans


# ── Class IDs for the segmentation mask ──────────────────────────────────────
CLASS_WATER = 1
CLASS_LAND = 2
CLASS_URBAN = 3


# ── Co-registration ──────────────────────────────────────────────────────────
def coregister_to_reference(
    sigma0_now: np.ndarray, sigma0_ref: np.ndarray, upsample: int = 10,
) -> Tuple[np.ndarray, Tuple[float, float]]:
    """Sub-pixel align current acquisition to reference via phase correlation.

    Returns the shifted current acquisition and the (row, col) offset applied.
    """
    ref_log = np.log1p(np.maximum(sigma0_ref, 0.0)).astype(np.float32)
    now_log = np.log1p(np.maximum(sigma0_now, 0.0)).astype(np.float32)
    shift_vec, _, _ = phase_cross_correlation(ref_log, now_log, upsample_factor=upsample)
    aligned = ndi_shift(sigma0_now, shift=shift_vec, order=1, mode="nearest")
    return aligned.astype(sigma0_now.dtype), (float(shift_vec[0]), float(shift_vec[1]))


# ── Incidence Angle Map ──────────────────────────────────────────────────────
def compute_incidence_angle_map(
    dem: np.ndarray, look_vector: np.ndarray, pixel_m: float,
) -> np.ndarray:
    """Per-pixel local incidence angle (deg) from DEM gradients and look vector."""
    gx = sobel(dem, axis=1, mode="reflect") / (8.0 * pixel_m)
    gy = sobel(dem, axis=0, mode="reflect") / (8.0 * pixel_m)
    nx, ny, nz = -gx, -gy, np.ones_like(dem, dtype=np.float32)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    normals = np.stack([nx / norm, ny / norm, nz / norm], axis=-1).astype(np.float32)
    cos_inc = np.einsum("...i,...i->...", -look_vector, normals)
    inc_deg = np.degrees(np.arccos(np.clip(cos_inc, -1.0, 1.0)))
    return inc_deg.astype(np.float32)


# ── Shadow Mask ──────────────────────────────────────────────────────────────
def compute_shadow_mask(incidence_angle: np.ndarray, threshold_deg: float = 90.0) -> np.ndarray:
    """Binary shadow mask: 1 where local incidence exceeds the look horizon."""
    shadow = (incidence_angle >= threshold_deg).astype(np.uint8)
    return ndi.binary_closing(shadow, iterations=1).astype(np.uint8)


# ── Layover Mask ─────────────────────────────────────────────────────────────
def compute_layover_mask(
    slope_along_range: np.ndarray, look_angle: np.ndarray,
) -> np.ndarray:
    """Binary layover mask: 1 where range slope exceeds the radar look angle."""
    layover = (slope_along_range > look_angle).astype(np.uint8)
    return ndi.binary_opening(layover, iterations=1).astype(np.uint8)


def segment_scene(sigma0_db: np.ndarray, nesz_db: np.ndarray, incidence: np.ndarray) -> np.ndarray:
    feats = np.stack([sigma0_db, nesz_db, incidence], axis=-1).reshape(-1, 3).astype(np.float32)
    km = MiniBatchKMeans(n_clusters=3, batch_size=8192, n_init=4, random_state=42)
    labels = km.fit_predict(feats).reshape(sigma0_db.shape)
    centers = km.cluster_centers_

    order = np.argsort(centers[:, 0])  # darkest cluster first
    remap = np.zeros(3, dtype=np.uint8)
    remap[order[0]] = CLASS_WATER
    remap[order[1]] = CLASS_LAND
    remap[order[2]] = CLASS_URBAN
    mask = remap[labels]

    mask = ndi.binary_opening(mask == CLASS_WATER, iterations=2).astype(np.uint8) * CLASS_WATER \
        + ndi.binary_opening(mask == CLASS_LAND, iterations=1).astype(np.uint8) * CLASS_LAND \
        + (mask == CLASS_URBAN).astype(np.uint8) * CLASS_URBAN
    return mask.astype(np.uint8)


def cfar_detect(
    sigma0_lin: np.ndarray, ref_size: int = 31, guard_size: int = 3, pfa: float = 1e-6,
) -> np.ndarray:
    """Cell-averaging CFAR with a square guard region."""
    ref_kernel = np.ones((ref_size, ref_size), dtype=np.float32)
    guard_kernel = np.ones((guard_size, guard_size), dtype=np.float32)

    ref_kernel[
        ref_size // 2 - guard_size // 2 : ref_size // 2 + guard_size // 2 + 1,
        ref_size // 2 - guard_size // 2 : ref_size // 2 + guard_size // 2 + 1,
    ] = 0
    n_ref = ref_kernel.sum()

    mean_bg = fftconvolve(sigma0_lin, ref_kernel, mode="same") / max(n_ref, 1)
    threshold_factor = -np.log(pfa)  # exponential CFAR
    threshold = mean_bg * threshold_factor
    return (sigma0_lin > threshold).astype(np.uint8)


def vectorize_detections(mask: np.ndarray, transform, min_area_m2: float, pixel_m: float) -> List[dict]:
    min_area_pix = int(np.ceil(min_area_m2 / (pixel_m * pixel_m)))
    labeled, n = ndi.label(mask)
    keep = np.zeros(n + 1, dtype=bool)
    keep[1:] = ndi.sum(mask, labeled, index=np.arange(1, n + 1)) >= min_area_pix
    cleaned = keep[labeled].astype(np.uint8)

    features = []
    for geom, value in shapes(cleaned, mask=cleaned == 1, transform=transform):
        features.append({
            "type": "Feature",
            "properties": {"class": "ship_or_structure", "value": int(value)},
            "geometry": geom,
        })
    return features


def change_ratio_db(sigma0_now: np.ndarray, sigma0_ref: np.ndarray, mask: np.ndarray) -> np.ndarray:
    eps = 1e-6
    ratio = 10.0 * np.log10(np.maximum(sigma0_now, eps) / np.maximum(sigma0_ref, eps))
    land = mask == CLASS_LAND
    if land.any():
        bias = float(np.median(ratio[land]))
        ratio -= bias
    return ratio.astype(np.float32)


def run_l2b_scene_analysis(
    sigma0_now_path: str,
    sigma0_ref_path: str,
    nesz_path: str,
    dem_path: str,
    orbit_npz: str,
    out_dir: str,
    pixel_m: float = 10.0,
    min_object_area_m2: float = 60.0,
) -> dict:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    with rasterio.open(sigma0_now_path) as s_now, \
         rasterio.open(sigma0_ref_path) as s_ref, \
         rasterio.open(nesz_path) as nesz_src, \
         rasterio.open(dem_path) as dem_src:
        sigma0_now_db = s_now.read(1).astype(np.float32)
        sigma0_ref_db = s_ref.read(1).astype(np.float32)
        nesz = nesz_src.read(1).astype(np.float32)
        dem = dem_src.read(1).astype(np.float32)
        profile = s_now.profile
        transform = s_now.transform

    orbit = np.load(orbit_npz)
    look_vector = orbit["look_vector"]            # (rows, cols, 3)
    look_angle = orbit["look_angle"]              # (rows, cols)
    slope_along_range = orbit["slope_along_range"]  # (rows, cols)

    # Co-registration: align current sigma0 to the reference grid before analysis.
    sigma0_now_db, applied_shift = coregister_to_reference(sigma0_now_db, sigma0_ref_db)

    # Incidence Angle Map: per-pixel local incidence from DEM + look vector.
    inc = compute_incidence_angle_map(dem, look_vector, pixel_m)
    # Shadow Mask: pixels whose local incidence exceeds the look horizon.
    shadow = compute_shadow_mask(inc)
    # Layover Mask: pixels whose range slope exceeds the radar look angle.
    layover = compute_layover_mask(slope_along_range, look_angle)

    msk = segment_scene(sigma0_now_db, nesz, inc)

    sigma0_lin = 10.0 ** (sigma0_now_db / 10.0)
    det_mask = cfar_detect(sigma0_lin, ref_size=31, guard_size=3, pfa=1e-6)
    # Suppress detections inside shadow / layover.
    det_mask = (det_mask & (shadow == 0) & (layover == 0)).astype(np.uint8)
    objects = vectorize_detections(det_mask, transform, min_object_area_m2, pixel_m)

    sigma0_now_lin = 10.0 ** (sigma0_now_db / 10.0)
    sigma0_ref_lin = 10.0 ** (sigma0_ref_db / 10.0)
    chg = change_ratio_db(sigma0_now_lin, sigma0_ref_lin, msk)

    profile.update(dtype="float32", count=1)
    for name, arr in (("incidence_angle.tif", inc), ("CHG.tif", chg)):
        with rasterio.open(out / name, "w", **profile) as dst:
            dst.write(arr, 1)

    profile.update(dtype="uint8")
    for name, arr in (("MSK.tif", msk), ("shadow_mask.tif", shadow), ("layover_mask.tif", layover)):
        with rasterio.open(out / name, "w", **profile) as dst:
            dst.write(arr, 1)

    obj_path = out / "OBJ.geojson"
    obj_path.write_text(json.dumps(
        {"type": "FeatureCollection", "features": objects}, indent=2,
    ))

    return {
        "incidence_angle": str(out / "incidence_angle.tif"),
        "shadow_mask": str(out / "shadow_mask.tif"),
        "layover_mask": str(out / "layover_mask.tif"),
        "msk": str(out / "MSK.tif"),
        "chg": str(out / "CHG.tif"),
        "obj": str(obj_path),
        "n_objects": len(objects),
        "coregistration_shift_px": list(applied_shift),
    }


__all__ = [
    "cfar_detect",
    "change_ratio_db",
    "compute_incidence_angle_map",
    "compute_layover_mask",
    "compute_shadow_mask",
    "coregister_to_reference",
    "run_l2b_scene_analysis",
    "segment_scene",
    "vectorize_detections",
]
`;

const L0_LEVEL_0_PROCESSING = String.raw`"""CSC-03 Level-0 processing pipeline.

Implements the six CSUs defined in the CSC-03 ICD interface document:

  CSU-03.01 De-packetizer            — CCSDS Source Packet / CADU framing
  CSU-03.02 BAQ De-compression       — calls FI-01 baq_decompress()
  CSU-03.03 Range Line Reconstructor — chronological pulse ordering & cube
  CSU-03.04 Auxiliary Data Extractor — per-pulse PRF / orbit / attitude
  CSU-03.05 Calibration              — per-channel gain & phase correction
  CSU-03.06 HDF5 Converter           — writes the L0 HDF5 product (CI-01)

OPS-02 (ICD §3.2) — target latency 2,880 s.

Input:
  raw_path : downlink bitstream from CSC-02 (CADU/VCDU framed)
  cal_path : calibration table CSV (per-channel gain/phase/noise)
Output:
  out_h5   : Level-0 HDF5 file written under
             /sdpe/products/{satellite_id}/L0/{filename}
"""

from __future__ import annotations

import csv
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import List

import h5py
import numpy as np


# ════════════════════════════════════════════════════════════════════════════
# CSU-03.01  De-packetizer
# CCSDS / CADU 패킷 파싱. VCDU primary header를 벗기고 Source Packet 헤더에서
# APID·sequence·length를 꺼내, raw I/Q 페이로드와 64-byte aux 헤더로 분리한다.
# ════════════════════════════════════════════════════════════════════════════
_CADU_LEN = 1024
_VCDU_HEADER = 6
_SP_HEADER = struct.Struct(">HHH")  # version|apid, seq, length
_AUX_HEADER_LEN = 64


@dataclass
class SourcePacket:
    apid: int
    seq_count: int
    aux_header: bytes
    payload: bytes


def depacketize_ccsds(raw: bytes) -> List[SourcePacket]:
    """Split a CADU bitstream into CCSDS Source Packets."""
    packets: List[SourcePacket] = []
    cursor = 0
    while cursor + _CADU_LEN <= len(raw):
        cadu = raw[cursor : cursor + _CADU_LEN]
        cursor += _CADU_LEN
        sp = cadu[_VCDU_HEADER:]
        ver_apid, seq, length = _SP_HEADER.unpack_from(sp)
        body_len = length + 1
        body = sp[_SP_HEADER.size : _SP_HEADER.size + body_len]
        packets.append(SourcePacket(
            apid=ver_apid & 0x7FF,
            seq_count=seq & 0x3FFF,
            aux_header=body[:_AUX_HEADER_LEN],
            payload=body[_AUX_HEADER_LEN:],
        ))
    return packets


# ════════════════════════════════════════════════════════════════════════════
# CSU-03.02  BAQ De-compression  (calls FI-01 baq_decompress)
# 위성 OBP에서 BAQ로 압축된 echo를 원래 샘플 폭으로 복원한다. 알고리즘 자체는
# FI-01 인터페이스로 제공되는 외부 함수에 위임하며, 여기서는 호출 컨트랙트만
# 책임진다. bits_per_sample 허용값과 C++ 포팅 여부는 ICD에서 TBC 상태.
# ════════════════════════════════════════════════════════════════════════════
try:
    from sdpe.algorithms.fi01 import baq_decompress as _fi01_baq_decompress
except ImportError:
    def _fi01_baq_decompress(compressed: bytes, bits_per_sample: int) -> np.ndarray:
        """Reference decompression (slow Python). Replace with FI-01 build."""
        words = np.frombuffer(compressed, dtype=np.uint8)
        scale = 1 << (16 - bits_per_sample)
        return (words.astype(np.int16) - (1 << (bits_per_sample - 1))) * scale


def baq_decompress(packets: List[SourcePacket], bits_per_sample: int) -> List[np.ndarray]:
    """Apply BAQ decompression per pulse via FI-01."""
    return [_fi01_baq_decompress(pkt.payload, bits_per_sample) for pkt in packets]


# ════════════════════════════════════════════════════════════════════════════
# CSU-03.03  Range Line Reconstructor
# PRI 카운터·시각으로 펄스를 시간 정렬하고 PRF-jitter 중복을 제거한 뒤,
# (Naz, Nrg, 2) int16 큐브로 재구성한다.
# ════════════════════════════════════════════════════════════════════════════
def time_order_pulses(packets: List[SourcePacket], aux: List[dict]) -> List[int]:
    """Return packet indices in chronological PRI order, dropping duplicates."""
    keyed = sorted(range(len(packets)), key=lambda i: (aux[i]["pri_count"], aux[i]["t_utc"]))
    out: List[int] = []
    last = None
    for i in keyed:
        key = (aux[i]["pri_count"], aux[i]["t_utc"])
        if key == last:
            continue
        out.append(i)
        last = key
    return out


def reconstruct_range_lines(echoes: List[np.ndarray], order: List[int], n_rg: int) -> np.ndarray:
    """Assemble a (Naz, Nrg, 2) int16 raw cube from time-ordered echoes."""
    cube = np.empty((len(order), n_rg, 2), dtype=np.int16)
    for k, idx in enumerate(order):
        iq = echoes[idx].view(np.int16).reshape(n_rg, 2)
        cube[k] = iq
    return cube


# ════════════════════════════════════════════════════════════════════════════
# CSU-03.04  Auxiliary Data Extractor
# 펄스별 64B aux header에서 PRF, 주파수, look angle, 궤도/자세 메타를 뽑고
# 장면 단위 메타로 집약한다. 파일명 규칙(satellite_id 등)에 영향.
# ════════════════════════════════════════════════════════════════════════════
_AUX_FMT = struct.Struct("<IIddffffffff")
_AUX_KEYS = (
    "pri_count", "pulse_idx", "t_utc", "t_sat",
    "prf", "fc", "fs", "pw", "look_angle", "squint_angle",
    "orbit_alt_km", "orbit_inc_deg",
)


def extract_aux_data(packets: List[SourcePacket]) -> List[dict]:
    """Parse the 64-byte auxiliary header of every Source Packet."""
    return [
        dict(zip(_AUX_KEYS, _AUX_FMT.unpack_from(pkt.aux_header)))
        for pkt in packets
    ]


def aggregate_metadata(aux: List[dict]) -> dict:
    """Collapse per-pulse aux into per-acquisition attributes."""
    if not aux:
        return {}
    return {
        "PRF": float(np.mean([a["prf"] for a in aux])),
        "Carrier Frequency": float(aux[0]["fc"]),
        "Sampling Frequency": float(aux[0]["fs"]),
        "Pulse Width": float(aux[0]["pw"]),
        "Look Angle": float(aux[0]["look_angle"]),
        "Squint Angle": float(aux[0]["squint_angle"]),
        "Orbit Altitude (km)": float(aux[0]["orbit_alt_km"]),
        "Orbit Inclination (deg)": float(aux[0]["orbit_inc_deg"]),
        "Acquisition Start UTC": float(aux[0]["t_utc"]),
        "Acquisition End UTC": float(aux[-1]["t_utc"]),
    }


# ════════════════════════════════════════════════════════════════════════════
# CSU-03.05  Calibration
# 채널별 gain/phase/noise floor를 적용한다. CSV는 방사 보정 랩에서 export.
# ════════════════════════════════════════════════════════════════════════════
def load_calibration(cal_path: str | Path) -> dict:
    """Load (gain_db, phase_deg, noise_floor_db) per channel from CSV."""
    table: dict = {}
    with open(cal_path, newline="") as fh:
        for row in csv.DictReader(fh):
            table[row["channel"]] = {
                "gain_db": float(row["gain_db"]),
                "phase_deg": float(row["phase_deg"]),
                "noise_floor_db": float(row["noise_floor_db"]),
            }
    return table


def apply_calibration(cube: np.ndarray, cal: dict, channel: str = "VV") -> np.ndarray:
    """Apply linear gain and phase rotation to the int16 raw cube."""
    g_lin = 10.0 ** (cal[channel]["gain_db"] / 20.0)
    phi = np.deg2rad(cal[channel]["phase_deg"])
    cos_p, sin_p = np.cos(phi), np.sin(phi)

    re = cube[..., 0].astype(np.float32) * g_lin
    im = cube[..., 1].astype(np.float32) * g_lin
    re_rot = re * cos_p - im * sin_p
    im_rot = re * sin_p + im * cos_p

    out = np.empty_like(cube, dtype=np.int16)
    out[..., 0] = np.clip(re_rot, -32768, 32767).astype(np.int16)
    out[..., 1] = np.clip(im_rot, -32768, 32767).astype(np.int16)
    return out


# ════════════════════════════════════════════════════════════════════════════
# CSU-03.06  HDF5 Converter  (CI-01)
# /sdpe/products/{satellite_id}/L0/{파일명} 경로에 HDF5로 저장한다.
# 저장 경로 규칙은 ICD에서 satellite_id 형식 의존으로 TBC.
# ════════════════════════════════════════════════════════════════════════════
def convert_to_hdf5(cube: np.ndarray, attrs: dict, out_h5: str) -> str:
    """Write the calibrated raw cube and per-acquisition attrs to an HDF5 file."""
    with h5py.File(out_h5, "w") as h5:
        grp = h5.create_group("ST0")
        grp.create_dataset(
            "Raw data", data=cube,
            chunks=True, compression="gzip", compression_opts=4,
        )
        for k, v in attrs.items():
            grp.attrs[k] = v
    return out_h5


# ── Pipeline orchestrator (OPS-02) ──────────────────────────────────────────
def run_l0_processing(
    raw_path: str, cal_path: str, out_h5: str,
    bits_per_sample: int = 4, n_rg: int = 8192,
) -> dict:
    raw = Path(raw_path).read_bytes()

    packets = depacketize_ccsds(raw)
    echoes = baq_decompress(packets, bits_per_sample)
    aux = extract_aux_data(packets)
    order = time_order_pulses(packets, aux)
    cube = reconstruct_range_lines(echoes, order, n_rg)

    cal = load_calibration(cal_path)
    cube = apply_calibration(cube, cal, channel="VV")

    attrs = aggregate_metadata([aux[i] for i in order])
    convert_to_hdf5(cube, attrs, out_h5)
    return {"out_h5": out_h5, "n_pulses": len(order), "n_range_bins": n_rg}


__all__ = [
    "aggregate_metadata",
    "apply_calibration",
    "baq_decompress",
    "convert_to_hdf5",
    "depacketize_ccsds",
    "extract_aux_data",
    "load_calibration",
    "reconstruct_range_lines",
    "run_l0_processing",
    "time_order_pulses",
]
`;

const L3_APPLICATION_PRODUCT = String.raw`"""CSU-06.01 L3 application product generation.

Turns L2A/L2B inputs into a customer-facing application product. This is the
most domain-specific stage of the pipeline; the example below implements a
simple vegetation index (NDI-style) workflow with quality validation,
customer-tagged metadata, and a packaged GeoTIFF + STAC item output.

Replace 'compute_index' with whatever application logic the customer needs
— flood extent, urban change ratio, ship density grid, etc. Other functions
(quality check, metadata annotation, packaging) are reusable as-is.

Inputs:
    sigma0_path     : L1C/L2A radiometric backscatter (sigma0, dB)
    incidence_path  : L2A incidence angle map (deg)
    mask_path       : L2B segmentation mask (water/land/urban)
    customer_id     : tag stamped onto product metadata
Outputs:
    application_product.tif  : float32 GeoTIFF
    product_metadata.json    : STAC-style item metadata
    quality_report.json      : per-product QA metrics
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

import numpy as np
import rasterio


# ── 1. Application Product Generation ───────────────────────────────────────
def compute_index(sigma0_db: np.ndarray, mask: np.ndarray, valid_class: int = 2) -> np.ndarray:
    """
    Vegetation-style normalized difference index from a single-channel sigma0.
    NDI = (sigma0 - mean_land) / (sigma0 + |mean_land|), clamped to [-1, 1].
    Replace with your real application logic (flood, urban change, etc.).
    """
    land = mask == valid_class
    if not land.any():
        return np.zeros_like(sigma0_db, dtype=np.float32)
    mean_land = float(np.mean(sigma0_db[land]))
    eps = 1e-6
    ndi = (sigma0_db - mean_land) / (np.abs(sigma0_db) + np.abs(mean_land) + eps)
    return np.clip(ndi, -1.0, 1.0).astype(np.float32)


def generate_application_product(
    sigma0_db: np.ndarray, incidence: np.ndarray, mask: np.ndarray,
) -> np.ndarray:
    """Apply incidence-angle correction and produce the final product layer."""
    ndi = compute_index(sigma0_db, mask)
    cos_inc = np.cos(np.deg2rad(incidence)).astype(np.float32)
    cos_inc = np.where(cos_inc > 0.05, cos_inc, 1.0)
    return (ndi / cos_inc).astype(np.float32)


# ── 2. Quality Validation ───────────────────────────────────────────────────
@dataclass
class QualityReport:
    valid_pixel_ratio: float
    nan_pixel_ratio: float
    mean: float
    std: float
    pct_low: float    # 5th percentile
    pct_high: float   # 95th percentile
    passed: bool
    failure_reasons: list


def validate_product(arr: np.ndarray, mask: np.ndarray, valid_class: int = 2) -> QualityReport:
    valid = mask == valid_class
    valid_count = int(valid.sum())
    total = int(arr.size)
    nan_ratio = float(np.isnan(arr).sum() / max(total, 1))
    valid_ratio = float(valid_count / max(total, 1))

    sub = arr[valid]
    if sub.size == 0:
        sub = arr
    mean = float(np.nanmean(sub))
    std = float(np.nanstd(sub))
    pct_low = float(np.nanpercentile(sub, 5))
    pct_high = float(np.nanpercentile(sub, 95))

    failures = []
    if nan_ratio > 0.02:
        failures.append(f"NaN ratio {nan_ratio:.2%} exceeds 2%")
    if valid_ratio < 0.05:
        failures.append(f"Valid pixel ratio {valid_ratio:.2%} below 5%")
    if std < 1e-4:
        failures.append("Product is effectively flat (std≈0)")

    return QualityReport(
        valid_pixel_ratio=valid_ratio,
        nan_pixel_ratio=nan_ratio,
        mean=mean,
        std=std,
        pct_low=pct_low,
        pct_high=pct_high,
        passed=len(failures) == 0,
        failure_reasons=failures,
    )


# ── 3. Customer Metadata Annotation ─────────────────────────────────────────
def annotate_metadata(
    product_path: str, customer_id: str, qa: QualityReport, transform, crs: str,
) -> Dict:
    """Assemble STAC-style item metadata stamped with the customer tag."""
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return {
        "type": "Feature",
        "stac_version": "1.0.0",
        "id": Path(product_path).stem,
        "properties": {
            "datetime": now,
            "customer_id": customer_id,
            "product:type": "L3_APPLICATION",
            "product:level": "L3",
            "qa:passed": qa.passed,
            "qa:mean": qa.mean,
            "qa:std": qa.std,
            "qa:valid_pixel_ratio": qa.valid_pixel_ratio,
        },
        "assets": {
            "product": {"href": product_path, "type": "image/tiff; application=geotiff"},
        },
        "geometry": None,
        "bbox": list(rasterio.transform.array_bounds(*[1, 1], transform=transform)),
        "crs": crs,
    }


# ── 4. Output Packaging ─────────────────────────────────────────────────────
def package_product(arr: np.ndarray, profile: dict, out_dir: str) -> str:
    """Write the product as a single-band float32 GeoTIFF."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    profile = {**profile, "dtype": "float32", "count": 1, "compress": "deflate"}
    out_path = out / "application_product.tif"
    with rasterio.open(out_path, "w", **profile) as dst:
        dst.write(arr, 1)
    return str(out_path)


def write_metadata(metadata: dict, out_dir: str, filename: str = "product_metadata.json") -> str:
    out_path = Path(out_dir) / filename
    out_path.write_text(json.dumps(metadata, indent=2))
    return str(out_path)


def write_quality_report(qa: QualityReport, out_dir: str) -> str:
    out_path = Path(out_dir) / "quality_report.json"
    out_path.write_text(json.dumps(asdict(qa), indent=2))
    return str(out_path)


# ── Pipeline orchestrator ───────────────────────────────────────────────────
def run_l3_application(
    sigma0_path: str, incidence_path: str, mask_path: str,
    customer_id: str, out_dir: str,
) -> Dict[str, str]:
    with rasterio.open(sigma0_path) as src:
        sigma0_db = src.read(1).astype(np.float32)
        profile = src.profile
        transform = src.transform
        crs = src.crs.to_string()
    with rasterio.open(incidence_path) as src:
        incidence = src.read(1).astype(np.float32)
    with rasterio.open(mask_path) as src:
        mask = src.read(1)

    product = generate_application_product(sigma0_db, incidence, mask)
    qa = validate_product(product, mask)
    product_tif = package_product(product, profile, out_dir)
    metadata = annotate_metadata(product_tif, customer_id, qa, transform, crs)
    metadata_path = write_metadata(metadata, out_dir)
    qa_path = write_quality_report(qa, out_dir)

    return {
        "application_product": product_tif,
        "product_metadata": metadata_path,
        "quality_report": qa_path,
        "qa_passed": str(qa.passed),
    }


__all__ = [
    "annotate_metadata",
    "compute_index",
    "generate_application_product",
    "package_product",
    "run_l3_application",
    "validate_product",
    "write_metadata",
    "write_quality_report",
]
`;

export const NODE_CODE_DEFAULTS_BY_STAGE: Partial<Record<SarStage, NodeCodeDefault>> = {
  L0: {
    code: L0_LEVEL_0_PROCESSING,
    language: 'python',
    filename: 'csc_03_level_0_processing.py',
  },
  L1A: {
    code: L1A_RANGE_COMPRESSION,
    language: 'python',
    filename: 'csu_04_01_range_compression.py',
  },
  L1B: {
    code: L1B_MULTILOOK_GRD,
    language: 'python',
    filename: 'csc_04_l1b_multilook_grd.py',
  },
  L1C: {
    code: L1C_GEOMETRIC_TERRAIN_CORRECTION,
    language: 'python',
    filename: 'csc_04_l1c_geometric_terrain_correction.py',
  },
  L2A: {
    code: L2A_MAP_PRODUCTS,
    language: 'python',
    filename: 'csu_05_01_map_products.py',
  },
  L2B: {
    code: L2B_SCENE_ANALYSIS,
    language: 'python',
    filename: 'csu_05_02_scene_analysis.py',
  },
  L3: {
    code: L3_APPLICATION_PRODUCT,
    language: 'python',
    filename: 'csu_06_01_application_product.py',
  },
};

export function getDefaultCode(stage: SarStage | undefined): NodeCodeDefault | null {
  if (!stage) return null;
  return NODE_CODE_DEFAULTS_BY_STAGE[stage] ?? null;
}

/**
 * Task name → 코드에서 그 task가 "활성"인지 판단할 키워드 목록.
 * 비주석 코드 라인에 키워드가 하나라도 포함되어 있으면 task가 활성으로 간주된다.
 * 사용자가 # 주석 처리하면 그 라인은 무시되어 task가 비활성으로 표시된다.
 */
export const TASK_KEYWORDS_BY_STAGE: Partial<Record<SarStage, Record<string, string[]>>> = {
  L0: {
    'De-packetizer':              ['depacketize', 'ccsds', 'cadu', 'source_packet', 'sourcepacket', 'de-packet'],
    'BAQ De-compression':         ['baq_decompress', 'baq', 'bits_per_sample', 'fi01'],
    'Range Line Reconstructor':   ['reconstruct_range_lines', 'range_line', 'time_order_pulses', 'range line'],
    'Auxiliary Data Extractor':   ['extract_aux_data', 'aux_data', 'auxiliary', 'aggregate_metadata', 'aux_header'],
    'Calibration':                ['calibrat', 'apply_cal', 'load_calibration', 'gain_db', 'phase_deg'],
    'HDF5 Converter':             ['convert_to_hdf5', 'h5py', 'h5.create', 'hdf5'],
  },
  L1A: {
    'Range Compression': ['range_compress', 'range compression'],
    'Azimuth Compression': ['azimuth_compress', 'azimuth compression'],
    'Autofocusing': ['autofocus', 'autofocusing'],
    'Multi-mode Support': ['multi_mode', 'multimode', 'multi-mode'],
    'SLC Product': ['slc', 'sarprocessor', 'slc product'],
  },
  L1B: {
    'Multi-look Processing':   ['multilook', 'multi_look', 'multi-look'],
    'Speckle Filtering':       ['speckle', 'lee_filter', 'frost_filter', 'apply_speckle_filter'],
    'Ground-range Projection': ['ground_range', 'gr_projection', 'ground-range', 'project_to_ground'],
    'Amplitude/phase Product': ['compute_amplitude', 'compute_phase', 'amplitude', 'np.angle'],
  },
  L1C: {
    'DEM Integration':              ['dem', 'digital_elevation', 'srtm', 'dted', 'load_dem', 'reproject_dem'],
    'Geometric Correction':         ['gec_geocode', 'slant_to_ground', 'geocoding', 'geocode', 'gec_processor', 'ellipsoid_corrected'],
    'Geometric Terrain Correction': ['gtc', 'geometric_terrain', 'terrain_correction', 'orthorectif'],
    'Map Projection':               ['map_projection', 'reproject_to_map', 'reproject_to_utm', 'dst_crs'],
  },
  L2A: {
    'Incidence Angle Map': ['incidence_angle', 'incidence'],
    'NESZ Map': ['nesz'],
    'Number-of-looks Map': ['nlooks', 'number_of_looks', 'compute_nlooks'],
    'Layover and Shadow Masks': ['layover', 'shadow'],
  },
  L2B: {
    'Incidence Angle Map': ['incidence_angle', 'incidence'],
    'Shadow Mask': ['shadow_mask', 'shadow'],
    'Layover Mask': ['layover_mask', 'layover'],
    'Co-registration': ['coregister', 'co_register', 'coregistration', 'align_to_reference'],
    'Object Detection': ['cfar', 'vectorize_detections', 'object_detection'],
    'Change Detection': ['change_detection', 'change_ratio', 'segment_scene'],
  },
  L3: {
    'Application Product Generation': ['application_product', 'generate_product', 'compute_index', 'ndi', 'vegetation', 'flood', 'urban'],
    'Quality Validation': ['quality_check', 'validate_product', 'qa_metrics', 'validation'],
    'Customer Metadata Annotation': ['customer_metadata', 'annotate_metadata', 'product_metadata', 'stac'],
    'Output Packaging': ['package_product', 'write_geotiff', 'output_zip', 'package_outputs'],
  },
};

/** Python `"""..."""` / `'''...'''` 블록 도큐스트링을 모두 빈 문자열로 치환한다. */
function stripPythonDocstrings(code: string): string {
  return code
    .replace(/"""[\s\S]*?"""/g, '')
    .replace(/'''[\s\S]*?'''/g, '');
}

/** `#` 주석 라인만 모아 한 문자열로 (task 이름 어노테이션 검사용). */
function collectHashComments(code: string): string {
  const noDocs = stripPythonDocstrings(code);
  const out: string[] = [];
  for (const line of noDocs.split('\n')) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('#')) {
      out.push(trimmed.slice(1));
      continue;
    }
    const hashIdx = line.indexOf('#');
    if (hashIdx >= 0) {
      const before = line.slice(0, hashIdx);
      const sq = (before.match(/'/g) ?? []).length;
      const dq = (before.match(/"/g) ?? []).length;
      if (sq % 2 === 0 && dq % 2 === 0) {
        out.push(line.slice(hashIdx + 1));
      }
    }
  }
  return out.join('\n').toLowerCase();
}

/** 도큐스트링과 `#` 주석을 모두 제거한 "실제 코드 본문"만 남긴다. */
function stripPythonCommentsAndDocstrings(code: string): string {
  const noDocs = stripPythonDocstrings(code);
  return noDocs
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('#')) return '';
      const hashIdx = line.indexOf('#');
      if (hashIdx >= 0) {
        const before = line.slice(0, hashIdx);
        const sq = (before.match(/'/g) ?? []).length;
        const dq = (before.match(/"/g) ?? []).length;
        if (sq % 2 === 0 && dq % 2 === 0) return before;
      }
      return line;
    })
    .join('\n')
    .toLowerCase();
}

/**
 * task 활성 여부 판단:
 *   1) `#` 주석 라인에 task 이름이 적혀 있으면 활성 — 예: `# DEM Integration` 한 줄이면 그 task가 명시적으로 켜진다.
 *      (도큐스트링 `"""…"""` 안의 언급은 활성 신호로 보지 않음 — 모듈 설명일 뿐)
 *   2) 또는 비-주석/비-도큐스트링 본문에서 task 키워드(예: `dem`)가 등장하면 활성 — 실제 구현 신호.
 *   둘 다 아니면 비활성.
 */
export function isTaskActiveInCode(code: string, taskName: string, keywords: string[]): boolean {
  if (!code) return false;
  // 1) `#` 주석 라인에 명시적 task 이름 어노테이션
  const hashComments = collectHashComments(code);
  if (hashComments.includes(taskName.toLowerCase())) return true;
  // 2) 실제 코드 본문에서 키워드 매칭 (도큐스트링/주석 모두 제외)
  const body = stripPythonCommentsAndDocstrings(code);
  return keywords.some((kw) => body.includes(kw.toLowerCase()));
}
