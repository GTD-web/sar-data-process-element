# CSC-04 Level-1 Processor — 리팩토링 분석

`sar_rda_processorV4.py` 단일 파일을 CSU 단위로 분리하기 위한 분석 문서입니다.

---

## 1. 현재 파일 구조 → CSU 매핑

파일 내 `════` 구분선 기준으로 섹션이 명확히 나뉘어 있습니다.

| 섹션 | 함수 / 클래스 | 담당 CSU |
|------|--------------|---------|
| §1 Metadata | `Meta`, `load_metadata()`, `_decimate_replica()` | 공유 인프라 |
| §2 Range compression | `range_compress()` | **CSU-04.01** |
| §3 Doppler centroid | `estimate_fdc_profile()` | **CSU-04.02** |
| §4 Deramping | `remove_time_varying_fdc()` | **CSU-04.02** |
| §5 RCMC | `rcmc_time_domain()` | **CSU-04.02** |
| §6 Azimuth compress | `azimuth_compress()` | **CSU-04.02** |
| §7 Block schedule | `_build_block_schedule()` | **CSU-04.04** |
| §8 Block worker | `_process_block()` | **CSU-04.04** |
| §9 SAR Processor | `SARProcessor` | **CSU-04.04** |
| §10 GeoTIFF / XML writer | `_TiffStripWriter`, `_write_tiff()`, `write_metadata_xml()`, quicklook | 공유 인프라 (I/O) |
| §12 CLI | `main()`, `_print_parameters()` | 진입점 |

---

## 2. 목표 디렉토리 구조

```
csc-04-level-1-processor/
│
├── shared/
│   ├── __init__.py
│   ├── metadata.py          # Meta, load_metadata(), _decimate_replica()
│   └── io.py                # _TiffStripWriter, _write_tiff(), write_metadata_xml(),
│                            # _write_quicklook(), _write_quicklook_from_slc()
│
├── csu_04_01_range_compression.py   # range_compress()
│
├── csu_04_02_rda_azimuth.py         # estimate_fdc_profile()
│                                    # remove_time_varying_fdc()
│                                    # rcmc_time_domain()
│                                    # azimuth_compress()
│
├── csu_04_04_slc_formation.py       # _build_block_schedule()
│                                    # _process_block()   ← module-level (pickling 필수)
│                                    # SARProcessor
│
├── tests/
│   └── test_csu04.py                # 단위 테스트 (합성 데이터 기반)
│
└── main.py                          # CLI 진입점 (main, _print_parameters)
```

---

## 3. 핵심 제약: `_process_block()` pickle 요건

`SARProcessor.run()`은 `ProcessPoolExecutor`로 병렬 처리합니다.  
Python `multiprocessing`은 작업 함수를 pickle로 직렬화하므로,  
**`_process_block()`은 반드시 모듈 최상위에서 임포트 가능**해야 합니다.

`csu_04_04_slc_formation.py` 내에서 다른 CSU 모듈을 import하면 정상 동작합니다:

```python
# csu_04_04_slc_formation.py
from csu_04_01_range_compression import range_compress
from csu_04_02_rda_azimuth import (
    estimate_fdc_profile,
    remove_time_varying_fdc,
    rcmc_time_domain,
    azimuth_compress,
)
```

---

## 4. 테스트 전략

### 함수 분류

| 종류 | 함수 | 테스트 방법 |
|------|------|------------|
| **순수 수치 함수** | `range_compress`, `azimuth_compress`, `rcmc_time_domain`, `estimate_fdc_profile`, `remove_time_varying_fdc`, `_build_block_schedule`, `_decimate_replica` | 합성 numpy 배열로 단위 테스트 가능 |
| **I/O 의존 함수** | `load_metadata`, `_process_block`, `SARProcessor.run` | 실제 HDF5 파일 필요 |

### 함수별 검증 포인트

| 함수 | 검증 항목 |
|------|----------|
| `range_compress` | 점 타겟(impulse) 입력 → 피크가 올바른 위치에 압축되는지 |
| `_build_block_schedule` | na_total 전체 커버 여부, 마지막 블록이 범위를 벗어나지 않는지 |
| `_decimate_replica` | 출력 길이 ≈ `len(replica) // D`, 복소수 타입 유지 |
| `estimate_fdc_profile` | 출력 길이 == Naz, 값이 `[-PRF/2, PRF/2]` 범위 내 |
| `remove_time_varying_fdc` | 출력 shape 동일, 에너지가 크게 변하지 않음 |
| `rcmc_time_domain` | 출력 shape 동일, NaN/Inf 없음 |
| `azimuth_compress` | 출력 shape 동일, 점 타겟 포커싱 확인 |

---

## 5. 리팩토링 진행 순서

복잡한 의존성을 고려한 안전한 순서입니다.

```
1. tests/test_csu04.py 작성      ← 현재 단일 파일 기준, 기준선(baseline) 확보
2. pytest 실행 → 전체 통과 확인
3. shared/metadata.py 추출       ← 다른 모든 모듈이 의존
4. shared/io.py 추출             ← 다른 CSU가 의존하지 않음
5. csu_04_01_range_compression.py 추출   ← 의존성 단순
6. csu_04_02_rda_azimuth.py 추출
7. csu_04_04_slc_formation.py 추출       ← 위 모듈들 import
8. main.py 정리
9. pytest 재실행 → 기준선과 동일한지 검증 (회귀 테스트)
```

각 단계마다 `pytest`를 실행해 회귀가 없는지 확인하며 진행합니다.

---

## 6. 환경 준비 체크리스트

- [ ] `pytest` 설치 확인: `pip show pytest`
- [ ] `numpy`, `scipy` 설치 확인: `pip show numpy scipy`
- [ ] 테스트용 HDF5 파일 확보 (있으면 `load_metadata` 통합 테스트 추가 가능)
