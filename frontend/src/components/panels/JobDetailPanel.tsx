'use client';

import { formatDuration, formatKST } from '@/lib/utils';
import { JobStatusBadge, StepStatusBadge } from '@/components/ui/StatusBadge';
import type { JobDetail } from '@/types/pipeline';
import { CSC_LABELS, PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { RefreshCw, XCircle } from 'lucide-react';

interface JobDetailPanelProps {
  job: JobDetail;
  onReprocess: () => void;
  onCancel: () => void;
}

export default function JobDetailPanel({ job, onReprocess, onCancel }: JobDetailPanelProps) {
  const totalDuration = job.steps.reduce((s, st) => s + (st.durationMs ?? 0), 0);
  const slaMs = 14400 * 1000;
  const slaPct = Math.min((totalDuration / slaMs) * 100, 100);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-mono font-semibold text-foreground">{job.jobId}</div>
          <div className="text-[11px] text-muted-foreground">{job.sceneId}</div>
        </div>
        <JobStatusBadge status={job.status} retryCount={job.retryCount} />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {(job.status === 'FAILED' || job.status === 'CANCELED') && (
          <button
            onClick={onReprocess}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            재처리
          </button>
        )}
        {(job.status === 'CREATED' || job.status === 'ASSIGNED') && (
          <button
            onClick={onCancel}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-destructive/20 text-destructive text-xs font-medium hover:bg-destructive/30 transition-colors"
          >
            <XCircle className="w-3 h-3" />
            취소
          </button>
        )}
      </div>

      {/* SLA */}
      <div>
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="text-muted-foreground">SLA (14,400초)</span>
          <span className="font-mono text-foreground">{formatDuration(totalDuration)}</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${slaPct > 80 ? 'bg-warning' : 'bg-accent'}`}
            style={{ width: `${Math.max(slaPct, 1)}%` }}
          />
        </div>
      </div>

      {/* Info */}
      <div className="space-y-1.5 text-[11px]">
        <InfoRow label="위성" value={job.satelliteId} />
        <InfoRow label="모드" value={job.mode} />
        <InfoRow label="촬영 시작" value={formatKST(job.acquisitionStart)} />
        <InfoRow label="촬영 종료" value={formatKST(job.acquisitionEnd)} />
        <InfoRow label="수신" value={formatKST(job.receivedAt)} />
        <InfoRow label="Raw 경로" value={job.rawDataPath} mono />
      </div>

      {/* Steps */}
      <div>
        <div className="text-[11px] font-medium text-muted-foreground mb-1.5">단계별 상세</div>
        <div className="space-y-1">
          {job.steps.map((step) => (
            <div key={step.order} className="bg-muted/30 rounded-md px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-foreground">{step.targetCsc}</span>
                  <span className="text-[10px] text-muted-foreground">{CSC_LABELS[step.targetCsc]}</span>
                </div>
                <StepStatusBadge status={step.status} />
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {PRODUCT_LEVEL_LABELS[step.productLevel]}
                {step.durationMs !== undefined && ` · ${formatDuration(step.durationMs)}`}
              </div>
              {step.errorMessage && (
                <div className="text-[10px] text-destructive mt-0.5">{step.errorMessage}</div>
              )}
              {step.outputPath && (
                <div className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">{step.outputPath}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground text-right truncate ${mono ? 'font-mono' : ''}`} title={value}>{value}</span>
    </div>
  );
}
