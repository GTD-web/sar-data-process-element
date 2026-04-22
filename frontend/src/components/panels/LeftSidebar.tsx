'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import type { PipelineDefinition, JobSummary, JobStatus } from '@/types/pipeline';
import { JobStatusBadge } from '@/components/ui/StatusBadge';
import { RolePreviewSelect, useMockRole } from '@/components/auth/RolePreviewSelect';
import PasswordChangeModal from '@/components/auth/PasswordChangeModal';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import { toast } from '@/components/ui/Toast';
import { useTheme } from '@/lib/theme';
import {
  Activity, GitBranch, Plus, PanelLeftClose, PanelLeftOpen,
  Settings, User, Bell, Trash2, ChevronDown, Briefcase,
  LayoutDashboard, Layers, Archive, Package, FileText, Antenna,
  Users as UsersIcon, KeyRound, LogOut, Radio, Sun, Moon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LeftSidebarBaseProps {
  collapsed: boolean;
  onToggle: () => void;
  /** 현재 활성 페이지 (nav highlight용) */
  activePage?: 'home' | 'raw-data' | 'console' | 'deployed' | 'jobs' | 'queues' | 'archive' | 'profiles' | 'products' | 'alerts' | 'audit' | 'users' | 'settings';
}

interface LeftSidebarConsoleProps extends LeftSidebarBaseProps {
  mode?: 'console';
  pipelines: PipelineDefinition[];
  selectedPipelineId: string | null;
  onSelectPipeline: (id: string) => void;
  onCreatePipeline: () => void;
  onDeletePipeline: (id: string) => void;
  canManagePipelines?: boolean;
  pipelineJobs?: JobSummary[];
  selectedJobId?: string | null;
  onSelectJob?: (jobId: string) => void;
}

interface LeftSidebarJobsProps extends LeftSidebarBaseProps {
  mode: 'jobs';
  pipelines: PipelineDefinition[];
  jobs: JobSummary[];
  selectedJobId: string | null;
  onSelectJob: (jobId: string) => void;
  statusFilter?: JobStatus | '';
  onStatusFilterChange?: (status: JobStatus | '') => void;
  page?: number;
  totalPages?: number;
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  totalJobs?: number;
  pageStart?: number;
  pageEnd?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

interface LeftSidebarNavProps extends LeftSidebarBaseProps {
  mode: 'nav';
  /** 아카이브 페이지용: 아카이브된 파이프라인 목록 */
  archivePipelines?: PipelineDefinition[];
  selectedArchiveId?: string | null;
  onSelectArchive?: (id: string) => void;
}

type LeftSidebarProps = LeftSidebarConsoleProps | LeftSidebarJobsProps | LeftSidebarNavProps;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LeftSidebar(props: LeftSidebarProps) {
  const { collapsed, onToggle, activePage, mode = 'console' } = props;
  const pathname = usePathname();
  const router = useRouter();
  const base = pathname.startsWith('/current') ? '/current' : '/plan';

  const [pipelinesOpen, setPipelinesOpen] = useState(true);
  const [jobsOpen, setJobsOpen] = useState(true);
  const [pipelineJobsOpen, setPipelineJobsOpen] = useState(true);
  const [navArchiveOpen, setNavArchiveOpen] = useState(true);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [mockRole, setMockRole] = useMockRole();
  const service = usePipelineService();
  const { theme, toggle: toggleTheme } = useTheme();
  const canSeeUsers = mockRole === 'Administrator';
  const mockUsername = mockRole === 'Administrator' ? 'admin' : 'operator-01';

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!profileRef.current?.contains(e.target as Node)) setProfileMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [profileMenuOpen]);

  const handleLogout = async () => {
    setProfileMenuOpen(false);
    const res = await service.로그아웃한다();
    if (res.success) toast.success('로그아웃되었습니다');
    router.push('/login');
  };

  const isConsole = mode === 'console';
  const isJobs = mode === 'jobs';
  const isNav = mode === 'nav';
  const consolePl = isConsole ? (props as LeftSidebarConsoleProps) : null;
  const jobsPl = isJobs ? (props as LeftSidebarJobsProps) : null;
  const navProps = isNav ? (props as LeftSidebarNavProps) : null;
  const activeJobCount = jobsPl?.jobs.filter((j) => j.status === 'ASSIGNED' || j.status === 'CREATED').length ?? 0;
  const pipelineNameById = new Map(
    (isConsole ? consolePl?.pipelines ?? [] : jobsPl?.pipelines ?? []).map((pipeline) => [pipeline.id, pipeline.name]),
  );

  const navItems: { id: NonNullable<LeftSidebarBaseProps['activePage']>; icon: React.ElementType; label: string; href: string; adminOnly?: boolean }[] = [
    { id: 'home', icon: LayoutDashboard, label: '대시보드', href: base },
    { id: 'raw-data', icon: Antenna, label: 'Raw Data 목록', href: `${base}/raw-data` },
    { id: 'console', icon: GitBranch, label: '파이프라인 관리', href: `${base}/console` },
    { id: 'products', icon: Package, label: 'Production 목록', href: `${base}/products` },
    { id: 'queues', icon: Layers, label: '시스템 운영 모니터링', href: `${base}/queues` },
    { id: 'alerts', icon: Bell, label: '알림', href: `${base}/alerts` },
    { id: 'audit', icon: FileText, label: '감사 로그', href: `${base}/audit`, adminOnly: true },
    { id: 'users', icon: UsersIcon, label: '사용자 관리', href: `${base}/users`, adminOnly: true },
  ];
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || canSeeUsers);
  const executionActive = activePage === 'deployed' || activePage === 'jobs';
  const jobStatusLabels: Record<JobStatus, string> = {
    CREATED: '대기',
    ASSIGNED: '실행 중',
    COMPLETED: '완료',
    FAILED: '실패',
    CANCELED: '취소',
  };
  const jobStatuses = Object.keys(jobStatusLabels) as JobStatus[];

  return (
    <div
      className={cn(
        'h-full bg-card border-r border-border flex flex-col transition-all duration-200 flex-shrink-0 z-20',
        collapsed ? 'w-12' : 'w-56',
      )}
    >
      {/* Header */}
      <div className="h-11 flex items-center gap-1.5 px-2 border-b border-border flex-shrink-0">
        {collapsed ? (
          <button onClick={onToggle} className="mx-auto p-1.5 rounded-md hover:bg-muted/50 transition-colors">
            <PanelLeftOpen className="w-4 h-4 text-muted-foreground" />
          </button>
        ) : (
          <>
            <a href={base} className="flex items-center gap-1.5 flex-1 min-w-0">
              <Activity className="w-5 h-5 text-accent flex-shrink-0" />
              <span className="text-xs font-bold text-foreground tracking-tight truncate">SDPE DAG</span>
            </a>
            {isConsole && consolePl && consolePl.canManagePipelines !== false && (
              <button onClick={consolePl.onCreatePipeline} className="p-1.5 rounded-md hover:bg-muted/50 transition-colors" title="새 파이프라인">
                <Plus className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
            <button onClick={onToggle} className="p-1.5 rounded-md hover:bg-muted/50 transition-colors" title="사이드바 닫기">
              <PanelLeftClose className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </>
        )}
      </div>

      {collapsed ? (
        /* ── Collapsed icons ── */
        <div className="flex-1 min-h-0 flex flex-col items-center py-2">
          <div className="flex-1 flex flex-col items-center gap-1">
            {visibleNavItems.map((item) => (
              <div key={item.id} className="contents">
                <a
                  href={item.href}
                  className={cn(
                    'p-2 rounded-md transition-colors',
                    activePage === item.id ? 'bg-accent/10 text-accent' : 'hover:bg-muted/50 text-muted-foreground',
                  )}
                  title={item.label}
                >
                  <item.icon className="w-4 h-4" />
                </a>
                {item.id === 'console' && (
                  <a
                    href={`${base}/deployed?tab=auto`}
                    className={cn(
                      'p-2 rounded-md transition-colors',
                      executionActive ? 'bg-accent/10 text-accent' : 'hover:bg-muted/50 text-muted-foreground',
                    )}
                    title="파이프라인 실행 관리"
                  >
                    <Radio className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-md text-muted-foreground hover:bg-muted/50 transition-colors"
            title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            aria-label="테마 전환"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      ) : (
        /* ── Expanded content ── */
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          {/* Navigation */}
          <div className="px-2 py-2 border-b border-border space-y-0.5">
            {visibleNavItems.map((item) => (
              <div key={item.id}>
                <a
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors',
                    activePage === item.id
                      ? 'bg-accent/10 text-accent'
                      : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                  )}
                >
                  <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="leading-4 break-words">{item.label}</span>
                </a>
                {item.id === 'console' && (
                  <div className="pt-1">
                    <a
                      href={`${base}/deployed?tab=auto`}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors',
                        executionActive
                          ? 'bg-accent/10 text-accent'
                          : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                      )}
                    >
                      <Radio className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="leading-4 break-words">파이프라인 실행 관리</span>
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Console mode: 파이프라인 섹션만 ── */}
          {isConsole && consolePl && (
            <div className="border-b border-border">
              <button
                onClick={() => setPipelinesOpen((v) => !v)}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/20 transition-colors"
              >
                <ChevronDown className={cn('w-3 h-3 transition-transform', !pipelinesOpen && '-rotate-90')} />
                <GitBranch className="w-3 h-3" />
                <span className="flex-1 text-left">파이프라인</span>
                <span className="text-[9px] font-mono font-normal normal-case">{consolePl.pipelines.length}</span>
              </button>
              {pipelinesOpen && (
                <div className="px-1.5 pb-2">
                  <div className="space-y-0.5">
                    {consolePl.pipelines.map((pl) => (
                      <div
                        key={pl.id}
                        className={cn(
                          'group flex items-center rounded-md text-[11px] transition-colors',
                          consolePl.selectedPipelineId === pl.id
                            ? 'bg-accent/10 text-accent'
                            : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                        )}
                      >
                        <button
                          onClick={() => consolePl.onSelectPipeline(pl.id)}
                          className="flex-1 min-w-0 text-left px-2 py-1.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <GitBranch className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{pl.name}</span>
                          </div>
                        </button>
                        {consolePl.canManagePipelines !== false && (
                          <button
                            onClick={(e) => { e.stopPropagation(); consolePl.onDeletePipeline(pl.id); }}
                            className="flex-shrink-0 p-1 mr-1 rounded opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                            title="파이프라인 폐기"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Console mode: selected pipeline jobs ── */}
          {isConsole && consolePl && consolePl.pipelineJobs && (
            <div className="border-b border-border">
              <button
                onClick={() => setPipelineJobsOpen((v) => !v)}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/20 transition-colors"
              >
                <ChevronDown className={cn('w-3 h-3 transition-transform', !pipelineJobsOpen && '-rotate-90')} />
                <Briefcase className="w-3 h-3" />
                <span className="flex-1 text-left">수동 파이프라인</span>
                <span className="text-[9px] font-mono font-normal normal-case">{consolePl.pipelineJobs.length}</span>
              </button>
              {pipelineJobsOpen && (
                <div className="px-1.5 pb-2 space-y-0.5">
                  {consolePl.pipelineJobs.length === 0 ? (
                    <div className="px-2 py-3 text-[10px] text-muted-foreground/60 text-center">
                      이 파이프라인의 실행 기록 없음
                    </div>
                  ) : (
                    consolePl.pipelineJobs.map((job) => (
                      <button
                        key={job.jobId}
                        onClick={() => consolePl.onSelectJob?.(job.jobId)}
                        className={cn(
                          'w-full text-left px-2 py-1.5 rounded-md transition-colors',
                          consolePl.selectedJobId === job.jobId
                            ? 'bg-accent/10 text-accent'
                            : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                        )}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-semibold truncate text-foreground">
                            {pipelineNameById.get(job.pipelineId) ?? '파이프라인 미확인'}
                          </span>
                          <JobStatusBadge status={job.status} retryCount={job.retryCount} />
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-muted-foreground mt-0.5">
                          <span className="truncate font-mono">{job.jobId}</span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-muted-foreground mt-0.5">
                          <span className="truncate">{formatRelativeTime(job.updatedAt)}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Jobs mode: 수동 파이프라인 섹션만 ── */}
          {isJobs && jobsPl && (
            <div className="flex-1 min-h-0 flex flex-col">
              <button
                onClick={() => setJobsOpen((v) => !v)}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/20 transition-colors"
              >
                <ChevronDown className={cn('w-3 h-3 transition-transform', !jobsOpen && '-rotate-90')} />
                <Briefcase className="w-3 h-3" />
                <span className="flex-1 text-left">수동 파이프라인</span>
                {activeJobCount > 0 && (
                  <span className="px-1 rounded-full text-[9px] bg-accent/15 text-accent font-normal normal-case">{activeJobCount}</span>
                )}
              </button>
              {jobsOpen && (
                <>
                  <div className="px-2 pb-2 border-b border-border/50">
                    <div className="grid grid-cols-2 gap-1.5">
                    <select
                      value={jobsPl.statusFilter ?? ''}
                      onChange={(e) => jobsPl.onStatusFilterChange?.(e.target.value as JobStatus | '')}
                      className="w-full min-w-0 bg-background border border-border rounded-md px-1.5 py-1.5 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                      aria-label="Job 상태 필터"
                    >
                      <option value="">전체 상태</option>
                      {jobStatuses.map((status) => (
                        <option key={status} value={status}>
                          {jobStatusLabels[status]} ({status})
                        </option>
                      ))}
                    </select>
                    <select
                      value={jobsPl.pageSize ?? 20}
                      onChange={(e) => jobsPl.onPageSizeChange?.(Number(e.target.value))}
                      className="w-full min-w-0 bg-background border border-border rounded-md px-1.5 py-1.5 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                      aria-label="Job 페이지 크기"
                    >
                      {(jobsPl.pageSizeOptions ?? [10, 20, 50]).map((size) => (
                        <option key={size} value={size}>{size}개씩 보기</option>
                      ))}
                    </select>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto pb-1">
                  {jobsPl.jobs.length === 0 ? (
                    <div className="px-3 py-3 text-[10px] text-muted-foreground/60 text-center">실행 기록 없음</div>
                  ) : (
                    <div className="space-y-0.5 px-1.5">
                      {jobsPl.jobs.map((job) => (
                        <button
                          key={job.jobId}
                          onClick={() => jobsPl.onSelectJob(job.jobId)}
                          className={cn(
                            'w-full text-left px-2 py-1.5 rounded-md transition-colors',
                            jobsPl.selectedJobId === job.jobId
                              ? 'bg-accent/10 text-accent'
                              : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-semibold truncate text-foreground">
                              {pipelineNameById.get(job.pipelineId) ?? '파이프라인 미확인'}
                            </span>
                            <JobStatusBadge status={job.status} retryCount={job.retryCount} />
                          </div>
                          <div className="flex items-center justify-between text-[9px] text-muted-foreground mt-0.5">
                            <span className="truncate font-mono">{job.jobId}</span>
                          </div>
                          <div className="flex items-center justify-between text-[9px] text-muted-foreground mt-0.5">
                            <span className="truncate">{formatRelativeTime(job.updatedAt)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  </div>
                  <div className="border-t border-border px-2 py-2 flex items-center gap-2">
                    <div className="min-w-0 flex-1 text-[10px] font-mono text-muted-foreground truncate">
                      <span>
                        {(jobsPl.totalJobs ?? 0) === 0 ? '0 / 0' : `${jobsPl.pageStart ?? 1}-${jobsPl.pageEnd ?? jobsPl.jobs.length} / ${jobsPl.totalJobs ?? jobsPl.jobs.length}`}
                      </span>
                      <span className="text-muted-foreground/50"> · </span>
                      <span>{jobsPl.page ?? 1}/{jobsPl.totalPages ?? 1}</span>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        disabled={(jobsPl.page ?? 1) <= 1}
                        onClick={() => jobsPl.onPageChange?.(Math.max(1, (jobsPl.page ?? 1) - 1))}
                        className="px-2 py-1 rounded-md border border-border text-[10px] text-muted-foreground hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        이전
                      </button>
                      <button
                        type="button"
                        disabled={(jobsPl.page ?? 1) >= (jobsPl.totalPages ?? 1)}
                        onClick={() => jobsPl.onPageChange?.(Math.min(jobsPl.totalPages ?? 1, (jobsPl.page ?? 1) + 1))}
                        className="px-2 py-1 rounded-md border border-border text-[10px] text-muted-foreground hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        다음
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Archive list (nav mode only) ── */}
          {isNav && navProps?.archivePipelines && navProps.archivePipelines.length > 0 && (
            <div className="border-t border-border">
              <button
                onClick={() => setNavArchiveOpen((v) => !v)}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/20 transition-colors"
              >
                <ChevronDown className={cn('w-3 h-3 transition-transform', !navArchiveOpen && '-rotate-90')} />
                <Archive className="w-3 h-3" />
                <span className="flex-1 text-left">아카이브</span>
                <span className="font-mono font-normal normal-case">{navProps.archivePipelines.length}</span>
              </button>
              {navArchiveOpen && (
                <div className="px-1.5 pb-2 space-y-0.5">
                  {navProps.archivePipelines.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => navProps.onSelectArchive?.(pl.id)}
                      className={cn(
                        'w-full text-left px-2 py-1.5 rounded-md text-[11px] transition-colors',
                        navProps.selectedArchiveId === pl.id
                          ? 'bg-accent/10 text-accent'
                          : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <GitBranch className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{pl.name}</span>
                      </div>
                      <div className="text-[9px] text-muted-foreground mt-0.5 ml-[18px]">
                        {pl.satelliteId} · {pl.mode}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bottom */}
      {!collapsed && (
        <div className="border-t border-border px-2 py-2 space-y-1.5">
          <div className="rounded-md border border-border bg-background/35 px-2 py-2">
            <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              권한 미리보기
            </div>
            <RolePreviewSelect role={mockRole} onChange={setMockRole} />
          </div>
          <button
            type="button"
            onClick={() => router.push(`${base}/settings`)}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] cursor-pointer transition-colors',
              activePage === 'settings'
                ? 'bg-accent/10 text-accent'
                : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
            )}
          >
            <Settings className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">설정</span>
          </button>
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileMenuOpen((v) => !v)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] transition-colors',
                profileMenuOpen
                  ? 'bg-muted/30 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
              )}
            >
              <User className="w-3 h-3 flex-shrink-0" />
              <span className="truncate flex-1 text-left">{mockUsername}</span>
              <span className="text-[9px] font-mono text-muted-foreground">{mockRole === 'Administrator' ? 'Admin' : 'Op'}</span>
            </button>

            {profileMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-card border border-border rounded-md shadow-xl py-1 z-30">
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setPwModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-foreground hover:bg-muted/30 transition-colors"
                >
                  <KeyRound className="w-3 h-3 text-muted-foreground" />
                  <span>비밀번호 변경</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                  <span>로그아웃</span>
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 px-2">
            <span className="text-[9px] text-muted-foreground">v0.1.0 · Mock</span>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
              title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              aria-label="테마 전환"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3 h-3" />
                  <span>라이트</span>
                </>
              ) : (
                <>
                  <Moon className="w-3 h-3" />
                  <span>다크</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <PasswordChangeModal open={pwModalOpen} onClose={() => setPwModalOpen(false)} />
    </div>
  );
}

function SidebarItem({ icon: Icon, label, onClick, badge }: { icon: React.ElementType; label: string; onClick?: () => void; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-muted-foreground hover:bg-muted/30 hover:text-foreground cursor-pointer transition-colors"
    >
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span className="truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto px-1.5 rounded-full text-[9px] bg-destructive text-white font-bold">{badge > 9 ? '9+' : badge}</span>
      )}
    </button>
  );
}
