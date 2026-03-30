/** 큐 설정 — 확정 (ICD 6.5) */
export const QUEUE_CONFIG = {
  consume: {
    RECEPTION_EVENTS: 'sdpe.reception.events',
    PROCESSING_EVENTS: 'sdpe.processing.events',
  },

  produce: {
    JOBS_CSC02: { queue: 'sdpe.jobs.csc02', visibilityTimeoutSec: 3_600 },
    JOBS_CSC03: { queue: 'sdpe.jobs.csc03', visibilityTimeoutSec: 3_600 },
    JOBS_CSC04: { queue: 'sdpe.jobs.csc04', visibilityTimeoutSec: 9_000 },
    JOBS_CSC05: { queue: 'sdpe.jobs.csc05', visibilityTimeoutSec: 2_700 },
    JOBS_CSC06: { queue: 'sdpe.jobs.csc06', visibilityTimeoutSec: 1_800 },
    CATALOG_REGISTRATION: 'sdpe.catalog.registration',
  },
} as const;
