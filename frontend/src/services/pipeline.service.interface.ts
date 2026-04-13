import type {
  Alert,
  AuditEvent,
  CreatePipelineData,
  DashboardStats,
  JobDetail,
  JobSummary,
  PaginatedResponse,
  PipelineDefinition,
  QueueHealth,
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

  Job을_취소한다(jobId: string): Promise<ServiceResponse>;

  // =========================================================================
  // Alerts
  // =========================================================================

  Alert_목록을_조회한다(params?: {
    acknowledged?: boolean;
  }): Promise<ServiceResponseWithData<Alert[]>>;

  Alert을_확인한다(alertId: string): Promise<ServiceResponse>;

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
}
