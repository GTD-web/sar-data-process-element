import type {
  Alert,
  AuditEvent,
  CreatePipelineData,
  DashboardStats,
  ExecutionLog,
  JobDetail,
  JobSummary,
  PaginatedResponse,
  PipelineDefinition,
  ProcessingProfile,
  QueueHealth,
  SarStage,
  ServiceResponse,
  ServiceResponseWithData,
  UpdatePipelineData,
} from '@/types/pipeline';

/**
 * Pipeline UI Service Interface
 *
 * Mock과 Current 환경 모두에서 동일한 인터페이스 사용.
 * UI에서 실제로 사용하는 응답 형태만 정의.
 */
export interface IPipelineUIService {
  // =========================================================================
  // Dashboard
  // =========================================================================

  대시보드_통계를_조회한다(): Promise<ServiceResponseWithData<DashboardStats>>;

  // =========================================================================
  // Jobs
  // =========================================================================

  Job_목록을_조회한다(params?: {
    status?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: number;
  }): Promise<ServiceResponseWithData<PaginatedResponse<JobSummary>>>;

  Job_상세를_조회한다(jobId: string): Promise<ServiceResponseWithData<JobDetail>>;

  Job을_재처리한다(
    jobId: string,
    targetLevel?: string,
  ): Promise<ServiceResponse>;

  /** OPS-06: 특정 SAR 스테이지부터 부분 재처리 요청 (SI-07) */
  부분_재처리를_요청한다(
    jobId: string,
    params: { sarStage: SarStage },
  ): Promise<ServiceResponse>;

  Job을_취소한다(jobId: string): Promise<ServiceResponse>;

  // =========================================================================
  // Alerts
  // =========================================================================

  Alert_목록을_조회한다(params?: {
    acknowledged?: boolean;
  }): Promise<ServiceResponseWithData<Alert[]>>;

  /** S-03: ifMatchVersion 전달 시 If-Match 헤더 동반 — 409 충돌 감지 */
  Alert을_확인한다(alertId: string, options?: { ifMatchVersion?: number }): Promise<ServiceResponse>;

  // =========================================================================
  // Audit
  // =========================================================================

  감사로그를_조회한다(params?: {
    jobId?: string;
    from?: string;
    to?: string;
    page?: number;
    size?: number;
  }): Promise<ServiceResponseWithData<PaginatedResponse<AuditEvent>>>;

  // =========================================================================
  // Queue Health
  // =========================================================================

  큐_상태를_조회한다(): Promise<ServiceResponseWithData<QueueHealth[]>>;

  // =========================================================================
  // Pipelines
  // =========================================================================

  파이프라인_목록을_조회한다(): Promise<ServiceResponseWithData<PipelineDefinition[]>>;

  파이프라인을_조회한다(id: string): Promise<ServiceResponseWithData<PipelineDefinition>>;

  파이프라인을_생성한다(data: CreatePipelineData): Promise<ServiceResponseWithData<PipelineDefinition>>;

  파이프라인을_수정한다(id: string, data: UpdatePipelineData): Promise<ServiceResponseWithData<PipelineDefinition>>;

  파이프라인을_삭제한다(id: string): Promise<ServiceResponse>;

  /** EI-01: 파이프라인 수동 실행 (테스트/운영). 새 Job을 생성하여 파이프라인을 기동합니다. */
  파이프라인을_실행한다(pipelineId: string): Promise<ServiceResponseWithData<JobSummary>>;

  // =========================================================================
  // Processing Profiles
  // =========================================================================

  /** CSU-08.02: 처리 프로파일 목록 조회. satelliteId + mode로 필터링 가능. */
  처리_프로파일_목록을_조회한다(params?: {
    satelliteId?: string;
    mode?: string;
  }): Promise<ServiceResponseWithData<ProcessingProfile[]>>;

  // =========================================================================
  // Execution Logs
  // =========================================================================

  /** 파이프라인 실행 로그 조회. jobId로 필터링 가능. */
  실행_로그를_조회한다(params?: {
    jobId?: string;
    level?: string;
    limit?: number;
  }): Promise<ServiceResponseWithData<ExecutionLog[]>>;
}
