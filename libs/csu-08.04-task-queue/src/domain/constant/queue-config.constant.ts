import { QueueName } from '@sdpe/shared';

/**
 * PGMQ 큐 설정 — 확정 (ICD 6.6 SI-04).
 *
 * consume: CSC-08이 구독하는 큐 (SI-01 수신 이벤트, SI-03 처리 이벤트)
 * produce: CSC-08이 발행하는 큐 (SI-04 작업 할당, SI-05 카탈로그 등록)
 *
 * visibilityTimeoutSec: 메시지 처리 중 다른 소비자에게 보이지 않는 시간.
 * 시스템 설계서 2.2 '500GB / 4시간' 요건에서 CSC별 처리 비중으로 역산.
 */
export const QUEUE_CONFIG = {
  /** CSC-08이 수신하는 큐 */
  consume: {
    RECEPTION_EVENTS: QueueName.RECEPTION_EVENTS,
    PROCESSING_EVENTS: QueueName.PROCESSING_EVENTS,
  },

  /** CSC-08이 발행하는 큐 */
  produce: {
    JOBS_CSC02: { queue: QueueName.JOBS_CSC02, visibilityTimeoutSec: 3_600 },
    JOBS_CSC03: { queue: QueueName.JOBS_CSC03, visibilityTimeoutSec: 3_600 },
    /** CSC-04(SAR 처리)는 가장 오래 걸려 2.5시간 할당 (전체의 50%) */
    JOBS_CSC04: { queue: QueueName.JOBS_CSC04, visibilityTimeoutSec: 9_000 },
    JOBS_CSC05: { queue: QueueName.JOBS_CSC05, visibilityTimeoutSec: 2_700 },
    JOBS_CSC06: { queue: QueueName.JOBS_CSC06, visibilityTimeoutSec: 1_800 },
    /** SI-05: Level-1 이상 제품 처리 완료 시 CSC-07에 등록 트리거 */
    CATALOG_REGISTRATION: QueueName.CATALOG_REGISTRATION,
  },
} as const;
