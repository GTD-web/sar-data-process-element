// =============================================================================
// SDPE Pipeline Console — Domain Types
// DESIGN.md 6장 기반, libs/sdpe-shared 수기 복제 (v1)
// =============================================================================

// --- Enums / Unions ---

export type JobStatus = 'CREATED' | 'ASSIGNED' | 'COMPLETED' | 'FAILED' | 'CANCELED';
export type StepStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
export type ProductLevel = 'LEVEL_0' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';
export type TargetCsc = 'CSC-02' | 'CSC-03' | 'CSC-04' | 'CSC-05' | 'CSC-06' | 'CSC-07';
export type AlertKind = 'MAX_RETRY' | 'PIPELINE_DELAY' | 'QUALITY_FAIL' | 'RESOURCE_THRESHOLD';
export type AuditEventType =
  | 'JOB_CREATED'
  | 'JOB_ASSIGNED'
  | 'JOB_COMPLETED'
  | 'JOB_FAILED'
  | 'PIPELINE_STARTED'
  | 'PIPELINE_REPROCESSED'
  | 'ALERT_DISPATCHED';

// --- UI Display Helpers ---

export const JOB_STATUS_DISPLAY: Record<JobStatus, string> = {
  CREATED: 'PENDING',
  ASSIGNED: 'RUNNING',
  COMPLETED: 'DONE',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
};

export const CSC_LABELS: Record<TargetCsc, string> = {
  'CSC-02': '데이터 수집',
  'CSC-03': 'L0 Range Compression',
  'CSC-04': 'L1 SAR Processing',
  'CSC-05': 'L2 Post Processing',
  'CSC-06': 'L3 Geocoding',
  'CSC-07': '카탈로그 등록',
};

export const PRODUCT_LEVEL_LABELS: Record<ProductLevel, string> = {
  LEVEL_0: 'L0',
  LEVEL_1: 'L1',
  LEVEL_2: 'L2',
  LEVEL_3: 'L3',
};

// --- Domain Interfaces ---

export interface JobSummary {
  jobId: string;
  sceneId: string;
  status: JobStatus;
  currentLevel: ProductLevel | null;
  currentTargetCsc: TargetCsc | null;
  retryCount: number;
  startedAt: string;
  updatedAt: string;
}

export interface PipelineStep {
  order: number;
  parentOrder?: number | null;
  targetCsc: TargetCsc;
  productLevel: ProductLevel;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  outputPath?: string;
}

export interface JobDetail extends JobSummary {
  steps: PipelineStep[];
  acquisitionStart: string;
  acquisitionEnd: string;
  receivedAt: string;
  satelliteId: string;
  mode: string;
  rawDataPath: string;
}

export interface Alert {
  id: string;
  jobId: string;
  kind: AlertKind;
  message: string;
  acknowledged: boolean;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

export interface AuditEvent {
  id: string;
  eventType: AuditEventType;
  jobId: string;
  timestamp: string;
  detail: string;
  operatorId?: string;
}

export interface QueueHealth {
  queue: string;
  depth: number;
  oldestMessageAge: number;
  consumers: number;
  healthy: boolean;
}

export interface PipelineStepDefinition {
  order: number;
  targetCsc: TargetCsc;
  productLevel: ProductLevel;
  parentOrder?: number | null; // null = root, number = branches from that step
}

export interface PipelineEdge {
  source: number; // step order
  target: number; // step order
}

export interface PipelineDefinition {
  id: string;
  name: string;
  satelliteId: string;
  mode: string;
  steps: PipelineStepDefinition[];
  edges: PipelineEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePipelineData {
  name: string;
  satelliteId: string;
  mode: string;
  steps: Omit<PipelineStepDefinition, 'order'>[];
  edges?: PipelineEdge[];
}

export interface UpdatePipelineData {
  name?: string;
  satelliteId?: string;
  mode?: string;
  steps?: Omit<PipelineStepDefinition, 'order'>[];
  edges?: PipelineEdge[];
}

export interface ProcessingProfile {
  id: string;
  satelliteId: string;
  mode: string;
  polarization: string;
  parameters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// --- Service Response ---

export interface ServiceResponse {
  success: boolean;
  message: string;
}

export interface ServiceResponseWithData<T> extends ServiceResponse {
  data?: T;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  nextCursor?: string;
}

// --- Dashboard Stats ---

export interface DashboardStats {
  inflightJobs: number;
  completedLast24h: number;
  failedLast24h: number;
  avgProcessingTimeMs: number;
  unacknowledgedAlerts: number;
}
