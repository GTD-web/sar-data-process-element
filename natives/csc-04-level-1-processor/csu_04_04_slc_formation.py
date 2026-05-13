"""CSU-04.04 SLC formation and block orchestration.

Preserved from the original V4 processor:

Block layout (sliding-window overlap-add, identical to reference code)
----------------------------------------------------------------------
  na_syn   = PRF x beamwidth_rad x R_far / Vr_eff   (aperture at far range)
  overlap  = na_syn                                 (full aperture each side)
  step     = na_valid  (default = 1000, user-overridable via --step)
  na_block = overlap + step

  Each block reads na_block raw lines with no zero-padding.
  The last block is slid back so az1 == na_total.
  The entire focused block is written to the accumulator weighted by a Tukey
  window (alpha=1.0, Hann-like), then normalized by the accumulated weights.

Per azimuth block:
  1. Read HDF5 raw lines -> transpose to (Nrg, Naz)
  2. Optional range decimation
  3. CSU-04.01 range compression
  4. Doppler centroid estimate and deramping
  5. RCMC
  6. Azimuth compression
  7. Overlap-add into the output SLC
"""

import math
import os
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from scipy.signal import resample_poly
from scipy.signal.windows import tukey

from csu_04_01_range_compression import range_compress
from csu_04_02_rda_azimuth import (
    azimuth_compress,
    estimate_fdc_profile,
    rcmc_time_domain,
    remove_time_varying_fdc,
)
from shared.io import _TiffStripWriter, _write_quicklook_from_slc, write_metadata_xml
from shared.metadata import HAS_H5PY, Meta, Re, h5py, load_metadata, log


# ════════════════════════════════════════════════════════════════════════════
# 7.  Block schedule
# ════════════════════════════════════════════════════════════════════════════
def _build_block_schedule(na_total: int, na_block: int, step: int) -> List[dict]:
    """Build the same sliding-window schedule used by the original V4 processor."""
    n_runs = math.ceil((na_total - na_block) / step) + 1
    blocks = []
    for k in range(n_runs):
        az0 = k * step
        az1 = az0 + na_block
        if az1 > na_total:
            az0 = max(0, na_total - na_block)
            az1 = na_total
        blocks.append(dict(block_idx=k, az0=az0, az1=az1))
        if az1 >= na_total:
            break
    return blocks


# ════════════════════════════════════════════════════════════════════════════
# 8.  Block worker  (module-level for multiprocessing pickling)
# ════════════════════════════════════════════════════════════════════════════
def _process_block(args: dict) -> Tuple[int, int, np.ndarray, float]:
    """Process one azimuth block and return focused complex data plus mean FDC."""
    h5_path = args["h5_path"]
    az0 = args["az0"]
    az1 = args["az1"]
    # Offset into raw H5 so block-local [az0, az1) (relative to subset)
    # maps to absolute [az_offset+az0, az_offset+az1) on disk.
    az_offset = args.get("az_offset", 0)
    nr_dec = args["nr_dec"]
    prf = args["prf"]
    r_near = args["r_near"]
    dr_dec = args["dr_dec"]
    fs_dec = args["fs_dec"]
    wavelength = args["wavelength"]
    vr_eff = args["Vr_eff"]
    ht = args["platform_height"]
    v_mag = args["v_mag"]
    decimate_range = args["decimate_range"]
    replica_dec = args["replica_dec"]
    smooth_len = args["smooth_len"]
    rng_chunk = args["rng_chunk"]

    # ── 1. Read raw HDF5 block ────────────────────────────────────────────────
    with h5py.File(h5_path, "r") as f:
        chunk = f["ST0/Raw data"][az_offset + az0 : az_offset + az1, :, :]  # (na_actual, nr, 2)

    na_actual = chunk.shape[0]                         # = az1 - az0
    s = chunk[:, :, 0].astype(np.float32) + 1j * chunk[:, :, 1].astype(np.float32)
    del chunk
    s = s.T                                            # (nr, na_actual) = (Nrg, Naz)

    # ── 2. Range decimation ───────────────────────────────────────────────────
    if decimate_range > 1:
        s = resample_poly(s, up=1, down=decimate_range, axis=0).astype(np.complex64)
    # s: (nr_dec, na_actual)

    # ── 3. Range compression  (linear convolution) ────────────────────────────
    rc = range_compress(s, replica_dec, az_batch=args["az_batch"])  # (nr_dec, na_actual)
    del s

    # ── 4. Block-local effective velocity ─────────────────────────────────────
    v_block = float(np.mean(v_mag[az0:az1])) if na_actual > 0 else vr_eff
    vr = v_block * np.sqrt(Re / (Re + ht))

    # ── 5. Doppler centroid profile (per-line) ────────────────────────────────
    fdc_profile = estimate_fdc_profile(rc, prf, smooth_len=smooth_len)

    # ── 6. Time-varying deramping ─────────────────────────────────────────────
    rc_deramp, fdc_mean = remove_time_varying_fdc(rc, fdc_profile, prf)
    del rc

    # ── 7. RCMC (time-domain, per azimuth column) ─────────────────────────────
    sr = r_near + np.arange(nr_dec) * dr_dec           # (nr_dec,) [m]
    rc_rcmc = rcmc_time_domain(rc_deramp, sr, vr, fs_dec, prf)
    del rc_deramp

    # ── 8. Azimuth compression ────────────────────────────────────────────────
    focused = azimuth_compress(rc_rcmc, prf, vr, wavelength, sr, rng_chunk=rng_chunk)
    del rc_rcmc
    return args["block_idx"], az0, focused, fdc_mean


