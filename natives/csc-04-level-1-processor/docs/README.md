# CSC-04 문서

본 패키지의 설계 결정과 회귀 검증 보고서를 모은다. 코드만 봐서는 알기 어려운
"왜 이렇게 나눴는가, 정말 동등한가" 에 대한 근거 문서이다.

각 보고서는 같은 이름의 `.json` 파일과 한 쌍이다 — Markdown 은 사람이 읽고,
JSON 은 후속 분석/대시보드 입력으로 사용한다.

| 파일 | 내용 | 산출 방법 |
| --- | --- | --- |
| [`refactoring.md`](refactoring.md) | V4 단일 파일을 CSU-04.01/02/04 모듈로 분할할 때의 매핑, 제약(`_process_block` pickle 요건), 테스트 전략, 진행 순서 | 손으로 작성한 설계 노트 |
| [`subset-validation-report.md`](subset-validation-report.md) | V4 모놀리식 ↔ 분할본의 `_process_block` 출력이 부분 azimuth 구간에서 동일한지 정량 비교 — 모든 케이스 동일(`focused_max_abs_diff = 0.0`) 인지 검증 | `validate_subset_equivalence.py` |
| [`subset-validation-report.json`](subset-validation-report.json) | 위 보고서의 케이스별 raw 데이터 (실행 시간, FDC, 샘플 픽셀 등) | 동일 |
| [`v7-validation-report.md`](v7-validation-report.md) | V4 ↔ V7 (Numba RCMC/accumulate 가속본) 의 부분 구간 출력 동등성 회귀 — `peak_ratio`, `NCC`, `max_abs_diff`, `FDC` 임계 기반 합격 판정 | `validate_v7_equivalence.py` |
| [`v7-validation-report.json`](v7-validation-report.json) | 위 보고서의 90개 케이스 raw 데이터 | 동일 |

---

## 보고서 갱신 방법

두 검증 스크립트는 모두 패키지 루트(`csc-04-level-1-processor/`) 에서 실행한다.

```bash
# V4 ↔ V4-분할본 (refactoring 회귀)
python validate_subset_equivalence.py \
  --h5-path C:\Users\USER\Downloads\16_resized.h5 \
  --strategy recommended --windows 128,200,512 \
  --json-out docs/subset-validation-report.json \
  --md-out  docs/subset-validation-report.md

# V4 ↔ V7 Numba (가속본 회귀)
python validate_v7_equivalence.py \
  --h5-path C:\Users\USER\Downloads\16_resized.h5 \
  --strategy recommended --windows 128,200,512 \
  --json-out docs/v7-validation-report.json \
  --md-out  docs/v7-validation-report.md
```

전체 실행은 입력 H5(15.6 GB) 기준 ~11분(90 케이스) 가량 소요된다.

### 합격 임계 (v7-validation-report 기준)

| 항목 | 기본값 | 의미 |
| --- | --- | --- |
| `--abs-tol` | `1e-2` | `max_abs_diff / peak(V4)` 의 상한. Numba `prange` 합산 비결정성에서 오는 잡음 흡수용 |
| `--peak-ratio-tol` | `5e-3` | `|peak(V4)/peak(V7) - 1|` 의 상한 |
| `--ncc-min` | `0.99` | 진폭 NCC 의 하한 |
| `--fdc-abs-tol` | `1e-6` | `|fdc(V4) - fdc(V7)|` 의 상한 — 동일 코드면 0 이 정상 |

`subset-validation-report` 는 V4 ↔ 분할본 — pure-Python 동등성이므로 `focused_max_abs_diff = 0.0` 의 비트 단위 일치를 요구한다.
