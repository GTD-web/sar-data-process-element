'use client';

import { useEffect, useMemo, useState } from 'react';
import { Antenna, Check, FileInput, Search, X } from 'lucide-react';
import { cn, formatKST } from '@/lib/utils';
import type { FileInputConfig, PipelineNodeKind, Product, ProductLevel, RawDataSummary } from '@/types/pipeline';
import { PRODUCT_LEVEL_LABELS, SATELLITE_OPTIONS } from '@/types/pipeline';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';

interface FileInputConfigDialogProps {
  /** TRIGGER (raw data 카탈로그) 또는 FILE_INPUT (해당 레벨 product 카탈로그) */
  kind: 'TRIGGER' | 'FILE_INPUT';
  /** FILE_INPUT 일 때만 사용 — 어느 레벨의 product 를 보여줄지. */
  inputLevel?: ProductLevel;
  current?: FileInputConfig;
  onConfirm: (config: FileInputConfig) => void;
  onCancel: () => void;
}

interface PickerItem {
  id: string;
  sceneId: string;
  filePath: string;
  title: string;
  metadata: string;
  satelliteId: string;
  sortKey: string;
}

type SatelliteFilter = 'ALL' | (typeof SATELLITE_OPTIONS)[number];

/**
 * 시작 노드(TRIGGER/FILE_INPUT) 입력 파일 선택 다이얼로그.
 * 카탈로그에서 항상 유효한 파일만 골라 입력으로 지정.
 */
