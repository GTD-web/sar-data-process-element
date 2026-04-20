'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import LeftSidebar from '@/components/panels/LeftSidebar';
import { RolePreviewSelect, useMockRole } from '@/components/auth/RolePreviewSelect';
import type { AuditEvent, AuditEventType } from '@/types/pipeline';
import { cn, formatKST } from '@/lib/utils';
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  FileText,
  X,
  Calendar,
  PlusCircle,
  CheckCircle,
  PlayCircle,
  XCircle,
  RefreshCw,
  Bell,
  UserCheck,
  ExternalLink,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Event Config
// ---------------------------------------------------------------------------

const EVENT_CONFIG: Record<
  AuditEventType,
  { label: string; color: string; bgColor: string; icon: React.ElementType; description: string }
> = {
  JOB_CREATED: {
    label: 'Job 생성',
    color: 'text-accent',
    bgColor: 'bg-accent/15 text-accent',
    icon: PlusCircle,
    description: '새로운 처리 작업이 생성되었습니다. 파이프라인 자동 트리거 또는 수동 실행에 의해 발생합니다.',
  },
  JOB_ASSIGNED: {
    label: 'Job 할당',
    color: 'text-accent',
    bgColor: 'bg-accent/15 text-accent',
    icon: UserCheck,
    description: '처리 작업이 워커에 할당되어 실행 대기 중입니다.',
  },
  JOB_COMPLETED: {
    label: 'Job 완료',
    color: 'text-success',
    bgColor: 'bg-success/15 text-success',
    icon: CheckCircle,
    description: '처리 작업이 모든 단계를 성공적으로 완료했습니다.',
  },
  JOB_FAILED: {
    label: 'Job 실패',
    color: 'text-destructive',
    bgColor: 'bg-destructive/15 text-destructive',
    icon: XCircle,
    description: '처리 작업이 오류로 인해 실패했습니다. 재시도 횟수 초과 시 Dead Letter로 이동됩니다.',
  },
  PIPELINE_STARTED: {
    label: '파이프라인 시작',
    color: 'text-accent',
    bgColor: 'bg-accent/15 text-accent',
    icon: PlayCircle,
    description: '파이프라인이 시작되어 데이터 처리 워크플로우가 실행됩니다.',
  },
  PIPELINE_REPROCESSED: {
    label: '재처리',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50 text-muted-foreground',
    icon: RefreshCw,
    description: '운영자에 의해 재처리가 요청되었습니다. 지정된 레벨부터 처리가 다시 시작됩니다.',
  },
  ALERT_DISPATCHED: {
    label: '알림 발행',
    color: 'text-destructive',
    bgColor: 'bg-destructive/15 text-destructive',
    icon: Bell,
    description: '시스템 이상 상황이 감지되어 운영자에게 알림이 발행되었습니다.',
  },
};

const ALL_EVENT_TYPES = Object.keys(EVENT_CONFIG) as AuditEventType[];

