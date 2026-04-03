import type { SchemaVersion } from '../common';

/**
 * SI-05 제품 등록 트리거 (ICD 6.7)
 * - Level-1 이상 제품 처리 완료 시 CSC-08이 발행. Level-0은 미발행.
 * - 큐: sdpe.catalog.registration
 * - 소비자: CSC-07 Product & Catalog Manager
 * - 스키마 소유자: CSC-08 + CSC-07 공동 합의
 * - SI-05 인터페이스 자체가 TBC 상태 (ICD 2.3)
 */
export interface CatalogRegistrationMessage {
  // ── 확정 필드 ──
  job_id: string;
  product_level: 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';
  product_path: string;
  acquisition_start: string;
  acquisition_end: string;

  // ── TBC — CSC-08과 협의 필요 ──
  schema_version: SchemaVersion;
  registration_id: string;
  product_type: string;
  satellite_id: string;
  footprint_wkt: string;
  quality_run: boolean;
}