# ════════════════════════════════════════════════════════════════════════════
# 9.  SAR Processor  (orchestration + sliding-window overlap-add)
# ════════════════════════════════════════════════════════════════════════════
class SARProcessor:
    def __init__(
        self,
        h5_path: str,
        output_dir: str,
        workers: int = 1,
        decimate_range: int = 1,
        valid_lines: Optional[int] = None,
        na_block_override: Optional[int] = None,
        na_overlap_override: Optional[int] = None,
        rng_chunk: int = 512,
        az_batch: int = 64,
        vmin_db: float = -60.0,
        vmax_db: float = -5.0,
        az_start: Optional[int] = None,
        az_stop: Optional[int] = None,
        reporter: Optional[object] = None,
    ):
        self.workers = workers
        self.rng_chunk = rng_chunk
        self.az_batch = az_batch
        self.vmin_db = vmin_db
        self.vmax_db = vmax_db
        self.out_dir = Path(output_dir)
        os.makedirs(self.out_dir, exist_ok=True)
        # 시연 modal 의 staged-progress UI 용. None 이면 평소대로 평이한 로그만.
        self.reporter = reporter

        self.meta = load_metadata(
            h5_path,
            decimate_range=decimate_range,
            valid_lines=valid_lines,
            na_block_override=na_block_override,
            na_overlap_override=na_overlap_override,
            az_start=az_start,
            az_stop=az_stop,
        )
        m = self.meta
        self.schedule = _build_block_schedule(m.na_total, m.na_block, m.na_valid)
        log.info("Schedule: %d blocks  na_overlap=%d  step=%d  na_block=%d", len(self.schedule), m.na_overlap, m.na_valid, m.na_block)

    def run(self) -> dict:
        m = self.meta
        out_slc = self.out_dir / "SLC_complex_w10dec16.tif"
        out_ql = self.out_dir / "QuickLook.png"
        out_xml = self.out_dir / "SLC_metadata_w10dec16.xml"

        n_blk = len(self.schedule)
        alpha = 1 #2.0 * m.na_overlap / m.na_block
        win = tukey(m.na_block, alpha=min(alpha, 1.5)).astype(np.float32)
        #win = np.ones(m.na_block, dtype=np.float32)
        t0 = time.time()
        fdc_log: Dict[int, float] = {}

        # ── Rolling accumulation buffer ───────────────────────────────────────
        # buf[i] corresponds to az index (buf_az0 + i).
        # Invariant maintained after every flush: buf_az0 == written_ptr.
        buf = np.zeros((m.na_block, m.nr_dec, 2), dtype=np.float32)
        wt = np.zeros(m.na_block, dtype=np.float32)
        buf_az0 = 0    # az index of buf[0]
        written = 0    # next az line to write to the output file
        gb_buf = m.na_block * m.nr_dec * 2 * 4 / 1e9
        log.info("Rolling buffer: %.2f GB  (%d az x %d rg x 2 bands)", gb_buf, m.na_block, m.nr_dec)

        # ── Worker base args ──────────────────────────────────────────────────
        base = dict(
            h5_path=m.h5_path,
            az_offset=m.az_offset,
            nr=m.nr,
            nr_dec=m.nr_dec,
            prf=m.prf,
            r_near=m.r_near,
            dr_dec=m.dr_dec,
            fs_dec=m.fs_dec,
            wavelength=m.wavelength,
            Vr_eff=m.Vr_eff,
            platform_height=m.platform_height,
            v_mag=m.v_mag,
            decimate_range=m.decimate_range,
            replica_dec=m.replica_dec,
            smooth_len=101,
            rng_chunk=self.rng_chunk,
            az_batch=self.az_batch,
        )

        # ── Open output TIFF for incremental strip writing ────────────────────
        log.info("Opening output GeoTIFF for incremental writing…")
        tif_writer = _TiffStripWriter(str(out_slc), m.na_total, m.nr_dec, m.dr_dec, m.prf)

        # ─────────────────────────────────────────────────────────────────────
        def _accumulate_and_flush(k: int, az0: int, focused: np.ndarray, fdc: float) -> None:
            nonlocal buf_az0, written
            fdc_log[k] = fdc
            na_actual = focused.shape[1]
            # 1. Weighted accumulation into rolling buffer
            lo = az0 - buf_az0
            w = win[:na_actual]
            slab = focused.T.astype(np.complex64)   # (na_actual, nr_dec)
            buf[lo : lo + na_actual, :, 0] += slab.real * w[:, np.newaxis]
            buf[lo : lo + na_actual, :, 1] += slab.imag * w[:, np.newaxis]
            wt[lo : lo + na_actual] += w

            # 2. Flush boundary: lines before the next block's start are final
            flush_end = min(self.schedule[k + 1]["az0"], m.na_total) if k + 1 < n_blk else m.na_total
            if flush_end <= written:
                return                     # nothing new to flush this round

            n_flush = flush_end - written
            lo_f = written - buf_az0    # == 0 by invariant
            # 3. Normalize and write the strip
            slab_f = buf[lo_f : lo_f + n_flush].copy()
            safe_wt = np.maximum(wt[lo_f : lo_f + n_flush], 1e-6)
            slab_f /= safe_wt[:, np.newaxis, np.newaxis]
            tif_writer.write_strip(slab_f, written)

            # 4. Compact buffer: shift left by n_flush, zero the vacated tail
            remain = m.na_block - n_flush
            if remain > 0:
                buf[:remain] = buf[n_flush : m.na_block].copy()
                wt[:remain] = wt[n_flush:m.na_block].copy()
            buf[remain:] = 0.0
            wt[remain:] = 0.0
            buf_az0 = flush_end
            written = flush_end

            done = k + 1
            eta = (time.time() - t0) / done * (n_blk - done) if done < n_blk else 0
            log.info("[%d/%d]  az %d-%d  fdc=%.1f Hz  written=%d  ETA %.0fs", done, n_blk, az0, az0 + na_actual, fdc, written, eta)

            # Staged-progress UI 갱신 — 10% milestone 마다만 (또는 마지막 block).
            if self.reporter is not None:
                pct_now = int(done * 100 / n_blk) if n_blk > 0 else 0
                last = getattr(self, "_last_progress_pct", -1)
                if pct_now >= last + 10 or done == n_blk:
                    self.reporter.progress(
                        pct_now,
                        label="Azimuth block focusing",
                        done=done,
                        total=n_blk,
                    )
                    self._last_progress_pct = pct_now

        # 시연 — block 처리 진입.
        if self.reporter is not None:
            self.reporter.start_stage(2)
            self._last_progress_pct = -1

        # ── Block dispatch ────────────────────────────────────────────────────
        if self.workers == 1:
            for k, blk in enumerate(self.schedule):
                _, az0, focused, fdc = _process_block({**base, **blk})
                _accumulate_and_flush(k, az0, focused, fdc)
        else:
            # Submit all blocks; drain results in ascending schedule order so
            # the rolling-buffer invariant (buf_az0 advances monotonically)
            # is never violated.
            pending: Dict[int, tuple] = {}
            next_k = 0

            with ProcessPoolExecutor(max_workers=self.workers) as pool:
                futures = {pool.submit(_process_block, {**base, **blk}): blk["block_idx"] for blk in self.schedule}
                for fut in as_completed(futures):
                    bidx, az0, focused, fdc = fut.result()
                    pending[bidx] = (az0, focused, fdc)
                    # Drain as many consecutive results as are ready
                    while next_k in pending:
                        az0_p, foc_p, fdc_p = pending.pop(next_k)
                        _accumulate_and_flush(next_k, az0_p, foc_p, fdc_p)
                        next_k += 1

        if self.reporter is not None:
            self.reporter.complete_stage(2)
            self.reporter.start_stage(3)

        tif_writer.close()
        log.info("All blocks written — total time: %.1f s", time.time() - t0)

        fdc_mean = float(np.mean(list(fdc_log.values()))) if fdc_log else 0.0
        write_metadata_xml(m, fdc_mean, fdc_log, n_blk, str(out_xml))

        if self.reporter is not None:
            self.reporter.complete_stage(3)
            self.reporter.start_stage(4)

        # ── Quicklook (two-pass strip reader, no full image in RAM) ──────────
        ql_written = _write_quicklook_from_slc(str(out_slc), str(out_ql), vmin_db=self.vmin_db, vmax_db=self.vmax_db)
        log.info("Done → %s", self.out_dir)

        if self.reporter is not None:
            self.reporter.complete_stage(4)

        result = {"slc": str(out_slc), "xml": str(out_xml)}
        if ql_written:
            result["quicklook"] = str(out_ql)
        return result


__all__ = ["SARProcessor", "_build_block_schedule", "_process_block", "load_metadata", "Meta", "HAS_H5PY"]
