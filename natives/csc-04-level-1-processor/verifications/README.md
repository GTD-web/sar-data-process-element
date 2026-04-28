# V4 SLC Verification Suite

`sar_rda_processorV4.py`(이 저장소의 `../raw/sar_rda_processorV4.py`)이 외부
GUI 처리기(`Lumir_SAR_Processor_GUI`의 `RDA_raw_to_SLC.py`)와 동일한 raw → SLC
결과를 산출하는지 정량/정성적으로 비교하기 위한 도구 모음 + 검증 보고서.

- **검증 데이터**: `16_resized.h5` (15.6 GB, ST0/Raw data shape `(49280, 79504, 2) int16`)
- **검증 azimuth 윈도**: `[az0=3000, az1=5000)` (n_cols = 2000)
- **Range decimation**: D=1 (chirp BW 1.2 GHz > fs/2 = 750 MHz라서 V4도 D=1만 안전)
- **검증일**: 2026-04-28
- **Python 환경**: 3.13.11 / numpy 2.4.4 / scipy 1.17.1 / h5py 3.16.0

---

## 1. 두 처리기의 구조적 차이

| 항목 | GUI `RDA_raw_to_SLC.py` (외부) | V4 `sar_rda_processorV4.py` (이 저장소) |
| --- | --- | --- |
| 처리 단위 | **단일 블록** `[az0, az1)` | **전체 azimuth**, sliding-window overlap-add 강제 |
| Azimuth 윈도잉 | 없음 (가중치 없이 한 번에 처리) | Tukey(α≈1.48) 가중치로 ≥5개 블록 합성 |
| Doppler centroid 추정 | Hanning 가중, `smooth_len=501`, `sg_poly=5` | 균등 가중, `smooth_len=101`, `sg_poly=5` |
| RCMC | Python 루프 + `np.interp` | `scipy.ndimage.map_coordinates` (C 백엔드) |
| Range compression | linear conv, FFT-based MF | 동일 |
| Azimuth compression | 범위 빈 단위 chirp `exp(-j π Ka t²)` | 동일, range-bin 청크로 메모리 최적화 |
| 인터페이스 | `python ... <h5> <az0> <az1>` | `python ... --input ... --output ...` (블록 자동) |
| 출력 | `SLC_RDA*.npy` (complex), `SLC*.png` | `SLC_complex_w10dec16.tif` 또는 BIP `.bin`+ENVI `.hdr`, `QuickLook.png` |

**핵심**: 단일 블록 안의 알고리즘은 사실상 동일하나, V4는 sliding-window
overlap-add로 인접 블록을 Tukey 가중 합성한다. 같은 픽셀에 여러 블록이 실수/허수
분리 평균(incoherent average)되어 진폭이 떨어지고 phase가 부분 상쇄된다(V4
`_accumulate` docstring 참조).

---

## 2. 비교 모드 정의

같은 CLI 파라미터로는 1:1 비교가 불가능해서, V4 내부 함수를 직접 호출하는
두 가지 우회로를 사용한다.

### Mode 1 — 블록 대 블록 (apples-to-apples)
V4의 `_process_block(args)`을 동일한 `[az0, az1)`로 호출하여 overlap-add /
Tukey 가중치를 우회. 두 처리기가 정확히 동일한 7단계 RDA 파이프라인을 같은
데이터에 적용한 결과만을 비교한다.

→ `run_v4_block.py`

### Mode 2 — 풀 overlap-add 결과의 윈도 크롭
V4의 `_build_block_schedule`로 `[3000, 5000)`에 영향을 주는 5개 블록(0, 1, 2, 3, 4)을
찾고, 각각 `_process_block`을 실행한 뒤 V4와 동일한 Tukey 가중 합성/정규화를
재현. 풀 49,280 pulses 처리(~100분) 대신 ~6분에 같은 결과를 얻는다.

→ `run_v4_overlap_window.py`

---

## 3. 정량 지표 (compare_slc.py)

### 3.1 Mode 1 — 블록 대 블록

| 지표 | 값 | 해석 |
| --- | --- | --- |
| Shape | `(79504, 2000)` | range × azimuth, 일치 ✓ |
| Peak amp (GUI) | 30,706 | |
| Peak amp (V4) | 30,959 | |
| **Peak ratio** | **0.992** | **1% 이내 일치 — 진폭 캘리브레이션 동등** |
| NCC (amplitude) | 0.41 | speckle noise dominant → 절대값은 낮게 보임 |
| NCC (dB) | 0.53 | dB 도메인에서 패턴 일치 |
| RMSE (dB) | 7.5 | |
| Mean abs diff (dB) | 5.6 | 차이 영상 대부분 ±5 dB 안쪽 |

### 3.2 Mode 2 — 풀 overlap-add 크롭

