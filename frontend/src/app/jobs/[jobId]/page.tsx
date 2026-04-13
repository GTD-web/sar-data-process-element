'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePipelineService } from '@/services/usePipelineService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { JobStatusBadge, StepStatusBadge } from '@/components/ui/StatusBadge';
import { formatDuration, formatKST } from '@/lib/utils';
import type { JobDetail } from '@/types/pipeline';
import { CSC_LABELS, PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { ArrowLeft, RefreshCw, XCircle } from 'lucide-react';

const PipelineGraph = dynamic(() => import('@/components/graph/PipelineGraph'), {
  ssr: false,
  loading: () => (
    <div className="h-[350px] bg-card rounded-lg border border-border flex items-center justify-center text-muted-foreground text-sm">
      그래프 로딩 중...
    </div>
  ),
});

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const service = usePipelineService();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    service.Job_상세를_조회한다(jobId).then((res) => {
      if (res.data) setJob(res.data);
      setLoading(false);
    });
  }, [service, jobId]);

  const handleReprocess = async () => {
    if (!job) return;
    if (!confirm(`Job ${job.jobId}을(를) 재처리하시겠습니까?`)) return;
    setActionLoading(true);
    await service.Job을_재처리한다(job.jobId);
    const res = await service.Job_상세를_조회한다(jobId);
    if (res.data) setJob(res.data);
    setActionLoading(false);
  };

  const handleCancel = async () => {
    if (!job) return;
    if (!confirm(`Job ${job.jobId}을(를) 취소하시겠습니까?`)) return;
    setActionLoading(true);
    await service.Job을_취소한다(job.jobId);
    const res = await service.Job_상세를_조회한다(jobId);
    if (res.data) setJob(res.data);
    setActionLoading(false);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 bg-muted rounded animate-pulse" />
        <div className="h-[350px] bg-card border border-border rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <p className="text-muted-foreground">Job을 찾을 수 없습니다</p>
        <Link href="/jobs" className="text-accent text-sm hover:underline">
          Jobs 목록으로
        </Link>
      </div>
    );
  }

  const totalDuration = job.steps.reduce((s, st) => s + (st.durationMs ?? 0), 0);
  const slaMs = 14400 * 1000;
  const slaPct = Math.min((totalDuration / slaMs) * 100, 100);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/jobs" className="p-1.5 rounded-md hover:bg-muted/50 transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold font-mono">{job.jobId}</h1>
              <JobStatusBadge status={job.status} retryCount={job.retryCount} />
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Scene: {job.sceneId} · {job.satelliteId} · {job.mode}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {(job.status === 'FAILED' || job.status === 'CANCELED') && (
            <button
              onClick={handleReprocess}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              재처리
            </button>
          )}
          {(job.status === 'CREATED' || job.status === 'ASSIGNED') && (
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-destructive/20 text-destructive text-xs font-medium hover:bg-destructive/30 disabled:opacity-50 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              취소
            </button>
          )}
        </div>
      </div>

      {/* SLA Progress */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">SLA 진행률 (목표 14,400초)</span>
            <span className="font-mono text-foreground">
              {formatDuration(totalDuration)} / {formatDuration(slaMs)}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${slaPct > 80 ? 'bg-warning' : slaPct >= 100 ? 'bg-destructive' : 'bg-accent'}`}
              style={{ width: `${Math.max(slaPct, 1)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Graph */}
      <PipelineGraph steps={job.steps} />

      {/* Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Job Info */}
        <Card>
          <CardHeader>
            <CardTitle>Job 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <InfoRow label="Job ID" value={job.jobId} mono />
            <InfoRow label="Scene ID" value={job.sceneId} mono />
            <InfoRow label="위성" value={job.satelliteId} />
            <InfoRow label="모드" value={job.mode} />
            <InfoRow label="촬영 시작" value={formatKST(job.acquisitionStart)} />
            <InfoRow label="촬영 종료" value={formatKST(job.acquisitionEnd)} />
            <InfoRow label="수신 시각" value={formatKST(job.receivedAt)} />
            <InfoRow label="Raw 경로" value={job.rawDataPath} mono />
          </CardContent>
        </Card>

        {/* Steps Detail */}
        <Card>
          <CardHeader>
            <CardTitle>단계별 상세</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {job.steps.map((step) => (
                <div key={step.order} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{step.targetCsc}</span>
                      <span className="text-[11px] text-muted-foreground">{CSC_LABELS[step.targetCsc]}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {PRODUCT_LEVEL_LABELS[step.productLevel]}
                      {step.durationMs !== undefined && ` · ${formatDuration(step.durationMs)}`}
                      {step.outputPath && ` · ${step.outputPath}`}
                    </div>
                    {step.errorMessage && (
                      <div className="text-[11px] text-red-400 mt-0.5">{step.errorMessage}</div>
                    )}
                  </div>
                  <StepStatusBadge status={step.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      <span className={`text-foreground text-right truncate ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </span>
    </div>
  );
}
