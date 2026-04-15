'use client';

import { formatKST } from '@/lib/utils';
import type { AuditEvent, AuditEventType } from '@/types/pipeline';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

const EVENT_COLORS: Record<AuditEventType, string> = {
  JOB_CREATED: 'bg-muted/50 text-muted-foreground',
  JOB_ASSIGNED: 'bg-accent/15 text-accent',
  JOB_COMPLETED: 'bg-success/15 text-success',
  JOB_FAILED: 'bg-destructive/15 text-destructive',
  PIPELINE_STARTED: 'bg-accent/15 text-accent',
  PIPELINE_REPROCESSED: 'bg-muted/50 text-muted-foreground',
  ALERT_DISPATCHED: 'bg-destructive/15 text-destructive',
};

const COLUMNS: { id: keyof AuditEvent; label: string }[] = [
  { id: 'timestamp', label: '시각' },
  { id: 'eventType', label: '이벤트' },
  { id: 'jobId', label: 'Job' },
  { id: 'detail', label: '상세' },
];

interface AuditTabProps {
  events: AuditEvent[];
  onSelectJob: (jobId: string) => void;
  sortBy: keyof AuditEvent | null;
  sortOrder: 'asc' | 'desc';
  onSort: (column: keyof AuditEvent) => void;
}

export default function AuditTab({ events, onSelectJob, sortBy, sortOrder, onSort }: AuditTabProps) {
  return (
    <div className="overflow-y-auto h-full">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-card">
          <tr className="text-left border-b border-border">
            {COLUMNS.map((col) => (
              <th key={col.id} className="px-3 py-1.5 font-medium text-muted-foreground">
                <button
                  type="button"
                  onClick={() => onSort(col.id)}
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
          {events.map((evt) => (
            <tr key={evt.id} className="border-b border-border/50 hover:bg-muted/20">
              <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{formatKST(evt.timestamp)}</td>
              <td className="px-3 py-1.5">
                <span className={`inline-flex px-1.5 py-0 rounded-full text-[10px] font-medium ${EVENT_COLORS[evt.eventType]}`}>
                  {evt.eventType}
                </span>
              </td>
              <td className="px-3 py-1.5">
                <button onClick={() => onSelectJob(evt.jobId)} className="font-mono text-accent hover:underline">
                  {evt.jobId}
                </button>
              </td>
              <td className="px-3 py-1.5 text-muted-foreground truncate max-w-xs">{evt.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortIcon({ active, order }: { active: boolean; order: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  return order === 'asc'
    ? <ArrowUp className="w-3 h-3" />
    : <ArrowDown className="w-3 h-3" />;
}
