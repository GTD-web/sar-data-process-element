import type { ProductLevel, SchemaVersion, SourceCsc } from '../common';

/**
 * SI-03 처리 완료/실패 이벤트 (ICD 6.4)
 * - CSC-02~06이 발행, CSC-07이 수신
 * - CSC-07은 다음 단계 할당 / 재시도 / Alert을 결정
 * - 스키마 소유자: CSC-02~06 (제공자) + CSC-07 (소비자) 공동 합의
 */
export interface ProcessingEvent {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  job_id: string;
  event_type: 'PROCESSING_COMPLETED' | 'PROCESSING_FAILED';
  source_csc: SourceCsc;
  product_level: ProductLevel;
  timestamp: string;
  input_path: string;
  output_path: string | null;
  retry_count: number;

  // ── TBC — 내부 결정 대기 ──
  output_product_type?: string;
  processing_duration_ms?: number;
  error_message?: string;

  // ── TBD — 각 CSC 담당자 취합 필요 ──
  error_code?: string;
}
