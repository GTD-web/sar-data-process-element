'use client';

import { useState } from 'react';
import { formatDuration, formatKST } from '@/lib/utils';
import { JobStatusBadge, StepStatusBadge } from '@/components/ui/StatusBadge';
import type { JobDetail, ProductLevel } from '@/types/pipeline';
import { CSC_LABELS, PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { RefreshCw, XCircle, ChevronDown, X, AlertTriangle } from 'lucide-react';

interface JobDetailPanelProps {
  job: JobDetail;
  onReprocess: () => void;
  onPartialReprocess: (targetLevel: ProductLevel) => void;
  onCancel: () => void;
}

export default function JobDetailPanel({ job, onReprocess, onPartialReprocess, onCancel }: JobDetailPanelProps) {
  const [reprocessDropdownOpen, setReprocessDropdownOpen] = useState(false);
  const [partialDialogOpen, setPartialDialogOpen] = useState(false);

  const totalDuration = job.steps.reduce((s, st) => s + (st.durationMs ?? 0), 0);
  const slaMs = 14400 * 1000;
  const slaPct = Math.min((totalDuration / slaMs) * 100, 100);

  const handleFullReprocess = () => {
    setReprocessDropdownOpen(false);
    onReprocess();
  };

  const handleOpenPartialDialog = () => {
    setReprocessDropdownOpen(false);
    setPartialDialogOpen(true);
  };

  const handlePartialConfirm = (targetLevel: ProductLevel) => {
    setPartialDialogOpen(false);
    onPartialReprocess(targetLevel);
  };

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
          <div className="flex-1 relative">
            <div className="flex rounded-md overflow-hidden border border-accent/30">
              <button
                onClick={handleFullReprocess}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                재처리
              </button>
              <button
                onClick={() => setReprocessDropdownOpen((v) => !v)}
                className="px-2 bg-accent/80 text-accent-foreground hover:bg-accent/60 transition-colors border-l border-accent/40"
                aria-label="재처리 옵션"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            {reprocessDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-10 overflow-hidden">
                <button
                  onClick={handleFullReprocess}
                  className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-muted/50 transition-colors"
                >
                  <div className="font-medium">전체 재처리</div>
                  <div className="text-muted-foreground text-[10px]">LEVEL_0부터 전체 재실행</div>
                </button>
                <div className="h-px bg-border" />
                <button
                  onClick={handleOpenPartialDialog}
                  className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-muted/50 transition-colors"
                >
                  <div className="font-medium">부분 재처리</div>
                  <div className="text-muted-foreground text-[10px]">특정 레벨부터 재실행</div>
                </button>
              </div>
            )}
          </div>
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
          {job.steps
            .filter((step) => step.kind !== 'TRIGGER')
            .map((step) => (
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

      {/* D-02: 부분 재처리 다이얼로그 */}
      {partialDialogOpen && (
        <PartialReprocessDialog onClose={() => setPartialDialogOpen(false)} onConfirm={handlePartialConfirm} />
      )}
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

// D-02: 부분 재처리 다이얼로그
const LEVELS: ProductLevel[] = ['LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];

function PartialReprocessDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (targetLevel: ProductLevel) => void;
}) {
  const [selectedLevel, setSelectedLevel] = useState<ProductLevel>('LEVEL_1');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">부분 재처리</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">선택한 레벨부터 이후 단계를 재실행합니다.</p>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">재처리 시작 레벨</label>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value as ProductLevel)}
              className="w-full bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
            <div className="text-[10px] text-muted-foreground">
              대상 CSC: 자동 선택 (해당 레벨의 처리 CSC)
            </div>
          </div>

          {selectedLevel === 'LEVEL_0' && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-warning/10 border border-warning/30">
              <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-warning">LEVEL_0 선택 시 전체 파이프라인이 재실행됩니다.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => onConfirm(selectedLevel)}
            className="flex-1 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 transition-colors"
          >
            재처리 요청
          </button>
        </div>
      </div>
    </div>
  );
}
