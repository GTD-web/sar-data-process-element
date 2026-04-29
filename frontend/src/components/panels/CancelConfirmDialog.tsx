'use client';

import { XCircle, X } from 'lucide-react';

interface CancelConfirmDialogProps {
  jobId: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** S-01: Job 취소 확인 다이얼로그 */
export default function CancelConfirmDialog({ jobId, onConfirm, onCancel }: CancelConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-destructive" />
            <h2 className="text-sm font-semibold text-foreground">Cancel Job</h2>
          </div>
          <button onClick={onCancel} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            This will cancel the in-progress job. This action cannot be undone.
          </p>
          <div className="bg-muted/30 rounded-lg px-3 py-2 text-[11px] flex justify-between">
            <span className="text-muted-foreground">Job ID</span>
            <span className="font-mono font-semibold text-foreground">{jobId}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            Go Back
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-1.5 rounded-md bg-destructive text-white text-xs font-medium hover:bg-destructive/80 transition-colors"
          >
            Confirm Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
