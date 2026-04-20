import { TargetCsc } from '@sdpe/shared';

/**
 * 모니터링 임계값 (시스템 설계서 2.2, ICD 3.3).
 * '500GB 원시 데이터를 4시간 내 처리' 요건에서 CSC별 처리 비중으로 역산.
 */
export const MONITORING_THRESHOLD = {
  /** 전체 파이프라인 상한: 14,400초 (4시간) */
  TOTAL_PIPELINE_SEC: 14_400,
  /** 각 단계별 목표 시간 (초). 처리 비중: CSC-04(50%) > CSC-02(25%) > CSC-03(20%) > CSC-05·06 */
  STEP_TARGET_SEC: {
    [TargetCsc.CSC_02]: 3_600,
    [TargetCsc.CSC_03]: 2_880,
    [TargetCsc.CSC_04]: 7_200,
    [TargetCsc.CSC_05]: 2_160,
    [TargetCsc.CSC_06]: 1_440,
  },
  /** WARNING 임계값: 목표 시간의 80% */
  WARNING_RATIO: 0.8,
} as const;
