'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReprocessConfirmDialogProps {
  jobId: string;
  sceneId: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** S-01 + S-02: 전체 재처리 확인 다이얼로그 — Job ID 직접 타이핑으로 2단계 확인 */
export default function ReprocessConfirmDialog({ jobId, sceneId, onConfirm, onCancel }: ReprocessConfirmDialogProps) {
  const [inputJobId, setInputJobId] = useState('');
  const isConfirmEnabled = inputJobId === jobId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <h2 className="text-sm font-semibold text-foreground">Job 재처리 요청</h2>
          </div>
          <button onClick={onCancel} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            아래 Job을 처음부터 재처리합니다. 진행 중인 모든 단계가 초기화됩니다.
          </p>

          <div className="bg-muted/30 rounded-lg px-3 py-2.5 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Job ID</span>
              <span className="font-mono font-semibold text-foreground">{jobId}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Scene</span>
              <span className="font-mono text-foreground">{sceneId}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              확인을 위해 Job ID를 입력하세요
            </label>
            <input
              type="text"
              value={inputJobId}
              onChange={(e) => setInputJobId(e.target.value)}
              placeholder={`Job ID를 입력하세요 (예: ${jobId})`}
              autoFocus
              className={cn(
                'w-full bg-muted border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1',
                isConfirmEnabled
                  ? 'border-success/50 focus:ring-success/50'
                  : 'border-border focus:ring-accent/50',
              )}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={!isConfirmEnabled}
            className={cn(
              'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
              isConfirmEnabled
                ? 'bg-destructive text-white hover:bg-destructive/80'
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
