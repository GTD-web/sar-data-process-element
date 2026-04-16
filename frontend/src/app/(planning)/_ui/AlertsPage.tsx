'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import LeftSidebar from '@/components/panels/LeftSidebar';
import Toast, { type ToastMessage } from '@/components/ui/Toast';
import type { Alert, AlertKind, JobSummary } from '@/types/pipeline';
import { cn, formatKST, formatRelativeTime } from '@/lib/utils';
import {
  Bell, CheckCircle, AlertTriangle, AlertCircle, ShieldAlert,
  Server, ChevronDown, ChevronUp, Check, CheckCheck,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Alert Kind Config
// ---------------------------------------------------------------------------

const ALERT_KIND_CONFIG: Record<AlertKind, { icon: React.ElementType; label: string; severity: 'critical' | 'warning' }> = {
  MAX_RETRY: { icon: AlertCircle, label: '최대 재시도 초과', severity: 'critical' },
  PIPELINE_DELAY: { icon: AlertTriangle, label: '파이프라인 지연', severity: 'warning' },
  QUALITY_FAIL: { icon: ShieldAlert, label: '품질 검증 실패', severity: 'warning' },
  RESOURCE_THRESHOLD: { icon: Server, label: '리소스 임계치 초과', severity: 'critical' },
};

// ---------------------------------------------------------------------------
// Alert Kind Badge
// ---------------------------------------------------------------------------

function AlertKindTag({ kind }: { kind: AlertKind }) {
  const config = ALERT_KIND_CONFIG[kind];
  const isCritical = config.severity === 'critical';

  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
      isCritical ? 'bg-destructive/15 text-destructive' : 'bg-amber-500/15 text-amber-500',
    )}>
      <config.icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Expandable Alert Row
// ---------------------------------------------------------------------------