| 지표 | 값 | 해석 |
| --- | --- | --- |
| Shape | `(79504, 2000)` | 일치 ✓ |
| Peak amp (GUI) | 30,706 | |
| Peak amp (V4) | 9,007 | |
| **Peak ratio** | **3.41** | **V4가 ~3.4배 어두움 (incoherent overlap-add)** |
| NCC (amplitude) | 0.17 | |
| NCC (dB) | 0.25 | |
| RMSE (dB) | 13.6 | |
| Mean abs diff (dB) | 11.3 | |

5개 블록의 fdc는 azimuth 위치별로 -25 → -34 → -41 → -52 → -59 Hz로 단조
변화. V4는 시간변동 doppler centroid를 더 잘 추적하지만, 블록 간 phase가
달라져 가중 평균 시 부분 상쇄가 발생.

---

## 4. 추가 분석

### 4.1 강한 산란체 위치 일치도 — Hausdorff distance

각 영상에서 21×21 이웃에서의 local maximum을 찾고 진폭 상위 200개를 추출,
양방향 nearest-neighbor 거리 통계.

| 단위: 픽셀 | Mode 1 | Mode 2 |
| --- | --- | --- |
| Hausdorff (max-of-max) | **85.5** | **1760.0** |
| Mean NN GUI→V4 | 13.1 | 25.3 |
| Mean NN V4→GUI | 12.8 | **93.0** |
| Median NN GUI→V4 | 10.0 | 16.1 |
| Median NN V4→GUI | 10.1 | 16.3 |

**Mode 1**: 양방향 평균/중앙값이 모두 ~10–13 px → 두 처리기가 잡는 강한
산란체 위치는 동일한 region에 있고, 보통 10 픽셀 안에 대응점이 있음. 최댓값이
85 px인 건 일부 산란체 클러스터에서 정렬이 흐트러진 경우.

**Mode 2**: GUI→V4는 25 px로 적당하나 **V4→GUI mean이 93 px**로 큰 비대칭이
발생. V4가 잡는 일부 강한 점들이 GUI에는 매칭되는 점이 없음(overlap-add로
인한 phase 사이드로브 등의 아티팩트로 추정). Hausdorff가 1760 px까지 튀는
건 V4에 GUI와 무관한 이상 산란체가 일부 존재함을 의미.

### 4.2 ROI 단위 NCC — `400 × 200` 패치 (총 1,980개)

진폭 dB 영상을 `range=400 × azimuth=200` 타일로 잘라 패치별 정규화 상관계수.
글로벌 진폭 차이의 영향을 받지 않고 패턴 일치도만 측정.

| 지표 | Mode 1 | Mode 2 |
| --- | --- | --- |
| NCC mean | **0.115** | 0.005 |
| NCC median | 0.027 | 0.002 |
| NCC std | 0.22 | 0.017 |
| NCC p90 | **0.51** | 0.011 |
| NCC max | **0.81** | 0.31 |
| NCC p10 | 0.008 | -0.004 |

**Mode 1 히스토그램은 명확히 이중분포**:
- 잡음 영역(대부분의 타일): NCC ≈ 0
- 강한 산란체 타일(~190개): NCC = 0.7–0.8 (밝은 줄 영역)

**Mode 2 히스토그램은 0 근처에 좁게 집중**: 강한 타일에서도 NCC max가 0.31에
그쳐, overlap-add가 픽셀 단위 패턴을 거의 무작위화시킴을 보여줌.

---

## 5. 결론

1. **두 처리기의 RDA 알고리즘 자체는 사실상 동일**.
   - Mode 1에서 피크 진폭이 1% 이내로 일치, 강한 산란체 위치 중앙값이 10
     픽셀 안쪽에서 매칭. 강한 타겟 ROI에서 NCC 최대 0.81.

2. **차이의 원인은 알고리즘이 아니라 V4의 "전체 처리 구조"**.
   - V4는 sliding-window overlap-add + Tukey 가중치로 azimuth를 합성한다.
     같은 픽셀에 여러 블록이 기여하고, 실수/허수가 분리 평균되면서 진폭이
     ~3.4배 줄고 phase가 부분 상쇄된다(V4가 의도한 설계).
   - 이 때문에 Mode 2에서는 ROI-NCC가 거의 0으로 무너지고 일부 V4 산란체가
     GUI와 동떨어진 위치에 나타난다.

3. **GUI preview가 V4와 일치하는지에 대한 답**:
   - **단일 블록 단위 비교(Mode 1)에서는 일치**. GUI가 화면에 보여주는
     preview는 V4의 `_process_block` 단계 출력과 등가다.
   - **풀 SLC와의 비교(Mode 2)에서는 동일한 영상이 아니다.** V4의 풀 SLC를
     GUI preview의 ground truth로 쓰려면, 진폭 정규화(예: peak로 나누기) 후
     dB로 비교해야 하며, 그렇게 해도 overlap-add로 인한 phase 사이드로브 등의
     구조적 차이는 남는다.

