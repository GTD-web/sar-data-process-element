'use client';

import { Radio, Plug, X } from 'lucide-react';

interface PipelineDeployConfirmDialogProps {
  pipelineName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PipelineDeployConfirmDialog({
  pipelineName,
  onConfirm,
  onCancel,
}: PipelineDeployConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Plug className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">Activate Auto-Run Binding</h2>
          </div>
          <button type="button" onClick={onCancel} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Once activated, this pipeline will start auto-running for any matching pgmq event.
          </p>
          <div className="bg-muted/30 rounded-lg px-3 py-2.5 space-y-1">
            <div className="flex justify-between gap-3 text-[11px]">
              <span className="text-muted-foreground">Name</span>
              <span className="font-semibold text-foreground text-right">{pipelineName}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Status</span>
              <span className="inline-flex items-center gap-1 text-accent">
                <Radio className="w-3 h-3" />
                Auto-run binding will be active
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
            className="flex-1 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:brightness-110 transition-colors"
          >
            Activate
          </button>
        </div>
      </div>
    </div>
  );
}
