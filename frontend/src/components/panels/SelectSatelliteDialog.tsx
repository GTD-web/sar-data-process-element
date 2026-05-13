'use client';

import { useEffect, useState } from 'react';
import { Satellite, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SATELLITE_OPTIONS } from '@/types/pipeline';

interface SelectSatelliteDialogProps {
  /** 모달이 처음 강제로 뜨는 경우 false. 사용자가 사이드바 배지로 다시 띄운 경우 true. */
  cancellable: boolean;
  initialSatelliteId: string | null;
  onConfirm: (satelliteId: string) => void;
  onCancel?: () => void;
}

export default function SelectSatelliteDialog({
  cancellable,
  initialSatelliteId,
  onConfirm,
  onCancel,
}: SelectSatelliteDialogProps) {
  const [selected, setSelected] = useState<string>(initialSatelliteId ?? SATELLITE_OPTIONS[0]);

  useEffect(() => {
    if (!cancellable) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cancellable, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={cancellable ? onCancel : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby="select-satellite-dialog-title"
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Satellite className="h-4 w-4 text-accent" />
            <h2 id="select-satellite-dialog-title" className="text-sm font-semibold text-foreground">
              Select Satellite
            </h2>
          </div>
          {cancellable && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="px-4 pt-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Pick which satellite&apos;s automatic pipelines you want to inspect. The Automatic Pipelines tab will scope
            event-to-pipeline rules to the selected satellite.
          </p>
        </div>

        <div className="space-y-2 px-4 py-3">
          {SATELLITE_OPTIONS.map((satelliteId) => {
            const active = selected === satelliteId;
            return (
              <button
                key={satelliteId}
                type="button"
                onClick={() => setSelected(satelliteId)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition-all duration-150',
                  active
                    ? 'border-accent/70 bg-accent/8'
                    : 'border-border hover:border-border/80 hover:bg-muted/20',
                )}
                aria-pressed={active}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg',
                    active ? 'bg-card/60' : 'bg-muted/50',
                  )}
                >
                  <Satellite className={cn('h-5 w-5', active ? 'text-accent' : 'text-muted-foreground')} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-sm font-semibold', active ? 'text-foreground' : 'text-foreground/80')}>
                      {satelliteId}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Show automation rules that target {satelliteId} (or apply to all satellites).
                  </div>
                </div>
                <div
                  className={cn(
                    'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all',
                    active ? 'border-accent' : 'border-border',
                  )}
                >
                  {active && <div className="h-1.5 w-1.5 rounded-full bg-accent" />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 border-t border-border px-4 py-3">
          {cancellable && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:brightness-110"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
