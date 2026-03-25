# CSU-07.02 — Processing Profile Manager

| 항목                | 내용                               |
| ------------------- | ---------------------------------- |
| **CSU ID**          | CSU-07.02                          |
| **소속 CSC**        | CSC-07 Pipeline Orchestrator (PWS) |
| **ICD 버전**        | v1.0 (2026-03-20)                  |
| **관련 인터페이스** | SI-04, CI-03                       |

---

## 타입 정의

```typescript
export type ProductLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

export interface ProcessingProfile {
  /** 프로파일 고유 식별자 (UUID v4) */
  profile_id: string;

  /**
   * 위성 식별자
   * @status TBC — 형식 미확정
   */
  satellite_id: string;

  /**
   * 적용 촬영 모드
   * @status TBC — 허용값 미확정 (예: "SM" | "SC" | "SL")
   */
  mode: string;

  /** 이 프로파일이 생성하는 산출물 레벨 및 유형 목록 */
  target_steps: ProcessingStep[];
}

export interface ProcessingStep {
  /** 처리 레벨 */
  product_level: ProductLevel;

  /**
   * 생성해야 할 산출물 유형 목록
   * @status TBC — 허용값 미확정 (예: ["SLC", "GRD"])
   */
  product_types: string[];

  /**
   * 처리 파라미터 기본값
   * @status TBD — 허용 항목 미확정
   */
  default_params?: Record<string, unknown>;
}
```

---

## CSU 인터페이스

```typescript
export interface IProcessingProfileManager {
  /**
   * 위성 식별자와 촬영 모드를 기반으로 처리 프로파일을 선택한다.
   *
   * @throws ProfileNotFoundError  일치하는 프로파일 없음
   */
  selectProfile(satelliteId: string, mode: string): Promise<ProcessingProfile>;
}
```

---

## 의존 관계

| 의존 대상                  | 호출 목적     | 정의 위치 |
| -------------------------- | ------------- | --------- |
| **CSU-01.01** DB Interface | 프로파일 조회 | CI-03     |

---

## 미확정 항목

| 우선순위 | 항목                             | 상태 | 해결 조건                |
| -------- | -------------------------------- | ---- | ------------------------ |
| P1       | `mode` 허용값 enum               | TBC  | 위성팀 협의              |
| P1       | `satellite_id` 형식              | TBC  | 위성팀 협의              |
| P2       | `default_params` 허용 항목 목록  | TBD  | FI 시그니처 전체 확정 후 |
| P2       | `product_types` 허용값 전체 목록 | TBC  | SI-04 허용값 확정 후     |

---

## 관련 문서

- **SI-04** — `processing_profile_id` 필드 출처 (ICD)
- **CI-03** — CSU-01.01 사용 (ICD)
