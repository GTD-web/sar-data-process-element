'use client';

import { formatKST } from '@/lib/utils';
import type { AuditEvent, AuditEventType } from '@/types/pipeline';

const EVENT_COLORS: Record<AuditEventType, string> = {
  JOB_CREATED: 'bg-muted/50 text-muted-foreground',
  JOB_ASSIGNED: 'bg-accent/15 text-accent',
  JOB_COMPLETED: 'bg-success/15 text-success',
  JOB_FAILED: 'bg-destructive/15 text-destructive',
  PIPELINE_STARTED: 'bg-accent/15 text-accent',
  PIPELINE_REPROCESSED: 'bg-muted/50 text-muted-foreground',
  ALERT_DISPATCHED: 'bg-destructive/15 text-destructive',
};

interface AuditTabProps {
  events: AuditEvent[];
  onSelectJob: (jobId: string) => void;
}

export default function AuditTab({ events, onSelectJob }: AuditTabProps) {
  return (
    <div className="overflow-y-auto h-full">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-card">
          <tr className="text-left border-b border-border">
            <th className="px-3 py-1.5 font-medium text-muted-foreground">시각</th>
            <th className="px-3 py-1.5 font-medium text-muted-foreground">이벤트</th>
            <th className="px-3 py-1.5 font-medium text-muted-foreground">Job</th>
            <th className="px-3 py-1.5 font-medium text-muted-foreground">상세</th>
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
