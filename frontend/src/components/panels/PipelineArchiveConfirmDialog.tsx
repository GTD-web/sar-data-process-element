'use client';

import { useState } from 'react';
import { Archive, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PipelineArchiveConfirmDialogProps {
  pipelineName: string;
  satelliteId: string;
  mode: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export default function PipelineArchiveConfirmDialog({
  pipelineName,
  satelliteId,
  mode,
  onConfirm,
  onCancel,
}: PipelineArchiveConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const trimmedReason = reason.trim();
  const isConfirmEnabled = trimmedReason.length >= 5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-warning" />
            <h2 className="text-sm font-semibold text-foreground">파이프라인 폐기</h2>
          </div>
          <button type="button" onClick={onCancel} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            폐기된 파이프라인은 아카이브로 이동하며 운영 이벤트에 배포할 수 없습니다. 추후 아카이브 페이지에서 사유를 확인할 수 있습니다.
          </p>

          <div className="bg-muted/30 rounded-lg px-3 py-2.5 space-y-1">
            <div className="flex justify-between gap-3 text-[11px]">
              <span className="text-muted-foreground">이름</span>
              <span className="font-semibold text-foreground text-right">{pipelineName}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">대상</span>
              <span className="font-mono text-foreground">{satelliteId} · {mode}</span>
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-foreground">폐기 사유</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 신규 처리 프로파일로 대체되어 기존 운영 구성을 폐기합니다."
              autoFocus
              rows={4}
              className={cn(
                'w-full resize-none bg-muted border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1',
                isConfirmEnabled
                  ? 'border-warning/50 focus:ring-warning/50'
                  : 'border-border focus:ring-accent/50',
              )}
            />
            <span className="block text-[10px] text-muted-foreground">최소 5자 이상 입력하세요.</span>
          </label>
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
            onClick={() => onConfirm(trimmedReason)}
            disabled={!isConfirmEnabled}
            className={cn(
              'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
              isConfirmEnabled
                ? 'bg-warning text-background hover:brightness-110'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            폐기 확인
          </button>
        </div>
      </div>
    </div>
  );
}
