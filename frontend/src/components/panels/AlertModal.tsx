'use client';

import { formatRelativeTime } from '@/lib/utils';
import { AlertKindBadge } from '@/components/ui/StatusBadge';
import type { Alert } from '@/types/pipeline';
import { X, CheckCircle, ExternalLink } from 'lucide-react';

interface AlertModalProps {
  open: boolean;
  onClose: () => void;
  alerts: Alert[];
  onAck: (alertId: string) => void;
  onSelectJob: (jobId: string) => void;
}

export default function AlertModal({ open, onClose, alerts, onAck, onSelectJob }: AlertModalProps) {
  if (!open) return null;

  const unacked = alerts.filter((a) => !a.acknowledged);
  const acked = alerts.filter((a) => a.acknowledged);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md max-h-[80vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-semibold text-foreground">Alerts</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {unacked.length === 0 && acked.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CheckCircle className="w-8 h-8 mb-2 text-success" />
              <span className="text-xs">No alerts</span>
            </div>
          )}

          {unacked.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/20">
                Unacknowledged ({unacked.length})
              </div>
              {unacked.map((alert) => (
                <div key={alert.id} className="px-4 py-3 border-b border-border/50 hover:bg-muted/10 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <AlertKindBadge kind={alert.kind} />
                    <span className="text-[10px] text-muted-foreground">{formatRelativeTime(alert.createdAt)}</span>
                  </div>
                  <p className="text-[11px] text-foreground mb-1.5">{alert.message}</p>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => { onSelectJob(alert.jobId); onClose(); }}
                      className="text-[10px] text-accent hover:underline flex items-center gap-0.5"
                    >
                      {alert.jobId} <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={() => onAck(alert.id)}
                      className="px-2.5 py-1 rounded-md bg-accent/20 text-accent text-[10px] font-medium hover:bg-accent/30 transition-colors"
                    >
                      Acknowledge
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {acked.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/20">
                Acknowledged ({acked.length})
              </div>
              {acked.slice(0, 10).map((alert) => (
                <div key={alert.id} className="px-4 py-2.5 border-b border-border/50 opacity-50">
                  <div className="flex items-center justify-between">
                    <AlertKindBadge kind={alert.kind} />
                    <span className="text-[10px] text-muted-foreground">{alert.acknowledgedBy}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{alert.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
