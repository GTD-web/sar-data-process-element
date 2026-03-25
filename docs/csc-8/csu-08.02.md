# CSU-08.02 — Quality Validator

| 항목                | 내용                                   |
| ------------------- | -------------------------------------- |
| **CSU ID**          | CSU-08.02                              |
| **소속 CSC**        | CSC-08 Product & Catalog Manager (PPS) |
| **ICD 버전**        | v1.0 (2026-03-20)                      |
| **관련 인터페이스** | SI-05, CI-03                           |

---

## 타입 정의

```typescript
export type ProductLevel = 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

export interface QualityValidationInput {
  /** 검증 대상 제품 NAS 파일 경로 */
  product_path: string;

  /** 제품 레벨 */
  product_level: ProductLevel;

  /**
   * 산출물 유형. 예: "GRD", "SLC"
   * @status TBC — 허용값 미확정
   */
  product_type: string;
}

export interface QualityValidationResult {
  /** 품질 기준 통과 여부 */
  passed: boolean;

  /**
   * 품질 검증 항목별 결과
   * @status TBD — 검증 항목 목록 미확정
   */
  checks: QualityCheck[];
}

export interface QualityCheck {
  /**
   * 검증 항목 이름
   * @status TBD — 항목 목록 미확정
   */
  name: string;

  /** 통과 여부 */
  passed: boolean;

  /** 검증 상세 내용 */
  detail?: string;
}
```

---

## CSU 인터페이스

```typescript
export interface IQualityValidator {
  /**
   * 제품 품질을 검증한다.
   * 품질 기준 미달 시 CSU-07.07 Alert을 발행한다.
   *
   * @throws DbError  검증 결과 저장 실패
   */
  validate(input: QualityValidationInput): Promise<QualityValidationResult>;
}
```

---

## 예외 타입

```typescript
export class DbError extends Error {} // 검증 결과 저장 실패
```

---

## 의존 관계

| 의존 대상                  | 호출 목적                    | 정의 위치            |
| -------------------------- | ---------------------------- | -------------------- |
| **CSU-07.07**              | 품질 기준 미달 시 Alert 발행 | CSU-07.07 인터페이스 |
| **CSU-01.01** DB Interface | 검증 결과 저장               | CI-03                |
| **CSU-01.03** NAS Manager  | 제품 파일 읽기               | CI-03                |

---

## 미확정 항목

| 우선순위 | 항목                         | 상태 | 해결 조건       |
| -------- | ---------------------------- | ---- | --------------- |
| P2       | 품질 검증 항목 전체 목록     | TBD  | 알고리즘팀 협의 |
| P2       | 레벨·유형별 검증 기준 수치   | TBD  | 알고리즘팀 협의 |
| P2       | 품질 기준 미달 시 Alert 조건 | TBC  | 팀 내부 결정    |

---

## 관련 문서

- **SI-05** — `quality_run` 트리거 출처 (ICD)
- **CI-03** — CSU-01.01, CSU-01.03 사용 (ICD)
