'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Check, Circle, FileInput, Search, X } from 'lucide-react';
import { cn, formatDuration, formatKST } from '@/lib/utils';
import { StepStatusBadge } from '@/components/ui/StatusBadge';
import type {
  FileInputConfig,
  PipelineStepDefinition,
  Product,
  ProductLevel,
  RawDataSummary,
  StepStatus,
} from '@/types/pipeline';
import { NODE_KIND_INFO, PRODUCT_LEVEL_LABELS, SATELLITE_OPTIONS } from '@/types/pipeline';

type SatelliteFilter = 'ALL' | (typeof SATELLITE_OPTIONS)[number];

export type EntryInputKind = 'RAW' | 'L0' | 'L1' | 'L2';

export interface EntryFileOption {
  sceneId: string;
  title: string;
  satelliteId: string;
  filePath: string;
  fileSizeBytes: number;
  capturedAt?: string;
  level: EntryInputKind;
}

interface EntryNodePopoverProps {
  entryStep: PipelineStepDefinition;
  /** 실행 중인 Job의 해당 스텝 상태 (없으면 PENDING 처리) */
  jobStepStatus?: StepStatus;
  jobStepDurationMs?: number;
  jobStepStartedAt?: string;
  jobStepFinishedAt?: string;
  rawDataItems: RawDataSummary[];
  products: Product[];
  saving: boolean;
  onSelect: (config: FileInputConfig) => void;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 100 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function entryInputKind(step: Pick<PipelineStepDefinition, 'kind' | 'inputLevel'>): EntryInputKind | null {
  if (step.kind === 'TRIGGER') return 'RAW';
  if (step.kind === 'FILE_INPUT') {
    if (step.inputLevel === 'LEVEL_0') return 'L0';
    if (step.inputLevel === 'LEVEL_1') return 'L1';
    if (step.inputLevel === 'LEVEL_2') return 'L2';
  }
  return null;
}

function levelToProductLevel(level: EntryInputKind): ProductLevel | null {
  if (level === 'L0') return 'LEVEL_0';
  if (level === 'L1') return 'LEVEL_1';
  if (level === 'L2') return 'LEVEL_2';
  return null;
}

function rawSizeForLevel(rawSize: number, level: EntryInputKind): number {
  if (level === 'RAW' || level === 'L0') return rawSize;
  if (level === 'L1') return Math.round(rawSize * 0.55);
  if (level === 'L2') return Math.round(rawSize * 0.32);
  return Math.round(rawSize * 0.18);
}

/** 파일 경로는 sceneId 가 아니라 raw 데이터 파일명(예: X1_20260506_..._34-950000_126-140000)을
 *  그대로 사용한다. RAW/L0/L1/L2 모두 같은 베이스 파일명을 공유. */
function productPath(level: EntryInputKind, fileName: string): string {
  if (level === 'RAW') return `/mnt/nas/sdpe/raw/${fileName}.h5`;
  return `/mnt/nas/sdpe/output/${level.toLowerCase()}/${fileName}.h5`;
}

function buildOptions(
  kind: EntryInputKind,
  rawDataItems: RawDataSummary[],
  products: Product[],
): EntryFileOption[] {
  if (kind === 'RAW') {
    // RawDataSummary 도 동일 scene 이 여러 번 등장할 수 있으니 첫 항목만 유지.
    const seen = new Set<string>();
    const uniqueRaws = rawDataItems.filter((raw) => {
      if (seen.has(raw.id)) return false;
      seen.add(raw.id);
      return true;
    });
    return uniqueRaws.map<EntryFileOption>((raw) => ({
      sceneId: raw.id,
      title: raw.title,
      satelliteId: raw.satelliteId,
      filePath: productPath('RAW', raw.title),
      fileSizeBytes: raw.fileSizeBytes,
      capturedAt: raw.capturedAt,
      level: 'RAW',
    }));
  }
  const productLevel = levelToProductLevel(kind);
  const rawById = new Map(rawDataItems.map((raw) => [raw.id, raw]));
  // 동일 sceneId 의 재처리 결과(Job 별 중복)가 다수 있으므로 가장 최근 createdAt 만 남긴다.
  const latestPerScene = new Map<string, Product>();
  for (const product of products) {
    if (product.level !== productLevel) continue;
    const existing = latestPerScene.get(product.sceneId);
    if (!existing || new Date(product.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      latestPerScene.set(product.sceneId, product);
    }
  }
  return Array.from(latestPerScene.values()).map<EntryFileOption>((product) => {
    const raw = rawById.get(product.rawDataId);
    const baseSize = raw?.fileSizeBytes ?? 4 * 1024 * 1024 * 1024;
    const fileName = product.rawDataName ?? raw?.title ?? product.sceneId;
    return {
      sceneId: product.sceneId,
      title: fileName,
      satelliteId: product.satelliteId,
      filePath: productPath(kind, fileName),
      fileSizeBytes: rawSizeForLevel(baseSize, kind),
      capturedAt: product.acquisitionStart,
      level: kind,
    };
  });
}

function entryHeaderLabel(kind: EntryInputKind | null): string {
  if (kind === 'RAW') return 'Raw data input';
  if (kind === 'L0') return 'L0 data input';
  if (kind === 'L1') return 'L1 data input';
  if (kind === 'L2') return 'L2 data input';
  return 'Pipeline input';
}

export default function EntryNodePopover({
  entryStep,
  jobStepStatus,
  jobStepDurationMs,
  jobStepStartedAt,
  jobStepFinishedAt,
  rawDataItems,
  products,
  saving,
  onSelect,
  onClose,
}: EntryNodePopoverProps) {
  const [search, setSearch] = useState('');
  const [satelliteFilter, setSatelliteFilter] = useState<SatelliteFilter>('ALL');
  /** 사용자가 클릭만 한 상태 — 아직 onSelect 으로 부모에 반영되지 않은 후보. */
  const [pendingOption, setPendingOption] = useState<EntryFileOption | null>(null);

  const kind = entryInputKind(entryStep);
  const headerLabel = entryHeaderLabel(kind);
  const status = jobStepStatus ?? 'PENDING';
  const description = entryStep.kind ? NODE_KIND_INFO[entryStep.kind]?.description : undefined;
  const levelLabel = entryStep.inputLevel ? PRODUCT_LEVEL_LABELS[entryStep.inputLevel] : (kind === 'RAW' ? 'RAW' : '—');

  const options = useMemo(
    () => (kind ? buildOptions(kind, rawDataItems, products) : []),
    [kind, rawDataItems, products],
  );
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return options.filter((opt) => {
      if (satelliteFilter !== 'ALL' && opt.satelliteId !== satelliteFilter) return false;
      if (!keyword) return true;
      return (
        opt.sceneId.toLowerCase().includes(keyword)
        || opt.title.toLowerCase().includes(keyword)
        || opt.satelliteId.toLowerCase().includes(keyword)
        || opt.filePath.toLowerCase().includes(keyword)
      );
    });
  }, [search, options, satelliteFilter]);

