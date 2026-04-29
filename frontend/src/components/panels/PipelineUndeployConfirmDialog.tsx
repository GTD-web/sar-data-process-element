'use client';

import { Radio, Unplug, X } from 'lucide-react';

interface PipelineUndeployConfirmDialogProps {
  pipelineName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PipelineUndeployConfirmDialog({
  pipelineName,
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
            <h2 className="text-sm font-semibold text-foreground">Disable Auto-Run Binding</h2>
          </div>
          <button type="button" onClick={onCancel} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Once disabled, this pipeline will no longer match pgmq events for auto-run.
          </p>
          <div className="bg-muted/30 rounded-lg px-3 py-2.5 space-y-1">
            <div className="flex justify-between gap-3 text-[11px]">
              <span className="text-muted-foreground">Name</span>
              <span className="font-semibold text-foreground text-right">{pipelineName}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Status</span>
              <span className="inline-flex items-center gap-1 text-warning">
                <Radio className="w-3 h-3" />
                Auto-run binding removed
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
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-1.5 rounded-md bg-destructive text-white text-xs font-medium hover:bg-destructive/80 transition-colors"
          >
            Disable
          </button>
        </div>
      </div>
    </div>
  );
}
