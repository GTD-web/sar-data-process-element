'use client';

import { formatRelativeTime } from '@/lib/utils';
import { AlertKindBadge } from '@/components/ui/StatusBadge';
import type { Alert } from '@/types/pipeline';
import { CheckCircle, ExternalLink } from 'lucide-react';

interface AlertsTabProps {
  alerts: Alert[];
  onAck: (alertId: string) => void;
  onSelectJob: (jobId: string) => void;
}

export default function AlertsTab({ alerts, onAck, onSelectJob }: AlertsTabProps) {
  const unacked = alerts.filter((a) => !a.acknowledged);
  const acked = alerts.filter((a) => a.acknowledged);

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
        <CheckCircle className="w-8 h-8 mb-2 text-success" />
        <span className="text-xs">미확인 Alert이 없습니다</span>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {unacked.map((alert) => (
        <div key={alert.id} className="px-3 py-2 hover:bg-muted/20 transition-colors">
          <div className="flex items-center justify-between mb-1">
            <AlertKindBadge kind={alert.kind} />
            <span className="text-[10px] text-muted-foreground">{formatRelativeTime(alert.createdAt)}</span>
          </div>
          <p className="text-[11px] text-foreground mb-1">{alert.message}</p>
          <div className="flex items-center justify-between">
            <button
              onClick={() => onSelectJob(alert.jobId)}
              className="text-[10px] text-accent hover:underline flex items-center gap-0.5"
            >
              {alert.jobId} <ExternalLink className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={() => onAck(alert.id)}
              className="px-2 py-0.5 rounded bg-accent/20 text-accent text-[10px] font-medium hover:bg-accent/30"
            >
              확인
            </button>
          </div>
        </div>
      ))}
      {acked.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground bg-muted/20">
            확인됨 ({acked.length})
          </div>
          {acked.slice(0, 5).map((alert) => (
            <div key={alert.id} className="px-3 py-2 opacity-50">
              <div className="flex items-center justify-between">
                <AlertKindBadge kind={alert.kind} />
                <span className="text-[10px] text-muted-foreground">{alert.acknowledgedBy}</span>
              </div>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{alert.message}</p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