  const satelliteCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const opt of options) counts.set(opt.satelliteId, (counts.get(opt.satelliteId) ?? 0) + 1);
    return counts;
  }, [options]);

  // 기본 선택 — fileInputConfig 가 없으면 첫 번째 매칭 옵션을 현재 입력으로 본다.
  const explicitSceneId = entryStep.fileInputConfig?.sceneId;
  const currentOption = explicitSceneId
    ? options.find((opt) => opt.sceneId === explicitSceneId)
    : options[0];
  const current = currentOption
    ? { sceneId: currentOption.sceneId, inputFilePath: currentOption.filePath }
    : undefined;
  const currentSize = currentOption?.fileSizeBytes;
  const hasPendingChange =
    !!pendingOption && pendingOption.sceneId !== currentOption?.sceneId;
  const handleApply = () => {
    if (!hasPendingChange || !pendingOption) return;
    onSelect({ sceneId: pendingOption.sceneId, inputFilePath: pendingOption.filePath });
  };
  const handleCancelPending = () => setPendingOption(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={headerLabel}
    >
      <div
        className="flex h-[min(85vh,720px)] w-[min(92vw,720px)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex shrink-0 items-center justify-center rounded border border-accent/50 bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent">
              {kind ?? '—'}
            </span>
            <span className="truncate text-sm font-semibold text-foreground">{headerLabel}</span>
            <StepStatusBadge status={status} />
          </div>
          <button
            onClick={onClose}
            className="ml-2 shrink-0 rounded-md p-1 transition-colors hover:bg-muted/50"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Static info — 위쪽 영역은 스크롤 없이 고정 */}
        <div className="shrink-0 space-y-3 border-b border-border/70 px-5 py-4">
          {description && (
            <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <MetaRow label="Level" value={levelLabel} />
            <MetaRow label="CSC" value={entryStep.kind === 'TRIGGER' || entryStep.kind === 'FILE_INPUT' ? 'CSC-02' : '—'} />
            {jobStepDurationMs !== undefined && (
              <MetaRow label="Duration" value={formatDuration(jobStepDurationMs)} />
            )}
            {jobStepStartedAt && <MetaRow label="Started" value={formatKST(jobStepStartedAt)} />}
            {jobStepFinishedAt && <MetaRow label="Finished" value={formatKST(jobStepFinishedAt)} />}
          </div>

          <Section title="Current input file">
            {current ? (
              <div className="rounded-md border border-border bg-background/50 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <FileInput className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate font-mono text-[13px] font-semibold text-foreground"
                      title={currentOption?.title ?? current.sceneId}
                    >
                      {currentOption?.title ?? current.sceneId}
                    </div>
                    <div className="break-all font-mono text-[11px] text-muted-foreground">
                      {current.inputFilePath}
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground/80">
                      <span className="font-mono">{currentSize ? formatBytes(currentSize) : '—'}</span>
                      {currentOption?.satelliteId && <span>· {currentOption.satelliteId}</span>}
                      {currentOption?.capturedAt && <span>· {formatKST(currentOption.capturedAt)}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border px-3 py-2.5 text-[11px] italic text-muted-foreground">
                No {kind ?? ''} files are available to use as the input.
              </div>
            )}
          </Section>
        </div>

        {/* Search bar — sticky above scroll list */}
        <div className="shrink-0 border-b border-border/70 px-5 py-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Replace with {kind ?? ''} file
            </span>
            <span className="text-[11px] text-muted-foreground/70">
              {filtered.length} of {options.length}
            </span>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${kind ?? 'file'} scene, satellite, path...`}
              className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
              aria-label="Search alternative input file"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1" role="group" aria-label="Filter by satellite">
            <SatelliteChip
              label="All"
              active={satelliteFilter === 'ALL'}
              count={options.length}
              onClick={() => setSatelliteFilter('ALL')}
            />
            {SATELLITE_OPTIONS.map((sat) => (
              <SatelliteChip
                key={sat}
                label={sat}
                active={satelliteFilter === sat}
                count={satelliteCounts.get(sat) ?? 0}
                onClick={() => setSatelliteFilter(sat)}
              />
            ))}
          </div>
        </div>

        {/* Scrollable file list — 유일한 스크롤 영역 */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-10 text-center text-xs text-muted-foreground">
              {options.length === 0 ? `No ${kind ?? ''} files available.` : 'No matches for the search.'}
            </div>
          ) : (
            filtered.map((opt) => {
              const isApplied = currentOption?.sceneId === opt.sceneId;
              const isPending = pendingOption?.sceneId === opt.sceneId;
              return (
                <button
                  key={opt.sceneId}
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    // 클릭은 즉시 적용하지 않고 "후보(pending)"로만 표시한다.
                    // 같은 항목을 다시 누르면 후보 해제. 현재 적용 항목을 누르면 후보 해제(no-op).
                    if (isPending) {
                      setPendingOption(null);
                    } else if (isApplied) {
                      setPendingOption(null);
                    } else {
                      setPendingOption(opt);
                    }
                  }}
                  className={cn(
                    'flex w-full items-start gap-1.5 border-b border-border/40 py-1.5 pl-4 pr-1 text-left transition-colors last:border-b-0 disabled:cursor-wait disabled:opacity-60',
                    isPending
                      ? 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/60'
                      : isApplied
                        ? 'bg-accent/5 text-accent'
                        : 'text-foreground hover:bg-muted/35',
                  )}
                >
                  <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    {isPending ? (
                      <Circle className="h-3 w-3 fill-current" />
                    ) : isApplied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="block min-w-0 flex-1 truncate font-mono text-[12px] font-semibold"
                        title={opt.title}
                      >
                        {opt.title}
                      </span>
                      <span className="shrink-0 rounded border border-border/70 bg-muted/40 px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                        {opt.satelliteId}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground/80">
                        {formatBytes(opt.fileSizeBytes)}
                        {opt.capturedAt && <span className="ml-1.5">· {formatKST(opt.capturedAt)}</span>}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground/70">
                      {opt.filePath}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer — 후보(pending)가 있을 때만 노출. AS IS → TO BE 비교 + Apply/Cancel.
            끝까지 스크롤하지 않아도 보이도록 sticky bottom 처리. */}
        {hasPendingChange && pendingOption && (
          <div className="shrink-0 border-t border-border bg-muted/25 px-5 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pending change
              </span>
              <span className="text-[10px] text-muted-foreground/70">
                Click Apply to confirm
              </span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="min-w-0 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  AS IS · current
                </div>
                <div
                  className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
                  title={currentOption?.title ?? '—'}
                >
                  {currentOption?.title ?? '—'}
                </div>
                <div
                  className="truncate font-mono text-[10px] text-muted-foreground/70"
                  title={currentOption?.filePath ?? ''}
                >
                  {currentOption?.filePath ?? ''}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0 rounded-md border border-accent/50 bg-accent/10 px-2.5 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-accent">TO BE · pending</div>
                <div
                  className="mt-0.5 truncate font-mono text-[11px] font-semibold text-accent"
                  title={pendingOption.title}
                >
                  {pendingOption.title}
                </div>
                <div
                  className="truncate font-mono text-[10px] text-accent/80"
                  title={pendingOption.filePath}
                >
                  {pendingOption.filePath}
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelPending}
                disabled={saving}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={saving}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
              >
                {saving ? 'Applying…' : 'Apply'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground/60">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function SatelliteChip({
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
