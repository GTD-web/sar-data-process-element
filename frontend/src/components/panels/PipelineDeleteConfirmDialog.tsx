'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PipelineDeleteConfirmDialogProps {
  pipelineName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PipelineDeleteConfirmDialog({
  pipelineName,
  onConfirm,
  onCancel,
}: PipelineDeleteConfirmDialogProps) {
  const [inputName, setInputName] = useState('');
  const isConfirmEnabled = inputName === pipelineName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <h2 className="text-sm font-semibold text-foreground">파이프라인 삭제</h2>
          </div>
          <button type="button" onClick={onCancel} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            파이프라인 정의와 DAG 구성을 삭제합니다. 운영 목록에서 제거되며 되돌릴 수 없습니다.
          </p>

          <div className="bg-muted/30 rounded-lg px-3 py-2.5">
            <div className="flex justify-between gap-3 text-[11px]">
              <span className="text-muted-foreground">이름</span>
              <span className="font-semibold text-foreground text-right">{pipelineName}</span>
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-foreground">확인을 위해 파이프라인 이름을 입력하세요</span>
            <input
              type="text"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder={pipelineName}
              autoFocus
              className={cn(
                'w-full bg-muted border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1',
                isConfirmEnabled
                  ? 'border-success/50 focus:ring-success/50'
                  : 'border-border focus:ring-accent/50',
              )}
            />
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
            onClick={onConfirm}
            disabled={!isConfirmEnabled}
            className={cn(
              'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
              isConfirmEnabled
                ? 'bg-destructive text-white hover:bg-destructive/80'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            삭제 확인
          </button>
        </div>
      </div>
    </div>
  );
}
