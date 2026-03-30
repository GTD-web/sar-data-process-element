import type { ProductLevel, SchemaVersion, TargetCsc } from '../common';

/**
 * SI-04 작업 할당 메시지 (ICD 6.5)
 * - CSC-07이 CSC별 전용 큐에 발행
 * - 스키마 소유자: CSC-07
 */
export interface JobAssignedMessage {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  job_id: string;
  message_type: 'JOB_ASSIGNED';
  target_csc: TargetCsc;
  timestamp: string;
  input_path: string;
  processing_profile_id: string;
  target_product_level: ProductLevel;

  // ── TBC — 소비자(CSC-02~06)와 협의 필요 ──
  priority: number;
  target_product_types: string[];
  deadline_utc?: string;

  // ── TBD — FI 시그니처 확정 후 결정 가능 ──
  processing_params?: Record<string, unknown>;
}
