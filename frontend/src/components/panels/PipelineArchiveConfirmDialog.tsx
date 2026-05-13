'use client';

import { useState } from 'react';
import { Archive, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PipelineArchiveConfirmDialogProps {
  pipelineName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export default function PipelineArchiveConfirmDialog({
  pipelineName,
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
            <h2 className="text-sm font-semibold text-foreground">Archive Pipeline</h2>
          </div>
          <button type="button" onClick={onCancel} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Archived pipelines move to the archive and cannot be activated for operational events. The reason remains available from the Archive page.
          </p>

          <div className="bg-muted/30 rounded-lg px-3 py-2.5">
            <div className="flex justify-between gap-3 text-[11px]">
              <span className="text-muted-foreground">Name</span>
              <span className="font-semibold text-foreground text-right">{pipelineName}</span>
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-foreground">Archive reason</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Example: Replaced by a new processing profile."
              autoFocus
              rows={4}
              className={cn(
                'w-full resize-none bg-muted border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1',
                isConfirmEnabled
                  ? 'border-warning/50 focus:ring-warning/50'
                  : 'border-border focus:ring-accent/50',
              )}
            />
            <span className="block text-[10px] text-muted-foreground">Enter at least 5 characters.</span>
          </label>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            Cancel
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
            Confirm Archive
          </button>
        </div>
      </div>
    </div>
  );
}