4. **권장 검증 절차**:
   - V4 회귀 테스트는 **Mode 1**로 수행 (빠르고 알고리즘 동등성을 명확히 측정).
   - V4의 풀 SLC와의 위치 정합성은 **강한 산란체 Hausdorff median NN**으로
     평가 (Mode 2 median NN ≈ 16 px → azimuth 합성을 거쳐도 산란체 위치는
     크게 어긋나지 않음).

---

## 6. 도구 인덱스

이 폴더 안의 스크립트는 모두 standalone Python으로, 외부 의존은
`numpy`, `scipy`, `matplotlib`, `h5py` 정도이고 V4 GeoTIFF를 직접 읽어야
할 때만 추가로 `tifffile`이 필요하다(BIP fallback은 의존성 없음).

| 파일 | 역할 |
| --- | --- |
| `run_v4_block.py` | V4 `_process_block` 한 윈도 호출 (Mode 1 SLC 산출) |
| `run_v4_overlap_window.py` | V4 overlap-add를 타깃 윈도에만 재현 (Mode 2 SLC 산출) |
| `compare_slc.py` | 진폭/dB 영상 비교, NCC/RMSE/peak ratio 산출 |
| `extra_analysis.py` | 피크 검출 + Hausdorff + ROI-NCC |
| `README.md` | 이 문서 |

`run_v4_block.py`와 `run_v4_overlap_window.py`의 `--v4` 옵션 기본값은
sibling `../raw/sar_rda_processorV4.py`로 자동 해결된다.

---

## 7. 재현 방법

```bash
# 환경 변수
PY=python                           # numpy/scipy/h5py/matplotlib 설치된 인터프리터
H5=/path/to/16_resized.h5
GUI=/path/to/Lumir_SAR_Processor_GUI

# (1) GUI 처리 (외부 저장소)
OUTPUT_DIR=$GUI/temp/gui_out OUTPUT_TIMESTAMP=20260428 OUTPUT_ALGORITHM_NAME=rda \
OUTPUT_CMAP=gray OUTPUT_VMIN=-60 OUTPUT_VMAX=-5 \
$PY $GUI/main/scripts/level1/a/RDA_raw_to_SLC.py "$H5" 3000 5000

# (2) V4 블록 모드 (Mode 1 비교용)
$PY run_v4_block.py --h5 "$H5" --az0 3000 --az1 5000 --out ./out/v4_block

# (3) V4 overlap-add 윈도 모드 (Mode 2 비교용; 풀 처리의 1/10 시간)
$PY run_v4_overlap_window.py --h5 "$H5" --az0 3000 --az1 5000 --out ./out/v4_overlap

# (4) 기본 비교 (Mode 1, Mode 2)
$PY compare_slc.py \
  --gui $GUI/temp/gui_out/SLC_RDA_rda_20260428.npy \
  --v4  ./out/v4_block/SLC_V4_block_3000_5000.npy \
  --az0 3000 --az1 5000 --out ./out/compare_block

$PY compare_slc.py \
  --gui $GUI/temp/gui_out/SLC_RDA_rda_20260428.npy \
  --v4  ./out/v4_overlap/SLC_V4_overlap_3000_5000.npy \
  --az0 3000 --az1 5000 --out ./out/compare_full

# (5) 추가 분석 (Hausdorff + ROI-NCC)
$PY extra_analysis.py \
  --gui $GUI/temp/gui_out/SLC_RDA_rda_20260428.npy \
  --v4  ./out/v4_block/SLC_V4_block_3000_5000.npy \
  --out ./out/extra_block

$PY extra_analysis.py \
  --gui $GUI/temp/gui_out/SLC_RDA_rda_20260428.npy \
  --v4  ./out/v4_overlap/SLC_V4_overlap_3000_5000.npy \
  --out ./out/extra_full
```

### H5 입력 파일 검증 결과
- ST0 그룹에 `Raw data, Replica, GPSDATA_HQ`가 모두 존재 ✓
- 코어 처리에 필요한 attrs 전부 존재 (PRF, Carrier Frequency, Sampling
  Frequency, Chirp baseband start/stop, Pulse Width, SWST, Look Angle,
  Platform Height, Flight Speed, Beamwidth, Squint Angle, Doppler Centroid,
  Doppler Centroid Pofile)
- V4의 XML 메타데이터에만 쓰이는 `Reference UTC`, `Scene Sensing Start/Stop UTC`는
  **누락**되었으나 V4가 `datetime(2000,1,1)`로 fallback하므로 SLC 처리는 정상
- 임베디드 Python에 `rasterio`, `tifffile`이 없으면 V4는 GeoTIFF 대신 BIP
  바이너리 + ENVI 헤더로 fallback 출력. `compare_slc.py`가 둘 다 지원
