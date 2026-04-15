'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import type { PipelineDefinition, DashboardStats, JobSummary } from '@/types/pipeline';
import { JobStatusBadge } from '@/components/ui/StatusBadge';
import {
  Activity, AlertTriangle, CheckCircle, XCircle,
  GitBranch, Plus, PanelLeftClose, PanelLeftOpen,
  Settings, User, Bell, Trash2, ChevronDown, Briefcase,
} from 'lucide-react';

interface LeftSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  pipelines: PipelineDefinition[];
  selectedPipelineId: string | null;
  selectedPipelineName: string | null;
  onSelectPipeline: (id: string) => void;
  onCreatePipeline: () => void;
  onDeletePipeline: (id: string) => void;
  stats: DashboardStats | null;
  alertCount: number;
  onAlertClick: () => void;
  jobs: JobSummary[];
  selectedJobId: string | null;
  onSelectJob: (jobId: string) => void;
}

export default function LeftSidebar({
  collapsed,
  onToggle,
  pipelines,
  selectedPipelineId,
  selectedPipelineName,
  onSelectPipeline,
  onCreatePipeline,
  onDeletePipeline,
  stats,
  alertCount,
  onAlertClick,
  jobs,
  selectedJobId,
  onSelectJob,
}: LeftSidebarProps) {
  const [pipelinesOpen, setPipelinesOpen] = useState(true);
  const [jobsOpen, setJobsOpen] = useState(true);

  const activeJobCount = jobs.filter((j) => j.status === 'ASSIGNED' || j.status === 'CREATED').length;

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
            <Activity className="w-5 h-5 text-accent flex-shrink-0" />
            <span className="text-xs font-bold text-foreground tracking-tight flex-1 truncate">SDPE</span>
            <button onClick={onCreatePipeline} className="p-1.5 rounded-md hover:bg-muted/50 transition-colors" title="새 파이프라인">
              <Plus className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button onClick={onToggle} className="p-1.5 rounded-md hover:bg-muted/50 transition-colors" title="사이드바 닫기">
              <PanelLeftClose className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </>
        )}
      </div>

      {collapsed ? (
        <div className="flex-1 flex flex-col items-center py-2 gap-1">
          <button onClick={onToggle} className="p-2 rounded-md hover:bg-muted/50" title="파이프라인">
            <GitBranch className="w-4 h-4 text-muted-foreground" />
          </button>
          <button onClick={onToggle} className="relative p-2 rounded-md hover:bg-muted/50" title="실행 작업">
            <Briefcase className="w-4 h-4 text-muted-foreground" />
            {activeJobCount > 0 && (
              <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-accent text-[8px] text-accent-foreground flex items-center justify-center font-bold">
                {activeJobCount > 9 ? '9+' : activeJobCount}
              </span>
            )}
          </button>
          <button onClick={onAlertClick} className="relative p-2 rounded-md hover:bg-muted/50" title="알림">
            <Bell className="w-4 h-4 text-muted-foreground" />
            {alertCount > 0 && (
              <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-destructive text-[8px] text-white flex items-center justify-center font-bold">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Selected Pipeline Info */}
          {selectedPipelineName && (
            <div className="px-3 py-2.5 border-b border-border">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">현재 파이프라인</div>
              <div className="text-xs font-semibold text-foreground truncate">{selectedPipelineName}</div>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="px-2 py-2 border-b border-border">
              <div className="grid grid-cols-4 gap-0.5 text-center">
                <MiniStat icon={Activity} value={stats.inflightJobs} label="진행" color="text-accent" />
                <MiniStat icon={CheckCircle} value={stats.completedLast24h} label="완료" color="text-success" />
                <MiniStat icon={XCircle} value={stats.failedLast24h} label="실패" color="text-destructive" />
                <MiniStat icon={AlertTriangle} value={stats.unacknowledgedAlerts} label="Alert" color="text-destructive" />
              </div>
            </div>
          )}

          {/* ── 파이프라인 섹션 ── */}
          <div className="border-b border-border">
            <button
              onClick={() => setPipelinesOpen((v) => !v)}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/20 transition-colors"
            >
              <ChevronDown className={cn('w-3 h-3 transition-transform', !pipelinesOpen && '-rotate-90')} />
              <GitBranch className="w-3 h-3" />
              <span className="flex-1 text-left">파이프라인</span>
              <span className="text-[9px] font-mono font-normal normal-case">{pipelines.length}</span>
            </button>
            {pipelinesOpen && (
              <div className="px-1.5 pb-2">
                <div className="space-y-0.5">
                  {pipelines.map((pl) => (
                    <div
                      key={pl.id}
                      className={cn(
                        'group flex items-center rounded-md text-[11px] transition-colors',
                        selectedPipelineId === pl.id
                          ? 'bg-accent/10 text-accent'
                          : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                      )}
                    >
                      <button
                        onClick={() => onSelectPipeline(pl.id)}
                        className="flex-1 min-w-0 text-left px-2 py-1.5"
                      >
                        <div className="flex items-center gap-1.5">
                          <GitBranch className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{pl.name}</span>
                        </div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeletePipeline(pl.id); }}
                        className="flex-shrink-0 p-1 mr-1 rounded opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                        title="파이프라인 삭제"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── 실행 작업 섹션 ── */}
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
                {jobs.length === 0 ? (
                  <div className="px-3 py-3 text-[10px] text-muted-foreground/60 text-center">실행 기록 없음</div>
                ) : (
                  <div className="space-y-0.5 px-1.5">
                    {jobs.slice(0, 20).map((job) => (
                      <button
                        key={job.jobId}
                        onClick={() => onSelectJob(job.jobId)}
                        className={cn(
                          'w-full text-left px-2 py-1.5 rounded-md transition-colors',
                          selectedJobId === job.jobId
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
                    {jobs.length > 20 && (
                      <div className="text-[9px] text-muted-foreground/50 text-center py-1">
                        +{jobs.length - 20}건 더
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom: Settings / User */}
      {!collapsed && (
        <div className="border-t border-border px-2 py-2 space-y-0.5">
          <SidebarItem icon={Bell} label={`알림${alertCount > 0 ? ` (${alertCount})` : ''}`} onClick={onAlertClick} badge={alertCount} />
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

function MiniStat({ icon: Icon, value, label, color }: { icon: React.ElementType; value: number; label: string; color: string }) {
  return (
    <div className="py-0.5">
      <Icon className={cn('w-3 h-3 mx-auto mb-0.5', color)} />
      <div className="text-[11px] font-semibold text-foreground">{value}</div>
      <div className="text-[8px] text-muted-foreground">{label}</div>
    </div>
  );
}
