'use client';

import { useState } from 'react';
import { formatDuration, formatKST } from '@/lib/utils';
import { JobStatusBadge, StepStatusBadge } from '@/components/ui/StatusBadge';
import type { JobDetail, SarStage } from '@/types/pipeline';
import {
  SAR_STAGE_LABELS, SAR_STAGE_TASKS, SAR_STAGE_TO_LEVEL, PRODUCT_LEVEL_LABELS,
  CSC_VT_SECONDS, NODE_KIND_INFO,
} from '@/types/pipeline';
import { RefreshCw, XCircle, ChevronDown, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JobDetailPanelProps {
  job: JobDetail;
  onReprocess: () => void;
  onPartialReprocess: (sarStage: SarStage) => void;
  onCancel: () => void;
  onStepClick?: (stepOrder: number, clickY: number) => void;
  activeStepOrder?: number | null;
}

export default function JobDetailPanel({ job, onReprocess, onPartialReprocess, onCancel, onStepClick, activeStepOrder }: JobDetailPanelProps) {
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

  const handlePartialConfirm = (sarStage: SarStage) => {
    setPartialDialogOpen(false);
    onPartialReprocess(sarStage);
  };

  const availableStages = Array.from(
    new Set(
      job.steps
        .filter((s) => s.kind === 'SAR' && s.sarStage !== undefined)
        .filter((s) => job.status !== 'FAILED' || s.status === 'COMPLETED' || s.status === 'FAILED')
        .map((s) => s.sarStage!),
    ),
  );
  const canPartialReprocess = availableStages.length > 0;

  // 전체 재처리 설명 문구: 파이프라인이 FILE_INPUT으로 시작하면 해당 레벨 이후만 재실행,
  // TRIGGER로 시작하면 L0부터 재실행
  const fileInputStep = job.steps.find((s) => s.kind === 'FILE_INPUT');
  const fullReprocessDesc = fileInputStep?.inputLevel
    ? `${PRODUCT_LEVEL_LABELS[fileInputStep.inputLevel] ?? fileInputStep.inputLevel} 입력 이후 전체 재실행`
    : 'L0부터 전체 재실행';

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
                  <div className="text-muted-foreground text-[10px]">{fullReprocessDesc}</div>
                </button>
                {canPartialReprocess && (
                  <>
                    <div className="h-px bg-border" />
                    <button
                      onClick={handleOpenPartialDialog}
                      className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <div className="font-medium">부분 재처리</div>
                      <div className="text-muted-foreground text-[10px]">
                        {job.status === 'FAILED'
                          ? '실패 지점까지 도달한 스테이지부터 재실행'
                          : '특정 스테이지부터 재실행'}
                      </div>
                    </button>
                  </>
                )}
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
          {job.steps.map((step) => {
              const isSAR = step.kind === 'SAR' && step.sarStage;
              const isCatalog = step.kind === 'CATALOG';
              const isThumbnail = step.kind === 'THUMBNAIL';
              const isTrigger = step.kind === 'TRIGGER';
              const isFileInput = step.kind === 'FILE_INPUT';
              const isJobInit = step.kind === 'JOB_INIT';
              const isSpecialNode = isTrigger || isFileInput || isJobInit || isCatalog || isThumbnail;
              const kindInfo = isSpecialNode ? NODE_KIND_INFO[step.kind!] : undefined;

              const stageLabel = isSAR
                ? `${step.sarStage} · ${SAR_STAGE_LABELS[step.sarStage!]}`
                : isTrigger
                  ? '원시 데이터 수신 트리거'
                  : isFileInput
                    ? `${PRODUCT_LEVEL_LABELS[step.inputLevel ?? step.productLevel] ?? 'L?'} 결과 입력`
                    : isJobInit
                      ? '작업 초기화'
                      : isCatalog
                        ? '카탈로그 등록'
                        : isThumbnail
                          ? 'Quick-look 생성'
                          : step.targetCsc;
              const levelLabel = isSAR
                ? PRODUCT_LEVEL_LABELS[SAR_STAGE_TO_LEVEL[step.sarStage!]]
                : step.productLevel;
              const vt = CSC_VT_SECONDS[step.targetCsc];
              const vtOver = step.durationMs !== undefined && vt !== undefined && step.durationMs > vt * 1000;

              const isActive = activeStepOrder === step.order;

              return (
                <div
                  key={step.order}
                  className={cn(
                    'rounded-md px-3 py-2 cursor-pointer transition-colors',
                    isActive
                      ? 'bg-accent/10 ring-1 ring-accent/40'
                      : 'bg-muted/30 hover:bg-muted/40',
                  )}
                  onClick={(e) => onStepClick?.(isActive ? -1 : step.order, e.currentTarget.getBoundingClientRect().top)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-foreground">{stageLabel}</span>
                    <StepStatusBadge status={step.status} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {levelLabel}
                    {step.durationMs !== undefined && ` · ${formatDuration(step.durationMs)}`}
                    {vt && (
                      <span className={vtOver ? 'text-destructive ml-1' : 'text-muted-foreground/60 ml-1'}>
                        {`(VT: ${vt.toLocaleString()}s${vtOver ? ' exceeded' : ''})`}
                      </span>
                    )}
                  </div>
                  {/* 비-SAR 노드 프로세스 목록 */}
                  {kindInfo && step.status === 'COMPLETED' && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {kindInfo.processes.map((proc) => (
                        <span key={proc} className="text-[9px] rounded px-1 py-0.5 bg-success/10 text-success">{proc}</span>
                      ))}
                    </div>
                  )}
                  {/* SAR 스테이지 태스크 목록 */}
                  {isSAR && step.sarStage && (step.status === 'COMPLETED' || step.status === 'RUNNING') && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {SAR_STAGE_TASKS[step.sarStage].map((task) => {
                        const isTaskActive = !step.enabledTasks || step.enabledTasks.includes(task);
                        return (
                          <span
                            key={task}
                            className={`text-[9px] rounded px-1 py-0.5 ${
                              isTaskActive ? 'bg-success/10 text-success' : 'bg-muted/50 text-muted-foreground/40 line-through'
                            }`}
                          >{task}</span>
                        );
                      })}
                    </div>
                  )}
                  {step.errorMessage && (
                    <div className="text-[10px] text-destructive mt-0.5">{step.errorMessage}</div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* D-02: 부분 재처리 다이얼로그 */}
      {partialDialogOpen && (
        <PartialReprocessDialog
          jobId={job.jobId}
          availableStages={availableStages}
          onClose={() => setPartialDialogOpen(false)}
          onConfirm={handlePartialConfirm}
        />
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
function PartialReprocessDialog({
  jobId,
  availableStages,
  onClose,
  onConfirm,
}: {
  jobId: string;
  availableStages: SarStage[];
  onClose: () => void;
  onConfirm: (sarStage: SarStage) => void;
}) {
  const defaultStage = availableStages[0] ?? 'L0';
  const [selectedStage, setSelectedStage] = useState<SarStage>(defaultStage);
  const [inputJobId, setInputJobId] = useState('');
  const requiresJobId = selectedStage === 'L0';
  const isConfirmEnabled = !requiresJobId || inputJobId === jobId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">부분 재처리</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">선택한 스테이지부터 이후 단계를 재실행합니다.</p>
          {availableStages.length > 0 && (
            <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              선택 가능 범위: {availableStages.map((stage) => `${stage} · ${SAR_STAGE_LABELS[stage]}`).join(', ')}
            </div>
          )}
          <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/30 border border-border/50 text-[11px] text-muted-foreground">
            <span className="flex-shrink-0 mt-0.5">ℹ</span>
            <span>재처리 완료 후 카탈로그 노드가 신규 버전을 등록합니다. 기존 산출물은 아카이빙되고 최신 버전이 PUBLISHED 상태로 전환됩니다.</span>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">재처리 시작 스테이지</label>
            <select
              value={selectedStage}
              onChange={(e) => { setSelectedStage(e.target.value as SarStage); setInputJobId(''); }}
              className="w-full bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {availableStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage} — {SAR_STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
          </div>
          {requiresJobId && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-2.5 rounded-md bg-warning/10 border border-warning/30">
                <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-warning">L0 선택 시 전체 파이프라인이 재실행됩니다.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">확인을 위해 Job ID를 입력하세요</label>
                <input
                  type="text"
                  value={inputJobId}
                  onChange={(e) => setInputJobId(e.target.value)}
                  placeholder={`Job ID를 입력하세요 (예: ${jobId})`}
                  autoFocus
                  className={cn(
                    'w-full bg-muted border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1',
                    inputJobId === jobId
                      ? 'border-success/50 focus:ring-success/50'
                      : 'border-border focus:ring-accent/50',
                  )}
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => onConfirm(selectedStage)}
            disabled={!isConfirmEnabled}
            className={cn(
              'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
              isConfirmEnabled
                ? 'bg-accent text-accent-foreground hover:bg-accent/80'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            재처리 요청
          </button>
        </div>
      </div>
    </div>
  );
}
