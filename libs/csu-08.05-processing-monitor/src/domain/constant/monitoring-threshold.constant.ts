/** 모니터링 임계값 (시스템 설계서 2.2, ICD 3.3) */
export const MONITORING_THRESHOLD = {
  /** 전체 파이프라인 상한: 14,400초 (4시간) */
  TOTAL_PIPELINE_SEC: 14_400,
  /** 각 단계별 목표 시간 (초) */
  STEP_TARGET_SEC: {
    'CSC-02': 3_600,
    'CSC-03': 2_880,
    'CSC-04': 7_200,
    'CSC-05': 2_160,
    'CSC-06': 1_440,
  },
  /** WARNING 임계값: 목표 시간의 80% */
  WARNING_RATIO: 0.8,
} as const;
