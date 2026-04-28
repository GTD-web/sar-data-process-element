import type { SchemaVersion } from '../type/schema-version.type';

/**
 * EI-01 수신 이벤트 (ICD 5.1.1)
 * - 위성 수신국이 NAS에 원시 데이터를 저장한 후 발행
 * - CSC-08이 파이프라인을 시작하는 트리거
 * - 큐: sdpe.reception.events
 * - 스키마 소유자: 위성 수신국 (EI-01) / CSC-02 (SI-01)
 */
export interface RawDataReceivedEvent {
  // ── 확정 필드 ──
  schema_version: SchemaVersion;
  event_id: string;
  event_type: 'RAW_DATA_RECEIVED';
  raw_data_id?: string;
  acquisition_start: string;
  acquisition_end: string;
  raw_data_path: string;
  file_size_bytes: number;
  checksum_sha256: string;

  // ── TBC — 위성팀 협의 필요 ──
  satellite_id: string;
  mode: string;
  polarization: string[];
  center_frequency_hz: number;
  prf_hz: number;

  // ── TBD — 수신국 협의 필요 ──
  metadata_path?: string | null;
}
