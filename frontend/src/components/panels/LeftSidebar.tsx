'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import type { PipelineDefinition, JobSummary } from '@/types/pipeline';
import { JobStatusBadge } from '@/components/ui/StatusBadge';
import {
  Activity, GitBranch, Plus, PanelLeftClose, PanelLeftOpen,
  Settings, User, Bell, Trash2, ChevronDown, Briefcase,
  LayoutDashboard, Layers, Archive, SlidersHorizontal, Package, FileText,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LeftSidebarBaseProps {
  collapsed: boolean;
  onToggle: () => void;
  /** 현재 활성 페이지 (nav highlight용) */
  activePage?: 'home' | 'console' | 'jobs' | 'queues' | 'archive' | 'profiles' | 'products' | 'alerts' | 'audit';
}

interface LeftSidebarConsoleProps extends LeftSidebarBaseProps {
  mode?: 'console';
  pipelines: PipelineDefinition[];
  selectedPipelineId: string | null;
  onSelectPipeline: (id: string) => void;
  onCreatePipeline: () => void;
  onDeletePipeline: (id: string) => void;
  canManagePipelines?: boolean;
}

interface LeftSidebarJobsProps extends LeftSidebarBaseProps {
  mode: 'jobs';
  jobs: JobSummary[];
  selectedJobId: string | null;
  onSelectJob: (jobId: string) => void;
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
  const base = pathname.startsWith('/current') ? '/current' : '/plan';

  const [pipelinesOpen, setPipelinesOpen] = useState(true);
  const [jobsOpen, setJobsOpen] = useState(true);
  const [navArchiveOpen, setNavArchiveOpen] = useState(true);

  const isConsole = mode === 'console';
  const isJobs = mode === 'jobs';
  const isNav = mode === 'nav';
  const consolePl = isConsole ? (props as LeftSidebarConsoleProps) : null;
  const jobsPl = isJobs ? (props as LeftSidebarJobsProps) : null;
  const navProps = isNav ? (props as LeftSidebarNavProps) : null;
  const activeJobCount = jobsPl?.jobs.filter((j) => j.status === 'ASSIGNED' || j.status === 'CREATED').length ?? 0;

  const navItems: { id: NonNullable<LeftSidebarBaseProps['activePage']>; icon: React.ElementType; label: string; href: string }[] = [
    { id: 'home', icon: LayoutDashboard, label: '오버뷰', href: base },
    { id: 'console', icon: GitBranch, label: '파이프라인', href: `${base}/console` },
    { id: 'jobs', icon: Briefcase, label: '실행 작업', href: `${base}/jobs` },
    { id: 'profiles', icon: SlidersHorizontal, label: '처리 프로파일', href: `${base}/profiles` },
    { id: 'products', icon: Package, label: '제품', href: `${base}/products` },
    { id: 'queues', icon: Layers, label: '큐 모니터링', href: `${base}/queues` },
    { id: 'alerts', icon: Bell, label: '알림', href: `${base}/alerts` },
    { id: 'audit', icon: FileText, label: '감사 로그', href: `${base}/audit` },
    { id: 'archive', icon: Archive, label: '아카이브', href: `${base}/archive` },
  ];

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
        <div className="flex-1 flex flex-col items-center py-2 gap-1">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={item.href}
              className={cn(
                'p-2 rounded-md transition-colors',
                activePage === item.id ? 'bg-accent/10 text-accent' : 'hover:bg-muted/50 text-muted-foreground',
              )}
              title={item.label}
            >
              <item.icon className="w-4 h-4" />
            </a>
          ))}
        </div>
      ) : (
        /* ── Expanded content ── */
        <div className="flex-1 overflow-y-auto">
          {/* Navigation */}
          <div className="px-2 py-2 border-b border-border space-y-0.5">
            {navItems.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors',
                  activePage === item.id
                    ? 'bg-accent/10 text-accent'
                    : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                )}
              >
                <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{item.label}</span>
              </a>
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
                            title="파이프라인 삭제"
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

          {/* ── Jobs mode: 실행 작업 섹션만 ── */}
          {isJobs && jobsPl && (
            <div>
              <button
                onClick={() => setJobsOpen((v) => !v)}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/20 transition-colors"
              >
                <ChevronDown className={cn('w-3 h-3 transition-transform', !jobsOpen && '-rotate-90')} />
                <Briefcase className="w-3 h-3" />
                <span className="flex-1 text-left">실행 작업</span>
                {activeJobCount > 0 && (
                  <span className="px-1 rounded-full text-[9px] bg-accent/15 text-accent font-normal normal-case">{activeJobCount}</span>
                )}
              </button>
              {jobsOpen && (
                <div className="pb-1">
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
                            <span className="text-[10px] font-mono font-semibold truncate">{job.jobId}</span>
                            <JobStatusBadge status={job.status} retryCount={job.retryCount} />
                          </div>
                          <div className="flex items-center justify-between text-[9px] text-muted-foreground mt-0.5">
                            <span className="truncate">{job.sceneId}</span>
                            <span className="shrink-0">{formatRelativeTime(job.updatedAt)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
        <div className="border-t border-border px-2 py-2 space-y-0.5">
          <SidebarItem icon={Settings} label="설정" />
          <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-muted-foreground">
            <User className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">operator-01</span>
          </div>
          <div className="px-2 text-[9px] text-muted-foreground">v0.1.0 · Mock</div>
        </div>
      )}
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
