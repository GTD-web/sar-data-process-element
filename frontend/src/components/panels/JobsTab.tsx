'use client';

import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import { JobStatusBadge } from '@/components/ui/StatusBadge';
import type { JobSummary, JobStatus } from '@/types/pipeline';
import { PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { Search } from 'lucide-react';
import { useState } from 'react';

interface JobsTabProps {
  jobs: JobSummary[];
  selectedJobId: string | null;
  onSelectJob: (jobId: string) => void;
}

const STATUS_FILTERS: { label: string; value: JobStatus | '' }[] = [
  { label: '전체', value: '' },
  { label: 'Running', value: 'ASSIGNED' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Done', value: 'COMPLETED' },
];

export default function JobsTab({ jobs, selectedJobId, onSelectJob }: JobsTabProps) {
  const [filter, setFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const filtered = jobs
    .filter((j) => !filter || j.status === filter)
    .filter((j) => !search || j.jobId.toLowerCase().includes(search.toLowerCase()) || j.sceneId.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="h-full flex flex-col">
      {/* Filters */}
      <div className="px-3 py-2 border-b border-border flex-shrink-0 space-y-2">
        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                filter === f.value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
          <span className="text-[10px] text-muted-foreground ml-auto">{filtered.length}건</span>
        </div>
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Job ID / Scene ID 검색..."
            className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-muted/50 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Card List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((job) => (
          <button
            key={job.jobId}
            onClick={() => onSelectJob(job.jobId)}
            className={cn(
              'w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors',
              selectedJobId === job.jobId ? 'bg-accent/10' : 'hover:bg-muted/20',
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-mono font-semibold text-foreground">{job.jobId}</span>
              <JobStatusBadge status={job.status} retryCount={job.retryCount} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{job.sceneId}</span>
              <span>
                {job.currentTargetCsc && job.currentLevel
                  ? `${job.currentTargetCsc} / ${PRODUCT_LEVEL_LABELS[job.currentLevel]}`
                  : ''}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{formatRelativeTime(job.updatedAt)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
