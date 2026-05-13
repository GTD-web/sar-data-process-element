'use client';

import { useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { Product } from '@/types/pipeline';
import { PRODUCT_LEVEL_LABELS } from '@/types/pipeline';

interface ProductReprocessConfirmDialogProps {
  product: Product;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ProductReprocessConfirmDialog({
  product,
  onConfirm,
  onCancel,
}: ProductReprocessConfirmDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-reprocess-dialog-title"
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-accent" />
            <h2 id="product-reprocess-dialog-title" className="text-sm font-semibold text-foreground">
              Reprocess Product
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <p className="text-xs text-muted-foreground">
            A new job will be created to reprocess this product up to{' '}
            <span className="font-semibold text-foreground">{PRODUCT_LEVEL_LABELS[product.level]}</span>. The existing
            product remains archived as a previous version.
          </p>

          <div className="space-y-1 rounded-lg bg-muted/30 px-3 py-2.5">
            <DetailRow label="Product ID" value={product.id} mono />
            <DetailRow label="Level" value={PRODUCT_LEVEL_LABELS[product.level]} mono />
            <DetailRow label="Scene" value={product.rawDataName ?? product.sceneId} mono />
            <DetailRow label="Source Job" value={product.jobId} mono />
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-border py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-md bg-accent py-1.5 text-xs font-medium text-background transition-colors hover:bg-accent/90"
          >
            Request Reprocess
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2 text-[11px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 truncate text-right text-foreground ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </span>
    </div>
  );
}
