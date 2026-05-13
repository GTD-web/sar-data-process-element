import type { SarStage } from '@/types/pipeline';

export type LogLevel = 'info' | 'ok' | 'warn' | 'error' | 'debug';

export interface LogLine {
  /** 이 라인이 표시될 때까지 직전 라인 출력 후 대기 시간(ms) */
  delayMs: number;
  level: LogLevel;
  text: string;
}

const L0: LogLine[] = [
  { delayMs: 0,    level: 'info',  text: 'csu-03-01 starting raw → L0 formatter' },
  { delayMs: 220,  level: 'info',  text: 'opening /nas/sdpe/raw/LX2_STRIP_20260420.dat (2.0 GB)' },
  { delayMs: 380,  level: 'info',  text: 'parsing CADU/VCDU headers (struct fmt: <IIddffffff)' },
  { delayMs: 520,  level: 'info',  text: 'parsed 8192 frames · header schema v1.0' },
  { delayMs: 280,  level: 'info',  text: 'time-ordering pulses by satellite UTC …' },
  { delayMs: 460,  level: 'info',  text: 'sorted 8192 pulses (dropped 4 PRF-jitter duplicates)' },
  { delayMs: 220,  level: 'info',  text: 'loading calibration table /nas/sdpe/cal/LX2_2026Q1.csv' },
  { delayMs: 180,  level: 'debug', text: 'channel VV: gain=-3.50 dB · phase=+2.10° · noise_floor=-26.0 dB' },
  { delayMs: 320,  level: 'info',  text: 'applying calibration to (8192, 16384, 2) int16 cube' },
  { delayMs: 540,  level: 'info',  text: 'writing /nas/sdpe/l0/LX2_STRIP_20260420_L0.h5 (gzip-4)' },
  { delayMs: 320,  level: 'ok',    text: 'L0 produced — 8192 az × 16384 rg · 1.4 GB · 42.3s' },
];

const L1A: LogLine[] = [
  { delayMs: 0,    level: 'info',  text: 'csu-04-04 SARProcessor.run()  workers=4  rng_chunk=512' },
  { delayMs: 220,  level: 'info',  text: 'opening /nas/sdpe/l0/LX2_STRIP_20260420_L0.h5' },
  { delayMs: 220,  level: 'info',  text: 'loaded metadata · PRF=2280 Hz · fc=9.65 GHz · Vr=7585 m/s' },
  { delayMs: 200,  level: 'info',  text: 'building block schedule · na_block=1820 · step=1000 · n_blocks=12' },
  { delayMs: 280,  level: 'info',  text: '[1/12] az 0-1820 · range_compress (Nfft=109760) …' },
  { delayMs: 420,  level: 'debug', text: '[1/12] fdc=+18.4 Hz · rcmc strips=4 · az_compress chunks=12' },
  { delayMs: 240,  level: 'ok',    text: '[1/12] block focused · 9.8s · written=1000' },
  { delayMs: 260,  level: 'info',  text: '[2/12] az 1000-2820 · range_compress …' },
  { delayMs: 360,  level: 'ok',    text: '[2/12] focused · fdc=+19.1 Hz · 9.4s · written=2000' },
  { delayMs: 320,  level: 'info',  text: '[3/12] … skipping detail logs (workers running in parallel)' },
  { delayMs: 380,  level: 'ok',    text: '[6/12] focused · fdc=+18.7 Hz · 9.5s · written=5000' },
  { delayMs: 360,  level: 'ok',    text: '[12/12] focused · fdc=+18.0 Hz · 8.9s · written=12000' },
  { delayMs: 240,  level: 'info',  text: 'closing GeoTIFF strip writer · finalizing IFD' },
  { delayMs: 220,  level: 'info',  text: 'writing quicklook from SLC (vmin=-60 vmax=-5 dB)' },
  { delayMs: 280,  level: 'ok',    text: 'L1A SLC produced — 12000 az × 8192 rg complex64 · 6m 22s' },
];

const L1B: LogLine[] = [
  { delayMs: 0,    level: 'info',  text: 'csu-04-05 multi-look processor starting' },
  { delayMs: 220,  level: 'info',  text: 'reading SLC /nas/sdpe/l1a/LX2_STRIP_20260420_SLC.tif' },
  { delayMs: 220,  level: 'info',  text: 'multi-look config · az_looks=4 · rg_looks=2' },
  { delayMs: 280,  level: 'info',  text: 'computing |SLC|² in 512-row strips' },
  { delayMs: 380,  level: 'info',  text: 'strip 1/24 · mean=-12.4 dB · std=4.8 dB' },
  { delayMs: 240,  level: 'debug', text: 'applying boxcar 4×2 averaging · then sqrt → amplitude' },
  { delayMs: 360,  level: 'info',  text: 'strip 12/24 · speckle filter (Lee 5×5) applied' },
  { delayMs: 360,  level: 'ok',    text: 'strip 24/24 · multi-look complete' },
  { delayMs: 240,  level: 'info',  text: 'projecting to ground range geometry' },
  { delayMs: 280,  level: 'info',  text: 'writing /nas/sdpe/l1b/LX2_STRIP_20260420_GRD.tif' },
  { delayMs: 240,  level: 'ok',    text: 'L1B GRD produced — 3000 az × 4096 rg float32 · 1m 58s' },
];

