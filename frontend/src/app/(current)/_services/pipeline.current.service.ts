/**
 * Pipeline Current Service (Current 환경)
 *
 * 실제 백엔드 API와 연결되는 서비스 구현체.
 * TODO: API route handler 연결 시 각 메서드를 실제 fetch 호출로 교체.
 */

import type { IPipelineUIService } from '@/services/pipeline.service.interface';
import type {
  Alert,
  AuditEvent,
  AuditEventType,
  CreatePipelineData,
  DashboardStats,
  ExecutionLog,
  JobDetail,
  JobSummary,
  PaginatedResponse,
  PipelineActivationRule,
  PipelineDefinition,
  ProcessingProfile,
  Product,
  QueueHealth,
  SarStage,
  ServiceResponse,
  ServiceResponseWithData,
  UpdatePipelineData,
} from '@/types/pipeline';
import { SAR_STAGE_TO_CSC, SAR_STAGE_TO_LEVEL } from '@/types/pipeline';
import type {
  CreateUserRequest,
  Session,
  UpdateUserRequest,
  User,
  UserListQuery,
} from '@/types/user';

const API_BASE = '/api/pipeline';
const AUTH_BASE = '/api/auth';
const ADMIN_BASE = '/api/admin';

async function handleResponse<T>(res: Response, errorMsg: string): Promise<ServiceResponseWithData<T>> {
  if (!res.ok) {
    return { success: false, message: `${errorMsg}: ${res.status}` };
  }
  const data = (await res.json()) as T;
  return { success: true, message: 'OK', data };
}