const COLUMNS: { id: keyof AuditEvent; label: string }[] = [
  { id: 'timestamp', label: '시각' },
  { id: 'eventType', label: '이벤트' },
  { id: 'jobId', label: 'Job' },
  { id: 'detail', label: '상세' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SortIcon({ active, order }: { active: boolean; order: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  return order === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
}

function getPageRange(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('ellipsis');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function Pagination({
  page,
  totalPages,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  const range = getPageRange(page, totalPages);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border bg-card shrink-0">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>페이지 당</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="bg-background border border-border rounded-md px-1.5 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="font-mono tabular-nums">
          {start}–{end} / {total}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          이전
        </button>
        {range.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e-${i}`} className="px-1.5 text-[11px] text-muted-foreground select-none">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={cn(
                'min-w-6.5 px-2 py-1 text-[11px] rounded-md border transition-colors tabular-nums',
                p === page
                  ? 'border-accent bg-accent text-background font-semibold'
                  : 'border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground',
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          다음
        </button>
      </div>
    </div>
  );
}

function StatCard({
  label,
  count,
  icon: Icon,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon: React.ElementType;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left min-w-0',
        active
          ? 'border-accent bg-accent/5 ring-1 ring-accent/30'
          : 'border-border hover:border-accent/40 hover:bg-muted/20',
      )}
    >
      <Icon className={cn('w-3.5 h-3.5 shrink-0', color)} />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground tabular-nums">{count}</div>
        <div className="text-[9px] text-muted-foreground truncate">{label}</div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Detail Panel
// ---------------------------------------------------------------------------

function DetailPanel({
  event,
  relatedEvents,
  relatedLoading,
  base,
  onSelectEvent,
}: {
  event: AuditEvent;
  relatedEvents: AuditEvent[];
  relatedLoading: boolean;
  base: string;
  onSelectEvent: (evt: AuditEvent) => void;
}) {
  const config = EVENT_CONFIG[event.eventType];
  const sortedRelatedEvents = useMemo(
    () => [...relatedEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [relatedEvents],
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      {/* Event type badge + description */}
      <div className="space-y-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium',
            config.bgColor,
          )}
        >
          <config.icon className="w-3 h-3" />
          {config.label}
        </span>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{config.description}</p>
      </div>

      {/* Key fields */}
      <div className="grid grid-cols-2 gap-3">
        <DetailField label="이벤트 ID" value={event.id} mono />
        <DetailField label="발생 시각" value={formatKST(event.timestamp)} />
        <DetailField
          label="Job ID"
          value={
            <a
              href={`${base}/jobs?jobId=${event.jobId}`}
              className="inline-flex items-center gap-1 font-mono text-accent hover:underline text-xs"
            >
              {event.jobId}
              <ExternalLink className="w-3 h-3" />
            </a>
          }
        />
        <DetailField label="운영자" value={event.operatorId ?? '시스템 (자동)'} />
      </div>

      {/* Detail message */}
      <div>
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">상세 내용</div>
        <div className="text-xs text-foreground leading-relaxed bg-background rounded-md border border-border p-3">
          {event.detail}
        </div>
      </div>

      {/* Related events timeline */}
      <div className="pt-1 border-t border-border">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2.5">
          Job 이벤트 타임라인
          {!relatedLoading && (
            <span className="font-mono font-normal normal-case ml-1">({relatedEvents.length}건)</span>
          )}
        </div>

        {relatedLoading ? (
          <div className="text-[10px] text-muted-foreground/60 py-3 text-center">로딩 중...</div>
        ) : relatedEvents.length === 0 ? (
          <div className="text-[10px] text-muted-foreground/60 py-3 text-center">관련 이벤트 없음</div>
        ) : (
          <div className="relative ml-2">
            {/* Timeline line */}
            <div className="absolute left-1.25 top-2 bottom-2 w-px bg-border" />

            <div className="space-y-0">
              {sortedRelatedEvents.map((evt) => {
                const evtConfig = EVENT_CONFIG[evt.eventType];
                const isCurrent = evt.id === event.id;

                return (
                  <button
                    key={evt.id}
                    type="button"
                    onClick={() => onSelectEvent(evt)}
                    className={cn(
                      'relative flex items-start gap-2.5 pl-5 pr-2 py-2 w-full text-left rounded-md transition-colors',
                      isCurrent ? 'bg-accent/5' : 'hover:bg-muted/20',
                    )}
                  >
                    {/* Timeline dot */}
                    <div
                      className={cn(
                        'absolute left-0 top-2.75 w-2.75 h-2.75 rounded-full border-2 shrink-0',
                        isCurrent ? 'border-accent bg-accent' : 'border-border bg-card',
                      )}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium', evtConfig.color)}>
                          <evtConfig.icon className="w-3 h-3" />
                          {evtConfig.label}
                        </span>
                        {isCurrent && (
                          <span className="px-1 py-0 rounded text-[8px] font-bold bg-accent text-background">현재</span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{formatKST(evt.timestamp)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="pt-1 border-t border-border">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">빠른 이동</div>
        <div className="space-y-1">
          <a
            href={`${base}/jobs?jobId=${event.jobId}`}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-foreground hover:bg-muted/30 transition-colors border border-border"
          >
            <PlayCircle className="w-3.5 h-3.5 text-accent shrink-0" />
            <span>파이프라인 콘솔에서 Job 보기</span>
            <ExternalLink className="w-3 h-3 text-muted-foreground ml-auto" />
          </a>
          <a
            href={`${base}/alerts`}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-foreground hover:bg-muted/30 transition-colors border border-border"
          >
            <Bell className="w-3.5 h-3.5 text-accent shrink-0" />
            <span>알림 페이지</span>
            <ExternalLink className="w-3 h-3 text-muted-foreground ml-auto" />
          </a>
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
      <div className={cn('text-xs text-foreground break-all', mono && 'font-mono text-[11px]')}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AuditPage() {
  const service = usePipelineService();
  const pathname = usePathname();
  const base = pathname.startsWith('/current') ? '/current' : '/plan';

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [previewRole, setPreviewRole] = useMockRole();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);

  // Stats: loaded once, never changes with filters
  const [globalCounts, setGlobalCounts] = useState<Record<string, number>>({});

  // Filters
  const [filterJobId, setFilterJobId] = useState('');
  const [filterEventType, setFilterEventType] = useState<AuditEventType | ''>('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [sortBy, setSortBy] = useState<keyof AuditEvent | null>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  // Detail panel
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [relatedEvents, setRelatedEvents] = useState<AuditEvent[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const canViewAudit = previewRole === 'Administrator';

  // Initial load: global stats (unfiltered)
  useEffect(() => {
    if (!canViewAudit) return;
    (async () => {
      const allRes = await service.감사로그를_조회한다({ size: 500 });
      if (allRes.data) {
        const counts: Record<string, number> = {};
        for (const t of ALL_EVENT_TYPES) counts[t] = 0;
        for (const e of allRes.data.items) counts[e.eventType] = (counts[e.eventType] ?? 0) + 1;
        setGlobalCounts(counts);
      }
    })();
  }, [service, canViewAudit]);

  // Filtered data load
  const loadData = useCallback(async () => {
    if (!canViewAudit) {
      setEvents([]);
      setTotal(0);
      setSelectedEvent(null);
      return;
    }
    const auditRes = await service.감사로그를_조회한다({
      jobId: filterJobId || undefined,
      eventType: filterEventType || undefined,
      from: filterFrom || undefined,
      to: filterTo || undefined,
      page,
      size: pageSize,
      sortBy: sortBy ?? undefined,
      sortOrder,
    });
    if (auditRes.data) {
      setEvents(auditRes.data.items);
      setTotal(auditRes.data.total);
    }
  }, [service, filterJobId, filterEventType, filterFrom, filterTo, page, pageSize, sortBy, sortOrder, canViewAudit]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 의존성이 변경될 때 비동기 데이터를 fetch하여 상태를 갱신하는 정규 패턴
    loadData();
  }, [loadData]);

  // Load related events when selecting an event
  useEffect(() => {
    if (!selectedEvent) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 선택 해제 시 파생 상태 초기화
      setRelatedEvents([]);
      return;
    }
    let cancelled = false;
    setRelatedLoading(true);
    service.감사로그를_조회한다({ jobId: selectedEvent.jobId, size: 100 }).then((res) => {
      if (cancelled) return;
      setRelatedEvents(res.data?.items ?? []);
      setRelatedLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [service, selectedEvent]);

  const handleSort = useCallback(
    (column: keyof AuditEvent) => {
      const nextOrder = sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc';
      setSortBy(column);
      setSortOrder(nextOrder);
    },
    [sortBy, sortOrder],
  );

  const handleFilterEventType = useCallback((type: AuditEventType | '') => {
    setFilterEventType((prev) => (prev === type ? '' : type));
    setPage(1);
  }, []);

  const hasActiveFilters = filterJobId || filterEventType || filterFrom || filterTo;

  const clearFilters = useCallback(() => {
    setFilterJobId('');
    setFilterEventType('');
    setFilterFrom('');
    setFilterTo('');
    setPage(1);
  }, []);

  const totalPages = Math.ceil(total / pageSize);
  const panelOpen = selectedEvent !== null;

  return (
    <div className="h-full flex">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        activePage="audit"
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" />
            <h1 className="text-sm font-semibold text-foreground">감사 로그</h1>
            <span className="text-[10px] text-muted-foreground font-mono">{total}건</span>
          </div>
          <div className="flex items-center gap-2">
            <RolePreviewSelect role={previewRole} onChange={setPreviewRole} />
            {hasActiveFilters && canViewAudit && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              >
                <X className="w-3 h-3" />
                필터 초기화
              </button>
            )}
          </div>
        </div>

        {!canViewAudit ? (
          <div className="flex-1 flex items-center justify-center bg-background">
            <div className="max-w-sm text-center">
              <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <h2 className="text-sm font-semibold text-foreground">감사 로그는 Administrator 전용입니다</h2>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Operator 역할은 파이프라인 실행, Job, 모니터링 화면을 사용할 수 있지만 감사 이벤트 조회 권한은 없습니다.
              </p>
            </div>
          </div>
        ) : (
          <>

        {/* Stats Cards */}
        <div className="px-5 py-3 border-b border-border shrink-0">
          <div className="grid grid-cols-7 gap-2">
            {ALL_EVENT_TYPES.map((type) => (
              <StatCard
                key={type}
                label={EVENT_CONFIG[type].label}
                count={globalCounts[type] ?? 0}
                icon={EVENT_CONFIG[type].icon}
                color={EVENT_CONFIG[type].color}
                active={filterEventType === type}
                onClick={() => handleFilterEventType(type)}
              />
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border shrink-0">
          <input
            type="text"
            placeholder="Job ID 검색..."
            value={filterJobId}
            onChange={(e) => {
              setFilterJobId(e.target.value);
              setPage(1);
            }}
            className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent w-44"
          />

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => {
                setFilterFrom(e.target.value);
                setPage(1);
              }}
              className="bg-background border border-border rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <span className="text-[10px]">~</span>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => {
                setFilterTo(e.target.value);
                setPage(1);
              }}
              className="bg-background border border-border rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        {/* Main content: Table + Detail Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Audit Table */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto">
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                  <FileText className="w-8 h-8 opacity-30" />
                  <span className="text-sm">
                    {hasActiveFilters ? '조건에 맞는 감사 로그가 없습니다' : '감사 로그가 없습니다'}
                  </span>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="text-left border-b border-border">
                      {COLUMNS.map((col) => (
                        <th key={col.id} className="px-4 py-2.5 font-medium text-muted-foreground">
                          <button
                            type="button"
                            onClick={() => handleSort(col.id)}
                            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                          >
                            {col.label}
                            <SortIcon active={sortBy === col.id} order={sortOrder} />
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((evt) => {
                      const config = EVENT_CONFIG[evt.eventType];
                      const isSelected = selectedEvent?.id === evt.id;

                      return (
                        <tr
                          key={evt.id}
                          onClick={() => setSelectedEvent(isSelected ? null : evt)}
                          className={cn(
                            'border-b border-border/50 cursor-pointer transition-colors',
                            isSelected ? 'bg-accent/5' : 'hover:bg-muted/20',
                          )}
                        >
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                            {formatKST(evt.timestamp)}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
                                config.bgColor,
                              )}
                            >
                              <config.icon className="w-3 h-3" />
                              {config.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <a
                              href={`${base}/jobs?jobId=${evt.jobId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-mono text-accent hover:underline"
                            >
                              {evt.jobId}
                            </a>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground truncate max-w-md">{evt.detail}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <Pagination
              page={page}
              totalPages={Math.max(totalPages, 1)}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>

          {/* Detail Panel — always rendered, animated via translate */}
          <div
            ref={panelRef}
            className={cn(
              'h-full border-l border-border bg-card flex flex-col shrink-0 transition-all duration-300 ease-in-out overflow-hidden',
              panelOpen ? 'w-95 min-w-95 opacity-100 translate-x-0' : 'w-0 min-w-0 opacity-0 translate-x-4 border-l-0',
            )}
          >
            {selectedEvent && (
              <>
                {/* Panel Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {(() => {
                      const C = EVENT_CONFIG[selectedEvent.eventType].icon;
                      return <C className="w-4 h-4 text-accent shrink-0" />;
                    })()}
                    <span className="text-xs font-semibold text-foreground truncate">이벤트 상세</span>
                  </div>
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="p-1 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>

                <DetailPanel
                  event={selectedEvent}
                  relatedEvents={relatedEvents}
                  relatedLoading={relatedLoading}
                  base={base}
                  onSelectEvent={setSelectedEvent}
                />
              </>
            )}
          </div>
        </div>
          </>
        )}
      </div>

    </div>
  );
}
