'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePipelineService } from '@/services/usePipelineService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { AlertKindBadge } from '@/components/ui/StatusBadge';
import { formatRelativeTime } from '@/lib/utils';
import type { Alert } from '@/types/pipeline';
import { CheckCircle, ExternalLink } from 'lucide-react';

export default function AlertsPage() {
  const service = usePipelineService();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showAcked, setShowAcked] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await service.Alert_목록을_조회한다(
      showAcked ? undefined : { acknowledged: false },
    );
    if (res.data) setAlerts(res.data);
    setLoading(false);
  }, [service, showAcked]);

  useEffect(() => { load(); }, [load]);

  const handleAck = async (alertId: string) => {
    await service.Alert을_확인한다(alertId);
    load();
  };

  const unacked = alerts.filter((a) => !a.acknowledged);
  const acked = alerts.filter((a) => a.acknowledged);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Alerts</h1>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showAcked}
            onChange={(e) => setShowAcked(e.target.checked)}
            className="rounded border-border"
          />
          확인된 Alert 포함
        </label>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-card border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : unacked.length === 0 && !showAcked ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-10 h-10 text-success mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">미확인 Alert이 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {unacked.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">미확인 ({unacked.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {unacked.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} onAck={handleAck} />
                ))}
              </div>
            </div>
          )}

          {showAcked && acked.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">확인됨 ({acked.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {acked.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AlertCard({ alert, onAck }: { alert: Alert; onAck?: (id: string) => void }) {
  return (
    <Card className={alert.acknowledged ? 'opacity-60' : ''}>
      <CardContent className="py-3 space-y-2">
        <div className="flex items-center justify-between">
          <AlertKindBadge kind={alert.kind} />
          <span className="text-[11px] text-muted-foreground">{formatRelativeTime(alert.createdAt)}</span>
        </div>
        <p className="text-xs text-foreground">{alert.message}</p>
        <div className="flex items-center justify-between">
          <Link
            href={`/jobs/${alert.jobId}`}
            className="text-[11px] text-accent hover:underline flex items-center gap-1"
          >
            {alert.jobId} <ExternalLink className="w-3 h-3" />
          </Link>
          {!alert.acknowledged && onAck && (
            <button
              onClick={() => onAck(alert.id)}
              className="px-2.5 py-1 rounded-md bg-accent/20 text-accent text-[11px] font-medium hover:bg-accent/30 transition-colors"
            >
              확인
            </button>
          )}
          {alert.acknowledged && (
            <span className="text-[11px] text-muted-foreground">
              {alert.acknowledgedBy} 확인
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
