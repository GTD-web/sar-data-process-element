'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePipelineService } from '@/services/usePipelineService';
import { Card, CardContent } from '@/components/ui/Card';
import { formatKST } from '@/lib/utils';
import type { AuditEvent, AuditEventType } from '@/types/pipeline';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

const EVENT_TYPE_COLORS: Record<AuditEventType, string> = {
  JOB_CREATED: 'bg-slate-500/20 text-slate-400',
  JOB_ASSIGNED: 'bg-blue-500/20 text-blue-400',
  JOB_COMPLETED: 'bg-emerald-500/20 text-emerald-400',
  JOB_FAILED: 'bg-red-500/20 text-red-400',
  PIPELINE_STARTED: 'bg-purple-500/20 text-purple-400',
  PIPELINE_REPROCESSED: 'bg-amber-500/20 text-amber-400',
  ALERT_DISPATCHED: 'bg-orange-500/20 text-orange-400',
};

export default function AuditPage() {
  const service = usePipelineService();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [jobIdFilter, setJobIdFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await service.감사로그를_조회한다({
      jobId: jobIdFilter || undefined,
      page,
      size: pageSize,
    });
    if (res.data) {
      setEvents(res.data.items);
      setTotal(res.data.total);
    }
    setLoading(false);
  }, [service, page, jobIdFilter]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">감사 로그</h1>

      {/* Filter */}
      <Card>
        <CardContent className="py-3 flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Job ID로 필터..."
              value={jobIdFilter}
              onChange={(e) => { setJobIdFilter(e.target.value); setPage(1); }}
              className="pl-8 pr-3 py-1.5 text-xs bg-muted/50 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-48"
            />
          </div>
          <span className="text-xs text-muted-foreground">총 {total}건</span>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">시각</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">이벤트</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Job ID</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">상세</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">운영자</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-4 py-3">
                      <div className="h-4 bg-muted rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    해당 기간의 로그가 없습니다
                  </td>
                </tr>
              ) : (
                events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {formatKST(evt.timestamp)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${EVENT_TYPE_COLORS[evt.eventType]}`}>
                        {evt.eventType}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/jobs/${evt.jobId}`} className="text-xs font-mono text-accent hover:underline">
                        {evt.jobId}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs truncate">
                      {evt.detail}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {evt.operatorId ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-3 border-t border-border">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded hover:bg-muted/50 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded hover:bg-muted/50 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