export default function FileInputConfigDialog({
  kind,
  inputLevel,
  current,
  onConfirm,
  onCancel,
}: FileInputConfigDialogProps) {
  const service = usePipelineService();
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [satelliteFilter, setSatelliteFilter] = useState<SatelliteFilter>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [userSelectedId, setUserSelectedId] = useState<string | null>(null);

  const isTrigger = kind === 'TRIGGER';
  const Icon = isTrigger ? Antenna : FileInput;
  const title = 'Pipeline Input';
  const badge = isTrigger
    ? 'RAW · EI-01'
    : `${inputLevel ? PRODUCT_LEVEL_LABELS[inputLevel] : 'L?'} · SI-07`;
  const description = isTrigger
    ? 'Pick the raw data file (CCSDS) this pipeline will process. The pipeline starts from L0.'
    : `Pick the existing ${inputLevel ? PRODUCT_LEVEL_LABELS[inputLevel] : 'processing result'} file this pipeline will start from. Subsequent stages run on top of this file.`;
  const emptyHint = isTrigger
    ? 'No raw data files available in the catalog.'
    : `No ${inputLevel ? PRODUCT_LEVEL_LABELS[inputLevel] : ''} products available in the catalog.`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (isTrigger) {
        const res = await service.원시데이터_목록을_조회한다({ limit: 500 });
        if (!cancelled && res.data) {
          const mapped = res.data.items.map(rawToPickerItem);
          mapped.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
          setItems(mapped);
        }
      } else if (inputLevel) {
        const res = await service.제품_목록을_조회한다({ level: inputLevel, status: 'COMPLETED', limit: 500 });
        if (!cancelled && res.data) {
          const mapped = res.data.items.map((p) => productToPickerItem(p, inputLevel));
          mapped.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
          setItems(mapped);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isTrigger, inputLevel, service]);

  // current 입력값이 카탈로그에 있으면 사용자가 직접 고르기 전까지 그 항목을 기본 선택으로 둔다.
  const defaultSelectedId = useMemo(() => {
    if (!current) return null;
    return items.find((it) => it.sceneId === current.sceneId)?.id ?? null;
  }, [current, items]);
  const selectedId = userSelectedId ?? defaultSelectedId;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // ISO sortKey 와 비교하기 위해 yyyy-mm-dd 를 ISO 경계로 변환.
    const fromBound = dateFrom ? `${dateFrom}T00:00:00.000Z` : null;
    const toBound = dateTo ? `${dateTo}T23:59:59.999Z` : null;
    return items.filter((it) => {
      if (satelliteFilter !== 'ALL' && it.satelliteId !== satelliteFilter) return false;
      if (fromBound && it.sortKey < fromBound) return false;
      if (toBound && it.sortKey > toBound) return false;
      if (!q) return true;
      return (
        it.sceneId.toLowerCase().includes(q) ||
        it.title.toLowerCase().includes(q) ||
        it.metadata.toLowerCase().includes(q)
      );
    });
  }, [items, query, satelliteFilter, dateFrom, dateTo]);

  const dateFilterActive = dateFrom !== '' || dateTo !== '';

  const satelliteCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) counts.set(it.satelliteId, (counts.get(it.satelliteId) ?? 0) + 1);
    return counts;
  }, [items]);

  const selected = items.find((it) => it.id === selectedId) ?? null;

  const handleApply = () => {
    if (!selected) return;
    onConfirm({ sceneId: selected.sceneId, inputFilePath: selected.filePath });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex w-full max-w-lg max-h-[80vh] flex-col rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
              {badge}
            </span>
          </div>
          <button onClick={onCancel} className="rounded-md p-1 transition-colors hover:bg-muted/50" aria-label="Close">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
          <p className="text-xs text-muted-foreground">{description}</p>

          {/* Search */}
          <div className="relative shrink-0">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by ID, scene, satellite..."
              autoFocus
              className="w-full rounded-md border border-border bg-muted py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>

          {/* Satellite filter */}
          <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Filter by satellite">
            <SatelliteFilterButton
              label="All"
              active={satelliteFilter === 'ALL'}
              count={items.length}
              onClick={() => setSatelliteFilter('ALL')}
            />
            {SATELLITE_OPTIONS.map((sat) => (
              <SatelliteFilterButton
                key={sat}
                label={sat}
                active={satelliteFilter === sat}
                count={satelliteCounts.get(sat) ?? 0}
                onClick={() => setSatelliteFilter(sat)}
              />
            ))}
          </div>

          {/* Date range filter */}
          <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">Date</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              max={dateTo || undefined}
              aria-label="From date"
              className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <span className="text-muted-foreground/60">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              aria-label="To date"
              className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            {dateFilterActive && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
                className="ml-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {/* List */}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-background">
            {loading ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {items.length === 0 ? emptyHint : 'No items match the search.'}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((item) => {
                  const isSelected = selectedId === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setUserSelectedId(item.id)}
                        className={cn(
                          'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors',
                          isSelected ? 'bg-accent/15' : 'hover:bg-muted/40',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full',
                            isSelected ? 'bg-accent' : 'bg-muted-foreground/30',
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-[11px] font-semibold text-foreground" title={item.title}>
                            {item.title}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground" title={item.metadata}>
                            {item.metadata}
                          </div>
                        </div>
                        {isSelected && <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Selected summary */}
          {selected ? (
            <div className="shrink-0 space-y-1 rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">Selected</div>
              <div className="truncate font-mono text-[11px] text-foreground" title={selected.sceneId}>
                {selected.sceneId}
              </div>
              <div className="truncate font-mono text-[10px] text-muted-foreground" title={selected.filePath}>
                {selected.filePath}
              </div>
            </div>
          ) : (
            <div className="shrink-0 rounded-md border border-dashed border-border px-3 py-2 text-center text-[11px] text-muted-foreground">
              Pick a file from the list above.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-md border border-border py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!selected}
            className={cn(
              'flex-1 rounded-md py-1.5 text-xs font-medium transition-colors',
              selected
                ? 'bg-accent text-accent-foreground hover:brightness-110'
                : 'cursor-not-allowed bg-muted text-muted-foreground',
            )}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function rawToPickerItem(raw: RawDataSummary): PickerItem {
  return {
    id: raw.id,
    sceneId: raw.id,
    filePath: raw.rawDataPath,
    title: raw.title,
    metadata: `${raw.satelliteId} · ${raw.mode} · ${formatBytes(raw.fileSizeBytes)} · ${formatKST(raw.capturedAt)}`,
    satelliteId: raw.satelliteId,
    sortKey: raw.capturedAt,
  };
}

function productToPickerItem(product: Product, level: ProductLevel): PickerItem {
  const lvl = level.toLowerCase().replace('level_', 'l');
  return {
    id: product.id,
    sceneId: product.sceneId,
    filePath: `/mnt/nas/sdpe/output/${lvl}/${product.sceneId}.h5`,
    title: product.id,
    metadata: `${product.satelliteId} · ${product.mode} · ${product.polarization} · ${formatKST(product.acquisitionStart)}`,
    satelliteId: product.satelliteId,
    sortKey: product.acquisitionStart,
  };
}

function SatelliteFilterButton({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors',
        active
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-border bg-background text-muted-foreground hover:border-accent/40 hover:text-foreground',
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 font-mono text-[9px] leading-none',
          active ? 'bg-accent/20 text-accent' : 'bg-muted/60 text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

// Re-export kind type alias for callers
export type FileInputDialogKind = Extract<PipelineNodeKind, 'TRIGGER' | 'FILE_INPUT'>;
