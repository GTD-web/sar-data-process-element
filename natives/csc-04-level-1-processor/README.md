# CSC-04 Level-1 Processor

ICD §5 / §7 의 **CSC-04 (SAR Processing Subsystem 소속, Level-1 Processor)** 를
구현하는 Python 패키지. Level-0 HDF5 raw → Level-1 SLC / GRD / GEC / MAP 으로
이어지는 SAR 영상 처리 파이프라인을 단계별 모듈(CSU) 로 분리해 둔다.

전체 ICD 매핑은 [`../../interfaces/csc-4/README.md`](../../interfaces/csc-4/README.md)
의 CSU 목록을 참조한다.

---

## 디렉터리 구성

```
csc-04-level-1-processor/
│
├── README.md                          # (이 문서) 패키지 전체 지도
├── main.py                            # CLI 진입점 — RDA SLC 처리 (CSU-04.01/02/04)
│
├── csu_04_01_range_compression.py     # CSU-04.01 Range Compression
├── csu_04_02_rda_azimuth.py           # CSU-04.02 RDA Azimuth Compression
├── csu_04_04_slc_formation.py         # CSU-04.04 SLC Formation (V4 분할본)
├── csu_04_05_multilook.py             # CSU-04.05 Multi-look Processor
├── csu_04_05_speckle_filter.py        # CSU-04.05 sub-step: speckle 필터
│
├── shared/                            # 공유 인프라
│   ├── metadata.py                    #   Meta dataclass + load_metadata()
│   └── io.py                          #   GeoTIFF / XML / QuickLook 라이터
│
├── raw/                               # 모놀리식 레퍼런스 구현 (회귀 baseline)
│   ├── sar_rda_processorV4.py         #   V4 단일 파일 — CSU 분할의 기준선
│   └── sar_rda_processorV7_numba.py   #   V7 — V4 의 Numba 가속본 (RCMC, accumulate)
│
├── tests/                             # 단위 + H5 통합 + smoke 테스트
│   ├── test_csu04.py                  #   CSU-04.01/02/04 단위
│   ├── test_csu04_h5.py               #   실제 H5 메타/_process_block 일치 + 소형 SLC→ML→필터 smoke
│   ├── test_csu04_05_multilook.py     #   CSU-04.05 단위
│   └── test_csu04_05_speckle.py       #   speckle 필터 단위
│
├── verifications/                     # V4 ↔ 외부 GUI 처리기 비교 도구 + 보고서
│   └── README.md                      #   비교 모드 정의, 정량 지표, 재현 방법
│
├── docs/                              # 패키지 설계 / 회귀 검증 보고서
│   ├── README.md                      #   docs 내용 가이드
│   ├── refactoring.md                 #   V4 → CSU 분할 설계 문서
│   ├── subset-validation-report.{md,json}   # V4 ↔ 분할본 회귀 보고서
│   └── v7-validation-report.{md,json}       # V4 ↔ V7 Numba 회귀 보고서
│
├── validate_subset_equivalence.py     # V4 모놀리식 ↔ 분할본 회귀 CLI
└── validate_v7_equivalence.py         # V4 ↔ V7 Numba 회귀 CLI
```

---

## CSU 매핑

ICD 의 CSU 목록 (`interfaces/csc-4/README.md` §CSU 개요) 과 본 패키지의 구현
대응. **굵은 글씨** 가 본 저장소에 Python 모듈로 존재.

| ICD CSU | 명칭 | 본 패키지 |
| --- | --- | --- |
| **CSU-04.01** | Range Compression | `csu_04_01_range_compression.py` |
| **CSU-04.02** | RDA Azimuth Compression | `csu_04_02_rda_azimuth.py` |
| CSU-04.03 | BPA Azimuth Compression | (TBD — Spotlight 전용) |
| **CSU-04.04** | SLC Formation | `csu_04_04_slc_formation.py` (V4 분할), `raw/sar_rda_processorV7_numba.py` (V7 가속) |
| **CSU-04.05** | Multi-look Processor | `csu_04_05_multilook.py` |
| (sub-step) | Speckle Filtering | `csu_04_05_speckle_filter.py` |
| CSU-04.06 | GRD Converter | (TBD) |
| CSU-04.07 | GEC Processor | (TBD) |
| CSU-04.08 | MAP Projector | (TBD) |
| CSU-04.09 | DEM Integration | (TBD) |
| CSU-04.10 | Geometric Terrain Correction | (TBD) |
| CSU-04.11 | Map Projection | (TBD) |
| CSU-04.12 | Geocoded, Map Projected Product | (TBD) |

---

## 빠른 사용법

### 1. SLC 생성 (CSU-04.01/02/04)

```bash
python main.py --input /path/to/raw.h5 --output ./out
# → out/SLC_complex.tif + SLC_metadata.xml + QuickLook.png
```

`--workers N` 으로 ProcessPoolExecutor 병렬 가능. `raw/sar_rda_processorV7_numba.py`
는 같은 CLI 를 가진 가속 단일 파일 버전(직접 실행 가능).

### 2. Multi-look (CSU-04.05)

```bash
python csu_04_05_multilook.py \
  --slc ./out/SLC_complex.tif --xml ./out/SLC_metadata.xml \
  --range-looks 4 --azimuth-looks 10 --output ./mld
# → mld/MLD_4R10A.tif + MLD_4R10A.xml + MLD_4R10A_ql.png
```

### 3. Speckle 필터 (sub-step)

```bash
python csu_04_05_speckle_filter.py \
  --input ./mld/MLD_4R10A.tif --filter lee --output ./flt
# → flt/<input-name>_lee.tif
```

### 4. 회귀 검증

```bash
# V4 ↔ V4-분할본
python validate_subset_equivalence.py --h5-path data.h5 --strategy recommended \
  --windows 128,200,512 --json-out docs/subset-validation-report.json \
  --md-out docs/subset-validation-report.md

# V4 ↔ V7 Numba
python validate_v7_equivalence.py --h5-path data.h5 --strategy recommended \
  --windows 128,200,512 --json-out docs/v7-validation-report.json \
  --md-out docs/v7-validation-report.md
```

### 5. 테스트

```bash
python -m pytest tests/ -v
```

`tests/test_csu04_h5.py` 는 `CSC04_H5_PATH` 환경변수 또는 기본 경로
`C:\Users\USER\Downloads\16_resized.h5` 에서 입력을 찾는다. 파일이 없으면
자동 skip.

---

## 의존성

- 필수: `numpy`, `scipy`, `h5py`, `matplotlib`
- 선택: `numba` (V7 가속), `rasterio` (GeoTIFF 입출력 — 없으면 BIP/ENVI fallback),
  `tifffile` (rasterio 없을 때의 일부 fallback 경로)

검증된 환경: Python 3.12.7 (`C:\Users\USER\anaconda3\python.exe`) 또는
Python 3.13.11.

---

## 추가 자료

- [`docs/README.md`](docs/README.md) — 설계·회귀 보고서 가이드
- [`docs/refactoring.md`](docs/refactoring.md) — V4 → CSU 분할 설계 노트
- [`docs/subset-validation-report.md`](docs/subset-validation-report.md) — V4 ↔ 분할본 동등성 검증
- [`docs/v7-validation-report.md`](docs/v7-validation-report.md) — V4 ↔ V7 Numba 회귀
- [`verifications/README.md`](verifications/README.md) — V4 ↔ 외부 GUI 처리기 비교
- [`../../interfaces/csc-4/README.md`](../../interfaces/csc-4/README.md) — ICD CSC-04 인터페이스 명세
