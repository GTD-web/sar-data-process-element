import type { SchemaVersion } from '../type/schema-version.type';
import type { ProductLevel } from '../type/product-level.type';
import type { TargetCsc } from '../type/target-csc.type';

/**
 * SI-04 작업 할당 메시지 (ICD 6.6)
 * - CSC-08이 CSC별 전용 큐(sdpe.jobs.cscXX)에 발행
 * - 각 CSC는 자신의 전용 큐를 구독하여 작업 수신
 * - 스키마 소유자: CSC-08
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