export const pipelineCurrentService: IPipelineUIService = {
  async 대시보드_통계를_조회한다(): Promise<ServiceResponseWithData<DashboardStats>> {
    const res = await fetch(`${API_BASE}/dashboard/stats`);
    return handleResponse(res, '대시보드 통계 조회 실패');
  },

  async Job_목록을_조회한다(params?: {
    status?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: number;
  }): Promise<ServiceResponseWithData<PaginatedResponse<JobSummary>>> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const res = await fetch(`${API_BASE}/jobs?${query}`);
    return handleResponse(res, 'Job 목록 조회 실패');
  },

  async Job_상세를_조회한다(jobId: string): Promise<ServiceResponseWithData<JobDetail>> {
    const res = await fetch(`${API_BASE}/jobs/${jobId}`);
    return handleResponse(res, 'Job 상세 조회 실패');
  },

  async Job을_재처리한다(jobId: string, targetLevel?: string): Promise<ServiceResponse> {
    const res = await fetch(`${API_BASE}/jobs/${jobId}/reprocess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLevel }),
    });
    if (!res.ok) return { success: false, message: `Job 재처리 실패: ${res.status}` };
    return { success: true, message: 'OK' };
  },

  async 부분_재처리를_요청한다(jobId: string, params: { sarStage: SarStage }): Promise<ServiceResponse> {
    // 백엔드 호환을 위해 sarStage에서 targetCsc/targetLevel 파생
    const targetCsc = SAR_STAGE_TO_CSC[params.sarStage];
    const targetLevel = SAR_STAGE_TO_LEVEL[params.sarStage];
    const res = await fetch(`${API_BASE}/jobs/${jobId}/reprocess/partial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sarStage: params.sarStage, targetLevel, targetCsc }),
    });
    if (!res.ok) return { success: false, message: `부분 재처리 실패: ${res.status}` };
    return { success: true, message: 'OK' };
  },

  async Job을_취소한다(jobId: string): Promise<ServiceResponse> {
    const res = await fetch(`${API_BASE}/jobs/${jobId}/cancel`, { method: 'POST' });
    if (!res.ok) return { success: false, message: `Job 취소 실패: ${res.status}` };
    return { success: true, message: 'OK' };
  },

  async Alert_목록을_조회한다(params?: {
    acknowledged?: boolean;
  }): Promise<ServiceResponseWithData<Alert[]>> {
    const query = new URLSearchParams();
    if (params?.acknowledged !== undefined) query.set('acknowledged', String(params.acknowledged));
    const res = await fetch(`${API_BASE}/alerts?${query}`);
    return handleResponse(res, 'Alert 목록 조회 실패');
  },

  async Alert을_확인한다(alertId: string, options?: { ifMatchVersion?: number }): Promise<ServiceResponse> {
    const headers: HeadersInit = {};
    if (options?.ifMatchVersion !== undefined) headers['If-Match'] = String(options.ifMatchVersion);
    const res = await fetch(`${API_BASE}/alerts/${alertId}/acknowledge`, { method: 'POST', headers });
    if (!res.ok) return { success: false, message: `Alert 확인 실패: ${res.status}`, code: res.status };
    return { success: true, message: 'OK' };
  },

  async 감사로그를_조회한다(params?: {
    jobId?: string;
    eventType?: AuditEventType;
    from?: string;
    to?: string;
    page?: number;
    size?: number;
    sortBy?: keyof AuditEvent;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ServiceResponseWithData<PaginatedResponse<AuditEvent>>> {
    const query = new URLSearchParams();
    if (params?.jobId) query.set('jobId', params.jobId);
    if (params?.eventType) query.set('eventType', params.eventType);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.page) query.set('page', String(params.page));
    if (params?.size) query.set('size', String(params.size));
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    if (params?.sortOrder) query.set('sortOrder', params.sortOrder);
    const res = await fetch(`${API_BASE}/audit?${query}`);
    return handleResponse(res, '감사로그 조회 실패');
  },

  async 큐_상태를_조회한다(): Promise<ServiceResponseWithData<QueueHealth[]>> {
    const res = await fetch(`${API_BASE}/queues/health`);
    return handleResponse(res, '큐 상태 조회 실패');
  },

  async 파이프라인_목록을_조회한다(): Promise<ServiceResponseWithData<PipelineDefinition[]>> {
    const res = await fetch(`${API_BASE}/pipelines`);
    return handleResponse(res, '파이프라인 목록 조회 실패');
  },

  async 아카이브_파이프라인_목록을_조회한다(): Promise<ServiceResponseWithData<PipelineDefinition[]>> {
    const res = await fetch(`${API_BASE}/pipelines?archived=true`);
    return handleResponse(res, '아카이브 파이프라인 목록 조회 실패');
  },

  async 파이프라인을_조회한다(id: string): Promise<ServiceResponseWithData<PipelineDefinition>> {
    const res = await fetch(`${API_BASE}/pipelines/${id}`);
    return handleResponse(res, '파이프라인 조회 실패');
  },

  async 파이프라인을_생성한다(data: CreatePipelineData): Promise<ServiceResponseWithData<PipelineDefinition>> {
    const res = await fetch(`${API_BASE}/pipelines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res, '파이프라인 생성 실패');
  },

  async 파이프라인을_수정한다(id: string, data: UpdatePipelineData): Promise<ServiceResponseWithData<PipelineDefinition>> {
    const res = await fetch(`${API_BASE}/pipelines/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res, '파이프라인 수정 실패');
  },

  async 파이프라인을_삭제한다(id: string): Promise<ServiceResponse> {
    const res = await fetch(`${API_BASE}/pipelines/${id}`, { method: 'DELETE' });
    if (!res.ok) return { success: false, message: `파이프라인 삭제 실패: ${res.status}` };
    return { success: true, message: 'OK' };
  },

  async 파이프라인을_복제한다(id: string): Promise<ServiceResponseWithData<PipelineDefinition>> {
    const res = await fetch(`${API_BASE}/pipelines/${id}/duplicate`, { method: 'POST' });
    return handleResponse(res, '파이프라인 복제 실패');
  },

  async 파이프라인을_아카이브한다(id: string, archived: boolean): Promise<ServiceResponse> {
    const res = await fetch(`${API_BASE}/pipelines/${id}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
    if (!res.ok) return { success: false, message: `아카이브 처리 실패: ${res.status}` };
    return { success: true, message: 'OK' };
  },

  async 파이프라인을_실행한다(pipelineId: string): Promise<ServiceResponseWithData<JobSummary>> {
    const res = await fetch(`${API_BASE}/pipelines/${pipelineId}/execute`, { method: 'POST' });
    return handleResponse(res, '파이프라인 실행 실패');
  },

  async 파이프라인_자동실행규칙을_조회한다(pipelineId?: string): Promise<ServiceResponseWithData<PipelineActivationRule[]>> {
    const query = new URLSearchParams();
    if (pipelineId) query.set('pipelineId', pipelineId);
    const res = await fetch(`${API_BASE}/pipeline-activation-rules?${query}`);
    return handleResponse(res, '파이프라인 자동 실행 규칙 조회 실패');
  },

  async 파이프라인_배포상태를_변경한다(
    pipelineId: string,
    active: boolean,
  ): Promise<ServiceResponseWithData<PipelineActivationRule>> {
    const res = await fetch(`${API_BASE}/pipeline-activation-rules/${pipelineId}/deployment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    return handleResponse(res, '파이프라인 배포 상태 변경 실패');
  },

  async 처리_프로파일_목록을_조회한다(params?: {
    satelliteId?: string;
    mode?: string;
  }): Promise<ServiceResponseWithData<ProcessingProfile[]>> {
    const query = new URLSearchParams();
    if (params?.satelliteId) query.set('satelliteId', params.satelliteId);
    if (params?.mode) query.set('mode', params.mode);
    const res = await fetch(`${API_BASE}/profiles?${query}`);
    return handleResponse(res, '처리 프로파일 조회 실패');
  },

  async 처리_프로파일을_생성한다(data: Omit<ProcessingProfile, 'id' | 'createdAt' | 'updatedAt' | 'referencedPipelineCount'>): Promise<ServiceResponseWithData<ProcessingProfile>> {
    const res = await fetch(`${API_BASE}/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res, '처리 프로파일 생성 실패');
  },

  async 처리_프로파일을_수정한다(id: string, data: Partial<Omit<ProcessingProfile, 'id' | 'createdAt' | 'updatedAt' | 'referencedPipelineCount'>>): Promise<ServiceResponseWithData<ProcessingProfile>> {
    const res = await fetch(`${API_BASE}/profiles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res, '처리 프로파일 수정 실패');
  },

  async 처리_프로파일을_삭제한다(id: string): Promise<ServiceResponse> {
    const res = await fetch(`${API_BASE}/profiles/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { success: false, message: (body as { message?: string })?.message ?? `처리 프로파일 삭제 실패: ${res.status}` };
    }
    return { success: true, message: 'OK' };
  },

  async 제품_목록을_조회한다(params?: {
    level?: string;
    satelliteId?: string;
    mode?: string;
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<ServiceResponseWithData<PaginatedResponse<Product>>> {
    const query = new URLSearchParams();
    if (params?.level) query.set('level', params.level);
    if (params?.satelliteId) query.set('satelliteId', params.satelliteId);
    if (params?.mode) query.set('mode', params.mode);
    if (params?.status) query.set('status', params.status);
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const res = await fetch(`${API_BASE}/products?${query}`);
    return handleResponse(res, '제품 목록 조회 실패');
  },

  async 제품_상세를_조회한다(productId: string): Promise<ServiceResponseWithData<Product>> {
    const res = await fetch(`${API_BASE}/products/${productId}`);
    return handleResponse(res, '제품 상세 조회 실패');
  },

  async 제품_다운로드_URL을_발급한다(productId: string): Promise<ServiceResponseWithData<{ url: string; expiresIn: number }>> {
    const res = await fetch(`${API_BASE}/products/${productId}/download-url`);
    return handleResponse(res, '다운로드 URL 발급 실패');
  },

  async 제품_재처리를_요청한다(productId: string, params: { targetLevel: string }): Promise<ServiceResponseWithData<{ jobId: string }>> {
    const res = await fetch(`${API_BASE}/products/${productId}/reprocess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse(res, '제품 재처리 요청 실패');
  },

  async 실행_로그를_조회한다(params?: {
    jobId?: string;
    level?: string;
    limit?: number;
  }): Promise<ServiceResponseWithData<ExecutionLog[]>> {
    const query = new URLSearchParams();
    if (params?.jobId) query.set('jobId', params.jobId);
    if (params?.level) query.set('level', params.level);
    if (params?.limit) query.set('limit', String(params.limit));
    const res = await fetch(`${API_BASE}/logs?${query}`);
    return handleResponse(res, '실행 로그 조회 실패');
  },

  // =========================================================================
  // Auth (UC43~UC46)
  // =========================================================================

  async 로그인한다(req: { username: string; password: string }): Promise<ServiceResponseWithData<Session>> {
    const res = await fetch(`${AUTH_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      credentials: 'include',
    });
    return handleResponse(res, '로그인 실패');
  },

  async 로그아웃한다(): Promise<ServiceResponse> {
    const res = await fetch(`${AUTH_BASE}/logout`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return { success: false, message: `로그아웃 실패: ${res.status}` };
    return { success: true, message: 'OK' };
  },

  async 토큰을_갱신한다(): Promise<ServiceResponseWithData<Session>> {
    const res = await fetch(`${AUTH_BASE}/refresh`, { method: 'POST', credentials: 'include' });
    return handleResponse(res, '토큰 갱신 실패');
  },

  async 본인_비밀번호를_변경한다(req: {
    currentPassword: string;
    newPassword: string;
  }): Promise<ServiceResponse> {
    const res = await fetch(`${AUTH_BASE}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      credentials: 'include',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { success: false, message: (body as { message?: string })?.message ?? `비밀번호 변경 실패: ${res.status}` };
    }
    return { success: true, message: '비밀번호가 변경되었습니다' };
  },

  async 현재_사용자를_조회한다(): Promise<ServiceResponseWithData<User>> {
    const res = await fetch(`${AUTH_BASE}/me`, { credentials: 'include' });
    return handleResponse(res, '현재 사용자 조회 실패');
  },

  // =========================================================================
  // User Management (UC47~UC50)
  // =========================================================================

  async 사용자목록을_조회한다(params?: UserListQuery): Promise<ServiceResponseWithData<PaginatedResponse<User>>> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.role) query.set('role', params.role);
    if (params?.active === true) query.set('active', 'true');
    if (params?.active === false) query.set('active', 'false');
    if (params?.page) query.set('page', String(params.page));
    if (params?.size) query.set('size', String(params.size));
    if (params?.sortBy) query.set('sortBy', String(params.sortBy));
    if (params?.sortOrder) query.set('sortOrder', params.sortOrder);
    const res = await fetch(`${ADMIN_BASE}/users?${query}`, { credentials: 'include' });
    return handleResponse(res, '사용자 목록 조회 실패');
  },

  async 사용자를_생성한다(req: CreateUserRequest): Promise<ServiceResponseWithData<User>> {
    const res = await fetch(`${ADMIN_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      credentials: 'include',
    });
    return handleResponse(res, '사용자 생성 실패');
  },

  async 사용자를_수정한다(id: string, req: UpdateUserRequest): Promise<ServiceResponseWithData<User>> {
    const res = await fetch(`${ADMIN_BASE}/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      credentials: 'include',
    });
    return handleResponse(res, '사용자 수정 실패');
  },

  async 사용자_비밀번호를_초기화한다(id: string): Promise<ServiceResponseWithData<{ temporaryPassword: string }>> {
    const res = await fetch(`${ADMIN_BASE}/users/${id}/password-reset`, {
      method: 'POST',
      credentials: 'include',
    });
    return handleResponse(res, '비밀번호 초기화 실패');
  },
};