function AlertRow({
  alert,
  expanded,
  onToggle,
  onAcknowledge,
  base,
}: {
  alert: Alert;
  expanded: boolean;
  onToggle: () => void;
  onAcknowledge: () => void;
  base: string;
}) {
  const config = ALERT_KIND_CONFIG[alert.kind];
  const isCritical = config.severity === 'critical';

  return (
    <div className={cn(
      'border-b border-border/50 transition-colors',
      !alert.acknowledged && 'bg-card',
      alert.acknowledged && 'opacity-60',
    )}>
      {/* Main Row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors"
      >
        {/* Severity indicator */}
        <div className={cn(
          'w-2 h-2 rounded-full shrink-0',
          isCritical ? 'bg-destructive' : 'bg-amber-500',
        )} />

        {/* Kind */}
        <div className="w-32 shrink-0">
          <AlertKindTag kind={alert.kind} />
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-foreground line-clamp-1">{alert.message}</div>
        </div>

        {/* Job ID */}
        <a
          href={`${base}/console?jobId=${alert.jobId}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] font-mono text-accent hover:underline shrink-0"
        >
          {alert.jobId}
        </a>

        {/* Time */}
        <span className="text-[10px] text-muted-foreground shrink-0 w-20 text-right">
          {formatRelativeTime(alert.createdAt)}
        </span>

        {/* Status */}
        <div className="w-20 shrink-0 text-right">
          {alert.acknowledged ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-success">
              <CheckCircle className="w-3 h-3" />확인됨
            </span>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onAcknowledge(); }}
              className="inline-flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-medium bg-accent text-background hover:bg-accent/90 transition-colors"
            >
              <Check className="w-3 h-3" />확인
            </button>
          )}
        </div>

        {/* Expand */}
        <div className="shrink-0">
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="px-5 pb-3 pl-10">
          <div className="bg-background rounded-lg border border-border p-3 space-y-2 text-[11px]">
            <div>
              <span className="text-muted-foreground">전체 메시지: </span>
              <span className="text-foreground">{alert.message}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-muted-foreground">Alert ID: </span>
                <span className="font-mono text-foreground">{alert.id}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Job ID: </span>
                <a href={`${base}/console?jobId=${alert.jobId}`} className="font-mono text-accent hover:underline">{alert.jobId}</a>
              </div>
              <div>
                <span className="text-muted-foreground">발생 시각: </span>
                <span className="text-foreground">{formatKST(alert.createdAt)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">버전: </span>
                <span className="font-mono text-foreground">{alert.version}</span>
              </div>
              {alert.acknowledged && (
                <>
                  <div>
                    <span className="text-muted-foreground">확인 시각: </span>
                    <span className="text-foreground">{alert.acknowledgedAt ? formatKST(alert.acknowledgedAt) : '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">확인자: </span>
                    <span className="text-foreground">{alert.acknowledgedBy ?? '—'}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AlertsPage() {
  const service = usePipelineService();
  const pathname = usePathname();
  const base = pathname.startsWith('/current') ? '/current' : '/plan';

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<'unacked' | 'acked' | 'all'>('unacked');
  const [filterKind, setFilterKind] = useState('');

  // UI State
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const acknowledged = filterStatus === 'unacked' ? false : filterStatus === 'acked' ? true : undefined;
    const [aRes, jRes] = await Promise.all([
      service.Alert_목록을_조회한다({ acknowledged }),
      service.Job_목록을_조회한다({ limit: 20 }),
    ]);
    if (aRes.data) setAlerts(aRes.data);
    if (jRes.data) setJobs(jRes.data.items);
  }, [service, filterStatus]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = filterKind
    ? alerts.filter((a) => a.kind === filterKind)
    : alerts;

  // Sort: critical first, then by time
  const sorted = [...filtered].sort((a, b) => {
    const aSev = ALERT_KIND_CONFIG[a.kind].severity === 'critical' ? 0 : 1;
    const bSev = ALERT_KIND_CONFIG[b.kind].severity === 'critical' ? 0 : 1;
    if (aSev !== bSev) return aSev - bSev;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const unackedCount = alerts.filter((a) => !a.acknowledged).length;

  async function handleAcknowledge(alert: Alert) {
    const res = await service.Alert을_확인한다(alert.id, { ifMatchVersion: alert.version });
    if (res.success) {
      setToast({ message: `Alert ${alert.id} 확인 완료`, type: 'success' });
      await loadData();
    } else if (res.code === 409) {
      setToast({ message: '이미 다른 운영자가 확인했습니다. 새로고침합니다.', type: 'warning' });
      await loadData();
    } else {
      setToast({ message: res.message, type: 'error' });
    }
  }

  async function handleBulkAcknowledge() {
    const unacked = sorted.filter((a) => !a.acknowledged);
    if (unacked.length === 0) return;

    let successCount = 0;
    for (const alert of unacked) {
      const res = await service.Alert을_확인한다(alert.id, { ifMatchVersion: alert.version });
      if (res.success) successCount++;
    }

    setToast({
      message: `${successCount}/${unacked.length}건 확인 완료`,
      type: successCount === unacked.length ? 'success' : 'warning',
    });
    await loadData();
  }

  return (
    <div className="h-full flex">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        activePage="alerts"
        jobs={jobs}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-accent" />
            <h1 className="text-sm font-semibold text-foreground">알림</h1>
            {unackedCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-destructive text-white">
                {unackedCount}
              </span>
            )}
          </div>
          {unackedCount > 0 && filterStatus !== 'acked' && (
            <button
              onClick={handleBulkAcknowledge}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-accent text-background hover:bg-accent/90 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              전체 확인 ({unackedCount})
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border shrink-0">
          <div className="flex rounded-md border border-border overflow-hidden">
            {([['unacked', '미확인'], ['acked', '확인됨'], ['all', '전체']] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilterStatus(value)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  filterStatus === value
                    ? 'bg-accent text-background'
                    : 'text-muted-foreground hover:bg-muted/30',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <select
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value)}
            className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">전체 유형</option>
            {(Object.keys(ALERT_KIND_CONFIG) as AlertKind[]).map((k) => (
              <option key={k} value={k}>{ALERT_KIND_CONFIG[k].label}</option>
            ))}
          </select>

          <span className="text-[10px] text-muted-foreground font-mono ml-auto">{sorted.length}건</span>
        </div>

        {/* Alert List */}
        <div className="flex-1 overflow-auto">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <CheckCircle className="w-8 h-8 text-success/50" />
              <span className="text-sm">
                {filterStatus === 'unacked' ? '미확인 알림이 없습니다' : '조건에 맞는 알림이 없습니다'}
              </span>
            </div>
          ) : (
            sorted.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                expanded={expandedId === alert.id}
                onToggle={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                onAcknowledge={() => handleAcknowledge(alert)}
                base={base}
              />
            ))
          )}
        </div>
      </div>

      {toast && <Toast {...toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
