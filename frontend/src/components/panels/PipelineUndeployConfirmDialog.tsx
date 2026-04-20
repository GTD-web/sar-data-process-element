'use client';

import { Radio, Unplug, X } from 'lucide-react';

interface PipelineUndeployConfirmDialogProps {
  pipelineName: string;
  satelliteId?: string;
  mode?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PipelineUndeployConfirmDialog({
  pipelineName,
  satelliteId,
  mode,
  onConfirm,
  onCancel,
}: PipelineUndeployConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Unplug className="w-4 h-4 text-warning" />
            <h2 className="text-sm font-semibold text-foreground">파이프라인 배포 해제</h2>
          </div>
          <button type="button" onClick={onCancel} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            배포를 해제하면 이 파이프라인은 pgmq 이벤트와 매칭되어 자동 실행되지 않습니다.
          </p>
          <div className="bg-muted/30 rounded-lg px-3 py-2.5 space-y-1">
            <div className="flex justify-between gap-3 text-[11px]">
              <span className="text-muted-foreground">이름</span>
              <span className="font-semibold text-foreground text-right">{pipelineName}</span>
            </div>
            {(satelliteId || mode) && (
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">대상</span>
                <span className="font-mono text-foreground">{[satelliteId, mode].filter(Boolean).join(' · ')}</span>
              </div>
            )}
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">상태</span>
              <span className="inline-flex items-center gap-1 text-warning">
                <Radio className="w-3 h-3" />
                자동 실행 연결 제거
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-1.5 rounded-md bg-destructive text-white text-xs font-medium hover:bg-destructive/80 transition-colors"
          >
            배포 해제
          </button>
        </div>
      </div>
    </div>
  );
}