const L1C: LogLine[] = [
  { delayMs: 0,    level: 'info',  text: 'csu-04-06 terrain correction pipeline' },
  { delayMs: 220,  level: 'info',  text: 'reading L1B GRD /nas/sdpe/l1b/LX2_STRIP_20260420_GRD.tif' },
  { delayMs: 220,  level: 'info',  text: 'fetching DEM tile · SRTM-30m · bbox=(127.1,36.4,127.6,36.7)' },
  { delayMs: 360,  level: 'info',  text: 'reprojecting DEM to image grid (bilinear)' },
  { delayMs: 320,  level: 'info',  text: 'computing local incidence angle and slope' },
  { delayMs: 280,  level: 'info',  text: 'computing layover/shadow mask' },
  { delayMs: 280,  level: 'warn',  text: 'layover detected on 2.1% of pixels (mountain range, west edge)' },
  { delayMs: 320,  level: 'info',  text: 'applying geometric terrain correction (GTC)' },
  { delayMs: 360,  level: 'info',  text: 'reprojecting to EPSG:32652 (UTM zone 52N)' },
  { delayMs: 280,  level: 'info',  text: 'writing /nas/sdpe/l1c/LX2_STRIP_20260420_GTC.tif' },
  { delayMs: 240,  level: 'ok',    text: 'L1C GTC produced — UTM 52N · 10m pixel · 3m 33s' },
];

const L2A: LogLine[] = [
  { delayMs: 0,    level: 'info',  text: 'csu-05-01 L2A map-product generator' },
  { delayMs: 220,  level: 'info',  text: 'loading L1C sigma0 + DEM + orbit npz' },
  { delayMs: 280,  level: 'info',  text: 'computing terrain normals (Sobel 3×3)' },
  { delayMs: 320,  level: 'info',  text: 'computing per-pixel incidence angle …' },
  { delayMs: 280,  level: 'ok',    text: 'incidence_angle.tif written (mean=37.4°)' },
  { delayMs: 220,  level: 'info',  text: 'computing NESZ (calib=-3.5 dB · noise_floor=-26.0 dB)' },
  { delayMs: 240,  level: 'ok',    text: 'nesz.tif written (mean=-21.8 dB)' },
  { delayMs: 200,  level: 'info',  text: 'computing nlooks map (boxcar fftconvolve)' },
  { delayMs: 240,  level: 'ok',    text: 'nlooks.tif written' },
  { delayMs: 220,  level: 'info',  text: 'computing layover/shadow mask' },
  { delayMs: 240,  level: 'ok',    text: 'layover_shadow.tif written (uint8, 4.7% non-zero)' },
  { delayMs: 220,  level: 'ok',    text: 'L2A maps produced — 4 layers · 1m 37s' },
];

const L2B: LogLine[] = [
  { delayMs: 0,    level: 'info',  text: 'csu-05-02 L2B scene analysis' },
  { delayMs: 220,  level: 'info',  text: 'segmenting scene (MiniBatchKMeans k=3)' },
  { delayMs: 360,  level: 'info',  text: 'cluster centers · darkest=water · brightest=urban' },
  { delayMs: 280,  level: 'info',  text: 'morphological opening on water mask (iter=2)' },
  { delayMs: 240,  level: 'ok',    text: 'MSK.tif written · water=18.3% · land=72.0% · urban=9.7%' },
  { delayMs: 240,  level: 'info',  text: 'CFAR detection · ref=31×31 · guard=3×3 · pfa=1e-6' },
  { delayMs: 380,  level: 'info',  text: 'connected-component labeling on detection mask' },
  { delayMs: 280,  level: 'info',  text: 'filtered 14 candidates < 60 m² minimum area' },
  { delayMs: 220,  level: 'ok',    text: 'OBJ.geojson written · 12 detections retained' },
  { delayMs: 220,  level: 'info',  text: 'computing change ratio vs reference acquisition' },
  { delayMs: 280,  level: 'info',  text: 'bias correction using stable land pixels (Δ=+0.42 dB)' },
  { delayMs: 240,  level: 'ok',    text: 'CHG.tif written · mean Δσ⁰=+0.03 dB · std=1.84 dB' },
  { delayMs: 220,  level: 'ok',    text: 'L2B scene analysis complete · 2m 57s' },
];

const L3: LogLine[] = [
  { delayMs: 0,    level: 'info',  text: 'csu-06-01 L3 application product · customer=GTD' },
  { delayMs: 220,  level: 'info',  text: 'loading L1C sigma0 + L2A incidence + L2B mask' },
  { delayMs: 320,  level: 'info',  text: 'computing NDI-style index (mean_land=-13.2 dB)' },
  { delayMs: 280,  level: 'info',  text: 'applying incidence-angle correction (cos θ)' },
  { delayMs: 280,  level: 'info',  text: 'running quality validation (NaN ratio, std, valid pixels)' },
  { delayMs: 240,  level: 'ok',    text: 'qa.passed=true · valid_pixel_ratio=72.0% · std=0.31' },
  { delayMs: 240,  level: 'info',  text: 'annotating STAC metadata (customer_id=GTD · stac=1.0.0)' },
  { delayMs: 240,  level: 'info',  text: 'writing application_product.tif (deflate)' },
  { delayMs: 200,  level: 'ok',    text: 'product_metadata.json written' },
  { delayMs: 200,  level: 'ok',    text: 'quality_report.json written' },
  { delayMs: 220,  level: 'ok',    text: 'L3 application product complete · 58s' },
];

const SCRIPTS: Partial<Record<SarStage, LogLine[]>> = {
  L0, L1A, L1B, L1C, L2A, L2B, L3,
};

/** SAR stage 별 mock 실행 로그 시퀀스를 돌려준다. 정의되지 않은 stage는 빈 배열. */
export function getStageLogScript(stage: SarStage | undefined): LogLine[] {
  if (!stage) return [];
  return SCRIPTS[stage] ?? [];
}
