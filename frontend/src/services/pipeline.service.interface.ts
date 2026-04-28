import type {
  Alert,
  AuditEvent,
  AuditEventType,
  CreatePipelineData,
  DashboardStats,
  Hdf5FileSummary,
  ExecutionLog,
  JobDetail,
  JobSummary,
  PaginatedResponse,
  PipelineActivationRule,
  PipelineDefinition,
  ProcessingProfile,
  Product,
  RawDataSummary,
  QueueHealth,
  SarStage,
  ServiceResponse,
  ServiceResponseWithData,
  UpdatePipelineData,
} from '@/types/pipeline';
import type {
  CreateUserRequest,
  Session,
  UpdateUserRequest,
  User,
  UserListQuery,
} from '@/types/user';

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
  // Raw Data
  // =========================================================================

  원시데이터_목록을_조회한다(params?: {
    satelliteId?: string;
    mode?: string;
    mapped?: boolean;
    limit?: number;
  }): Promise<ServiceResponseWithData<PaginatedResponse<RawDataSummary>>>;

  원시데이터_파이프라인을_매핑한다(rawDataId: string, pipelineId: string | null): Promise<ServiceResponseWithData<RawDataSummary>>;

  HDF5_애트리뷰트_목록을_조회한다(params?: {
    rawDataId?: string;
  }): Promise<ServiceResponseWithData<Hdf5FileSummary[]>>;

  HDF5_파일을_업로드한다(file: File, rawDataId?: string): Promise<ServiceResponseWithData<Hdf5FileSummary>>;

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
    eventType?: AuditEventType;
    from?: string;
    to?: string;
    page?: number;
    size?: number;
    sortBy?: keyof AuditEvent;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ServiceResponseWithData<PaginatedResponse<AuditEvent>>>;

  // =========================================================================
  // Queue Health
  // =========================================================================

  큐_상태를_조회한다(): Promise<ServiceResponseWithData<QueueHealth[]>>;

  // =========================================================================
  // Pipelines
  // =========================================================================

  파이프라인_목록을_조회한다(): Promise<ServiceResponseWithData<PipelineDefinition[]>>;

  아카이브_파이프라인_목록을_조회한다(): Promise<ServiceResponseWithData<PipelineDefinition[]>>;

  파이프라인을_조회한다(id: string): Promise<ServiceResponseWithData<PipelineDefinition>>;

  파이프라인을_생성한다(data: CreatePipelineData): Promise<ServiceResponseWithData<PipelineDefinition>>;

  파이프라인을_수정한다(id: string, data: UpdatePipelineData): Promise<ServiceResponseWithData<PipelineDefinition>>;

  파이프라인을_삭제한다(id: string): Promise<ServiceResponse>;

  /** 파이프라인 복제. 이름에 "(복사)" 접미사 추가. */
  파이프라인을_복제한다(id: string): Promise<ServiceResponseWithData<PipelineDefinition>>;

  /** 파이프라인 아카이브/복원 토글. 아카이브 시 폐기 사유를 함께 저장한다. */
  파이프라인을_아카이브한다(id: string, archived: boolean, archiveReason?: string): Promise<ServiceResponse>;

  /** EI-01: 파이프라인 수동 실행 (테스트/운영). 새 Job을 생성하여 파이프라인을 기동합니다. */
  파이프라인을_실행한다(pipelineId: string): Promise<ServiceResponseWithData<JobSummary>>;

  /** 배포된 파이프라인 자동 실행 규칙. pgmq 이벤트 수신 후 백엔드가 이 매핑으로 실행 대상을 결정한다. */
  파이프라인_자동실행규칙을_조회한다(pipelineId?: string): Promise<ServiceResponseWithData<PipelineActivationRule[]>>;

  /** 파이프라인 배포/배포 해제. 배포된 경우에만 pgmq 이벤트 매칭 후 자동 실행된다. */
  파이프라인_배포상태를_변경한다(pipelineId: string, active: boolean): Promise<ServiceResponseWithData<PipelineActivationRule>>;

  // =========================================================================
  // Processing Profiles
  // =========================================================================

  /** CSU-08.02: 처리 프로파일 목록 조회. satelliteId + mode로 필터링 가능. */
  처리_프로파일_목록을_조회한다(params?: {
    satelliteId?: string;
    mode?: string;
  }): Promise<ServiceResponseWithData<ProcessingProfile[]>>;

  /** 처리 프로파일 생성 (Admin only) */
  처리_프로파일을_생성한다(data: Omit<ProcessingProfile, 'id' | 'createdAt' | 'updatedAt' | 'referencedPipelineCount'>): Promise<ServiceResponseWithData<ProcessingProfile>>;

  /** 처리 프로파일 수정 (Admin only) */
  처리_프로파일을_수정한다(id: string, data: Partial<Omit<ProcessingProfile, 'id' | 'createdAt' | 'updatedAt' | 'referencedPipelineCount'>>): Promise<ServiceResponseWithData<ProcessingProfile>>;

  /** 처리 프로파일 삭제 (Admin only). 참조 파이프라인이 있으면 실패. */
  처리_프로파일을_삭제한다(id: string): Promise<ServiceResponse>;

  // =========================================================================
  // Products
  // =========================================================================

  /** 제품 목록 조회 (UC27) */
  제품_목록을_조회한다(params?: {
    rawDataId?: string;
    level?: string;
    satelliteId?: string;
    mode?: string;
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<ServiceResponseWithData<PaginatedResponse<Product>>>;

  /** 제품 상세 조회 (UC28) */
  제품_상세를_조회한다(productId: string): Promise<ServiceResponseWithData<Product>>;

  /** 제품 다운로드 URL 발급 (UC30) */
  제품_다운로드_URL을_발급한다(productId: string): Promise<ServiceResponseWithData<{ url: string; expiresIn: number }>>;

  /** 제품 기반 재처리 요청 (UC32) */
  제품_재처리를_요청한다(productId: string, params: { targetLevel: string }): Promise<ServiceResponseWithData<{ jobId: string }>>;

  // =========================================================================
  // Execution Logs
  // =========================================================================

  /** 파이프라인 실행 로그 조회. jobId로 필터링 가능. */
  실행_로그를_조회한다(params?: {
    jobId?: string;
    level?: string;
    limit?: number;
  }): Promise<ServiceResponseWithData<ExecutionLog[]>>;

  // =========================================================================
  // Auth (UC43~UC46)
  // =========================================================================

  로그인한다(req: { username: string; password: string }): Promise<ServiceResponseWithData<Session>>;

  로그아웃한다(): Promise<ServiceResponse>;

  토큰을_갱신한다(): Promise<ServiceResponseWithData<Session>>;

  본인_비밀번호를_변경한다(req: {
    currentPassword: string;
    newPassword: string;
  }): Promise<ServiceResponse>;

  현재_사용자를_조회한다(): Promise<ServiceResponseWithData<User>>;

  // =========================================================================
  // User Management — Administrator only (UC47~UC50)
  // =========================================================================

  사용자목록을_조회한다(params?: UserListQuery): Promise<ServiceResponseWithData<PaginatedResponse<User>>>;

  사용자를_생성한다(req: CreateUserRequest): Promise<ServiceResponseWithData<User>>;

  사용자를_수정한다(id: string, req: UpdateUserRequest): Promise<ServiceResponseWithData<User>>;

  사용자_비밀번호를_초기화한다(id: string): Promise<ServiceResponseWithData<{ temporaryPassword: string }>>;
}
