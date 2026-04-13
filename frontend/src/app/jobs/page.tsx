'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePipelineService } from '@/services/usePipelineService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { JobStatusBadge } from '@/components/ui/StatusBadge';
import { formatRelativeTime } from '@/lib/utils';
import type { JobSummary, JobStatus } from '@/types/pipeline';
import { PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { Search, Filter, ChevronRight } from 'lucide-react';

const STATUS_FILTERS: { label: string; value: JobStatus | '' }[] = [
  { label: '전체', value: '' },
  { label: 'Pending', value: 'CREATED' },
  { label: 'Running', value: 'ASSIGNED' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Canceled', value: 'CANCELED' },
];

export default function JobsPage() {
  const service = usePipelineService();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    const res = await service.Job_목록을_조회한다({
      status: statusFilter || undefined,
      limit: 50,
    });
    if (res.data) {
      setJobs(res.data.items);
      setTotal(res.data.total);
    }
    setLoading(false);
  }, [service, statusFilter]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const filtered = search
    ? jobs.filter(
        (j) =>
          j.jobId.toLowerCase().includes(search.toLowerCase()) ||
          j.sceneId.toLowerCase().includes(search.toLowerCase()),
      )
    : jobs;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Jobs</h1>
        <span className="text-sm text-muted-foreground">총 {total}건</span>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3 flex flex-wrap items-center gap-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <div className="flex gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  statusFilter === f.value
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Job ID / Scene ID 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-muted/50 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-56"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Job ID</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Scene ID</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">상태</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">현재 단계</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">재시도</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">시작</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">갱신</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-4 py-3">
                      <div className="h-4 bg-muted rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    조건에 맞는 Job이 없습니다
                  </td>
                </tr>
              ) : (
                filtered.map((job) => (
                  <tr key={job.jobId} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs">{job.jobId}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{job.sceneId}</td>
                    <td className="px-4 py-2.5">
                      <JobStatusBadge status={job.status} retryCount={job.retryCount} />
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {job.currentLevel ? (
                        <span className="font-mono">
                          {job.currentTargetCsc} / {PRODUCT_LEVEL_LABELS[job.currentLevel]}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-center font-mono">
                      {job.retryCount > 0 ? `${job.retryCount}/3` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {formatRelativeTime(job.startedAt)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {formatRelativeTime(job.updatedAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/jobs/${job.jobId}`}
                        className="p-1 rounded hover:bg-muted/50 transition-colors inline-flex"
                      >
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
