# CSU-08.02 — Quality Checker

| 항목                | 내용                                   |
| ------------------- | -------------------------------------- |
| **CSU ID**          | CSU-08.02                              |
| **소속 CSC**        | CSC-08 Product & Catalog Manager (PPS) |
| **ICD 버전**        | v1.0 (2026-03-20)                      |
| **관련 인터페이스** | SI-05, CI-03                           |

---

## 입력 타입

> **ICD 출처:** 6.6절 SI-05, 3절 모니터링 임계값 테이블

```typescript
/**
 * 품질 검증 요청.
 * CSU-08.01이 quality_run == true인 등록 트리거 처리 시 호출한다.
 */
export interface QualityCheckRequest {
  /** 검증 대상 제품의 NAS 경로
   * ICD 6.6절: "product_path — NAS 제품 파일 경로" / 성숙도: 확정 */
  product_path: string;

  /** 제품 레벨. 레벨에 따라 검증 항목이 달라질 수 있다.
   * ICD 6.6절: "product_level — 등록 대상 제품 레벨. 'LEVEL_1'~'LEVEL_3'" / 성숙도: 확정 */
  product_level: 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

  /** 산출물 유형. 예: "GRD", "SLC"
   * ICD 6.6절: "product_type" / 성숙도: TBC
   * @status TBC — 유형별 검증 기준 미확정 */
  product_type: string;

  /** 작업 고유 식별자 (추적 목적)
   * ICD 6.6절: "job_id — 원본 처리 작업 ID" / 성숙도: 확정 */
  job_id: string;
}

/**
 * 품질 검증 결과.
 */
export interface QualityCheckResult {
  /** 품질 검증 통과 여부
   * ICD SI-06: "quality_passed BOOLEAN" */
  passed: boolean;

  /** 실패 시 세부 사유 목록. 통과 시 빈 배열 */
  failure_reasons: string[];

  /** 적용된 검증 항목 목록. 구체적 항목: TBD
   * ICD 미기재 — 품질 기준 항목 미확정
   * @status TBD — 품질 검증 기준 항목 및 임계값 미확정 */
  checks_performed: string[];
}
```

---

## CSU 인터페이스

> **ICD 출처:** 6.6절 SI-05, 3절 모니터링 임계값 테이블

| 메서드           | ICD 근거 문장                                                           | 결론                                                       |
| ---------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| `checkQuality()` | SI-05: "quality_run — 품질 검증 실행 여부. true 시 CSC-08.02 자동 실행" | 제품 파일에 대해 품질 기준 항목을 검사하고 결과를 반환한다 |

```typescript
export interface IQualityChecker {
  /**
   * 제품 파일에 대해 품질 검증을 수행한다.
   * 품질 기준 항목 및 임계값은 TBD이며, 확정 후 구현에 반영해야 한다.
   *
   * 품질 실패 시 처리 흐름:
   *   - QualityCheckResult.passed == false 반환
   *   - 호출자(CSU-08.01)가 sar_products.quality_passed = false 기록
   *   - 호출자(CSU-08.01)가 CSU-07.07에 DATA_QUALITY_FAILED Alert 발행 위임
   *
   * ICD 근거:
   *   - SI-05 — "quality_run — 품질 검증 실행 여부. true 시 CSC-08.02 자동 실행"
   *   - SI-06 — "quality_passed BOOLEAN" (DB 컬럼)
   *   - 3절 모니터링 임계값 — "데이터 품질 — 품질 기준 미달 → CSC-08.02 → CSC-07.07 Alert"
   *
   * @throws FileReadError    product_path 파일 읽기 실패
   * @throws QualityCheckConfigError  품질 검증 기준 설정 오류
   */
  checkQuality(request: QualityCheckRequest): Promise<QualityCheckResult>;
}
```

---

## 예외 타입

> **ICD 출처:** 6.6절 SI-05, 3절 모니터링

| 예외                      | ICD 근거 문장                                                      | 결론                        |
| ------------------------- | ------------------------------------------------------------------ | --------------------------- |
| `FileReadError`           | SI-05: "product_path — NAS 제품 파일 경로" (파일 접근 실패 가능성) | NAS 파일 접근 실패 시 예외  |
| `QualityCheckConfigError` | ICD 미기재 — 품질 기준 설정 누락 또는 오류 가능성                  | 검증 기준 설정 오류 시 예외 |

```typescript
export class FileReadError extends Error {} // NAS 파일 접근 실패
export class QualityCheckConfigError extends Error {} // 품질 기준 설정 오류
```

---

## 의존 관계

> **ICD 출처:** 6.8절 CI-03

| 의존 대상                 | 호출 목적      | ICD 근거 문장                                              | 결론                  | 정의 위치 |
| ------------------------- | -------------- | ---------------------------------------------------------- | --------------------- | --------- |
| **CSU-01.03** NAS Manager | 제품 파일 읽기 | SI-05: "product_path — NAS 제품 파일 경로" (NAS 접근 원칙) | NAS 접근은 CI-03 경유 | CI-03     |

---

## 미확정 항목

> **ICD 출처:** 3절 모니터링 임계값 테이블, 6.6절 SI-05

| 우선순위 | 항목                                             | 상태 | ICD 근거 문장                                                                            | 결론                                            | 해결 조건        |
| -------- | ------------------------------------------------ | ---- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------- |
| P2       | 품질 검증 기준 항목 및 임계값                    | TBD  | 3절 모니터링: "데이터 품질 — 품질 기준 미달" (기준 항목 미정의)                          | 기준 확정 전 `checks_performed` 구현 불가       | 알고리즘 팀 협의 |
| P2       | product_type별 검증 항목 차별화                  | TBC  | SI-05: "product_type — 산출물 유형. 예: 'GRD', 'SLC'" / 성숙도: TBC                      | product_type 목록 확정 전 유형별 검증 설계 불가 | 팀 내부 결정     |
| P2       | 품질 검증 자동 실행 조건 (quality_run 생성 기준) | TBC  | 8.3절: "품질 검증 자동 실행 조건 확정"                                                   | SI-05 quality_run 설정 기준 미확정              | 팀 내부 결정     |
| P3       | NESZ 등 SAR 특화 품질 지표                       | TBC  | CI-01 HDF5: "nesz_db float64[n_range] (Noise Equivalent Sigma Zero, NESZ)" / 성숙도: TBC | NESZ 지표 활용 여부 결정 필요                   | 알고리즘 팀 협의 |

---

## 관련 문서

- **SI-05** — quality_run 필드 및 품질 검증 트리거 정의 (ICD 6.6절)
- **SI-06** — quality_passed 컬럼 정의 (ICD 6.7절)
- **CI-03** — CSU-01.03 NAS Manager 사용 (ICD 6.8절)
- **CSU-08.01** — 품질 검증 호출 및 결과 처리
- **CSU-07.07** — 품질 실패 Alert 발행 (3절 모니터링 표)
