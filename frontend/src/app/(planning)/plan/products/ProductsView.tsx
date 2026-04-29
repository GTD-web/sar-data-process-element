'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import { toast } from '@/components/ui/Toast';
import type { JobSummary, PipelineDefinition, Product, ProductLevel } from '@/types/pipeline';
import { PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { cn, formatKST, formatDuration } from '@/lib/utils';
import {
  Package,
  Search,
  Download,
  RefreshCw,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  CheckCircle,
  XCircle,
  Image as ImageIcon,
  MapPin,
  Clock,
  Ruler,
  Eye,
  GitBranch,
} from 'lucide-react';

const SATELLITES = ['Lumir-X1', 'Lumir-X2', 'Lumir-X3'];
const MODES = ['Stripmap', 'ScanSAR', 'Spotlight'];
const LEVELS: ProductLevel[] = ['LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];
const STATUSES = ['COMPLETED', 'FAILED', 'PROCESSING'];
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const PRODUCT_TABLE_COLUMNS = [
  { id: 'id', label: 'Product ID', align: 'left' },
  { id: 'sceneId', label: 'Raw Data', align: 'left' },
  { id: 'level', label: 'Level', align: 'center' },
  { id: 'pipeline', label: 'Pipeline', align: 'left' },
  { id: 'satelliteId', label: 'Satellite', align: 'left' },
  { id: 'mode', label: 'Mode', align: 'left' },
  { id: 'status', label: 'Status', align: 'center' },
  { id: 'createdAt', label: 'Created', align: 'left' },
] as const;

type ProductSortKey = (typeof PRODUCT_TABLE_COLUMNS)[number]['id'];

function getRawDataDisplayName(product: Product) {
  return product.rawDataName ?? product.sceneId;
}

function SortIcon({ active, order }: { active: boolean; order: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  return order === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
}

function getPageRange(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('ellipsis');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

function Pagination({
  page,
  totalPages,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  const range = getPageRange(page, totalPages);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border bg-card shrink-0">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>Per page</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="bg-background border border-border rounded-md px-1.5 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="font-mono tabular-nums">
          {start}–{end} / {total}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        {range.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e-${i}`} className="px-1.5 text-[11px] text-muted-foreground select-none">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={cn(
                'min-w-6.5 px-2 py-1 text-[11px] rounded-md border transition-colors tabular-nums',
                p === page
                  ? 'border-accent bg-accent text-background font-semibold'
                  : 'border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground',
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function ProductStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: 'bg-success/15 text-success',
    FAILED: 'bg-destructive/15 text-destructive',
    PROCESSING: 'bg-accent/15 text-accent',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-medium',
        styles[status] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {status === 'COMPLETED' && <CheckCircle className="w-3 h-3" />}
      {status === 'FAILED' && <XCircle className="w-3 h-3" />}
      {status}
    </span>
  );
}

function QualityBadge({ pass }: { pass: boolean }) {
  return pass ? (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-success">
      <CheckCircle className="w-3 h-3" />
      Pass
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-destructive">
      <XCircle className="w-3 h-3" />
      Fail
    </span>
  );
}

function ReprocessDialog({
  product,
  onConfirm,
  onCancel,
}: {
  product: Product;
  onConfirm: (targetLevel: string) => void;
  onCancel: () => void;
}) {
  const currentIdx = LEVELS.indexOf(product.level);
  const availableLevels = LEVELS.filter((_, i) => i >= currentIdx);
  const [targetLevel, setTargetLevel] = useState<string>(availableLevels[0]);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Reprocess Product</h3>

        <div className="space-y-3">
          <div>
            <span className="text-[11px] text-muted-foreground">Raw Data</span>
            <div className="text-xs font-mono text-foreground mt-0.5">{getRawDataDisplayName(product)}</div>
          </div>

          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Start Level</span>
            <select
              value={targetLevel}
              onChange={(e) => setTargetLevel(e.target.value)}
              className="mt-1 w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {availableLevels.map((l) => (
                <option key={l} value={l}>
                  {PRODUCT_LEVEL_LABELS[l]} ({l})
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-[11px] text-muted-foreground">A new Job will be created</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(targetLevel)}
            disabled={!confirmed}
            className={cn(
              'px-4 py-1.5 rounded-md text-xs font-medium transition-colors',
              confirmed
                ? 'bg-accent text-background hover:bg-accent/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            Request Reprocess
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductDetailPanel({
  product,
  pipelineName,
  onClose,
  onDownload,
  onReprocess,
}: {
  product: Product;
  pipelineName?: string;
  onClose: () => void;
  onDownload: () => void;
  onReprocess: () => void;
}) {
  const pathname = usePathname();
  const base = pathname.startsWith('/current') ? '/current' : '/plan';

  return (
    <div className="h-full flex flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">{product.id}</div>
          <div className="text-xs text-muted-foreground">{getRawDataDisplayName(product)}</div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted/50 transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <ProductStatusBadge status={product.status} />
          <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-accent/10 text-accent">
            {PRODUCT_LEVEL_LABELS[product.level]}
          </span>
          {product.level === 'LEVEL_0' && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              HDF5
            </span>
          )}
        </div>

        <div className="rounded-lg border border-border bg-background p-3 flex items-center justify-center aspect-square">
          {product.thumbnailUrl ? (
            <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
              <ImageIcon className="w-8 h-8" />
              <span className="text-xs">Quick-look Thumbnail</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/50">No preview</span>
          )}
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Metadata</h4>
          <div className="grid grid-cols-2 gap-2">
            <MetaItem label="Satellite" value={product.satelliteId} />
            <MetaItem label="Mode" value={product.mode} />
            <MetaItem label="Polarization" value={product.polarization} />
            <MetaItem label="Pipeline" value={pipelineName ?? '—'} />
            <MetaItem label="Job ID" value={product.jobId} href={`${base}/jobs?jobId=${product.jobId}`} />
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            Spatial Extent
          </h4>
          <div className="text-xs font-mono text-foreground bg-background rounded-md px-3 py-2 border border-border">
            W: {product.spatialExtent.west.toFixed(4)}° &nbsp; S: {product.spatialExtent.south.toFixed(4)}°<br />
            E: {product.spatialExtent.east.toFixed(4)}° &nbsp; N: {product.spatialExtent.north.toFixed(4)}°
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Acquisition Time
            </h4>
            <div className="text-xs text-foreground">{formatKST(product.acquisitionStart)}</div>
            <div className="text-xs text-muted-foreground">~ {formatKST(product.acquisitionEnd)}</div>
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
              <Ruler className="w-3 h-3" />
              Resolution
            </h4>
            <div className="text-xs text-foreground">
              Range: {product.resolutionRange.toFixed(1)}m<br />
              Azimuth: {product.resolutionAzimuth.toFixed(1)}m
            </div>
          </div>
        </div>

        <MetaItem label="Processing Time" value={formatDuration(product.processingTimeMs)} />

        {product.quality && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Eye className="w-3 h-3" />
              Quality Check (REQ-FUNC-023)
            </h4>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-background text-muted-foreground">
                    <th className="text-left px-3 py-1.5 font-medium">Metric</th>
                    <th className="text-right px-3 py-1.5 font-medium">Value</th>
                    <th className="text-center px-3 py-1.5 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-foreground">NESZ</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">
                      {product.quality.nesz.value.toFixed(1)} {product.quality.nesz.unit}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <QualityBadge pass={product.quality.nesz.pass} />
                    </td>
                  </tr>
                  <tr className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-foreground">PSLR</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">
                      {product.quality.pslr.value.toFixed(1)} {product.quality.pslr.unit}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <QualityBadge pass={product.quality.pslr.pass} />
                    </td>
                  </tr>
                  <tr className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-foreground">Geometric Accuracy</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">
                      {product.quality.geometricAccuracy.value.toFixed(1)} {product.quality.geometricAccuracy.unit}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <QualityBadge pass={product.quality.geometricAccuracy.pass} />
                    </td>
                  </tr>
                  <tr className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-foreground">Radiometric Calibration</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">—</td>
                    <td className="px-3 py-1.5 text-center">
                      <QualityBadge pass={product.quality.radiometricCalibration.pass} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border px-4 py-3 flex gap-2">
        <button
          onClick={onDownload}
          disabled={product.status !== 'COMPLETED'}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
            product.status === 'COMPLETED'
              ? 'bg-accent text-background hover:bg-accent/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </button>
        <button
          onClick={onReprocess}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-border text-foreground hover:bg-muted/30 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reprocess
        </button>
      </div>
    </div>
  );
}

function MetaItem({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {href ? (
        <a href={href} className="text-sm font-medium text-accent hover:underline">
          {value}
        </a>
      ) : (
        <div className="text-sm font-medium text-foreground">{value}</div>
      )}
    </div>
  );
}

export default function ProductsView() {
  const service = usePipelineService();
  const [products, setProducts] = useState<Product[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const [panelMounted, setPanelMounted] = useState(false);
  const [panelAnimating, setPanelAnimating] = useState(false);
  const panelProductRef = useRef<Product | null>(null);

  function openPanel(product: Product) {
    panelProductRef.current = product;
    setSelectedProduct(product);
    setPanelMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPanelAnimating(true));
    });
  }

  function closePanel() {
    setPanelAnimating(false);
    setTimeout(() => {
      setPanelMounted(false);
      setSelectedProduct(null);
      panelProductRef.current = null;
    }, 200);
  }

  const [filterLevel, setFilterLevel] = useState('');
  const [filterSatellite, setFilterSatellite] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPipeline, setFilterPipeline] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<ProductSortKey>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [reprocessTarget, setReprocessTarget] = useState<Product | null>(null);

  const loadData = useCallback(async () => {
    const [pRes, jRes, plRes, plArchRes] = await Promise.all([
      service.제품_목록을_조회한다({
        level: filterLevel || undefined,
        satelliteId: filterSatellite || undefined,
        mode: filterMode || undefined,
        status: filterStatus || undefined,
        limit: 500,
      }),
      service.Job_목록을_조회한다({ limit: 500 }),
      service.파이프라인_목록을_조회한다(),
      service.아카이브_파이프라인_목록을_조회한다(),
    ]);
    if (pRes.data) {
      setProducts(pRes.data.items);
      setTotalCount(pRes.data.total);
    }
    if (jRes.data) setJobs(jRes.data.items);
    const allPipelines = [...(plRes.data ?? []), ...(plArchRes.data ?? [])];
    setPipelines(allPipelines);
  }, [service, filterLevel, filterSatellite, filterMode, filterStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 의존성이 변경될 때 비동기 데이터를 fetch하여 상태를 갱신하는 정규 패턴
    loadData();
  }, [loadData]);

  const pipelineByJobId = useMemo(() => {
    const jobToPipeline = new Map<string, string>();
    for (const job of jobs) jobToPipeline.set(job.jobId, job.pipelineId);
    return jobToPipeline;
  }, [jobs]);

  const pipelineNameById = useMemo(() => {
    return new Map(pipelines.map((p) => [p.id, p.name]));
  }, [pipelines]);

  const getPipelineName = useCallback(
    (product: Product): string | undefined => {
      const pid = pipelineByJobId.get(product.jobId);
      if (!pid) return undefined;
      return pipelineNameById.get(pid);
    },
    [pipelineByJobId, pipelineNameById],
  );

  const filtered = useMemo(() => {
    const searched = search
      ? products.filter(
          (p) =>
            p.id.toLowerCase().includes(search.toLowerCase()) ||
            p.sceneId.toLowerCase().includes(search.toLowerCase()) ||
            getRawDataDisplayName(p).toLowerCase().includes(search.toLowerCase()) ||
            (getPipelineName(p) ?? '').toLowerCase().includes(search.toLowerCase()),
        )
      : products;

    const pipelineFiltered = filterPipeline
      ? searched.filter((p) => pipelineByJobId.get(p.jobId) === filterPipeline)
      : searched;

    const sorted = pipelineFiltered.slice().sort((a, b) => {
      const direction = sortOrder === 'asc' ? 1 : -1;
      switch (sortBy) {
        case 'createdAt':
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
        case 'level':
          return a.level.localeCompare(b.level) * direction;
        case 'status':
          return a.status.localeCompare(b.status) * direction;
        case 'pipeline': {
          const an = getPipelineName(a) ?? '';
          const bn = getPipelineName(b) ?? '';
          return an.localeCompare(bn, 'ko') * direction;
        }
        default:
          return String(a[sortBy as keyof Product] ?? '').localeCompare(
            String(b[sortBy as keyof Product] ?? ''),
            'ko',
          ) * direction;
      }
    });
    return sorted;
  }, [products, search, sortBy, sortOrder, filterPipeline, pipelineByJobId, getPipelineName]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(pageStart, pageStart + pageSize);

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setPage(1);
  }

  function handleSort(column: ProductSortKey) {
    setPage(1);
    setSortOrder((prev) => (sortBy === column ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
    setSortBy(column);
  }

  async function handleDownload(product: Product) {
    const res = await service.제품_다운로드_URL을_발급한다(product.id);
    if (res.success && res.data) {
      toast.success(`Download link created (expires in ${Math.floor(res.data.expiresIn / 60)} min)`);
      window.open(res.data.url, '_blank');
    } else {
      toast.error(res.message);
    }
  }

  async function handleReprocess(targetLevel: string) {
    if (!reprocessTarget) return;
    const res = await service.제품_재처리를_요청한다(reprocessTarget.id, { targetLevel });
    if (res.success && res.data) {
      toast.success(`Reprocess requested — Job: ${res.data.jobId}`);
    } else {
      toast.error(res.message);
    }
    setReprocessTarget(null);
  }

  return (
    <div className="flex-1 flex overflow-hidden relative">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-accent" />
            <h1 className="text-sm font-semibold text-foreground">Productions</h1>
            <span className="text-[10px] text-muted-foreground font-mono">{totalCount} items</span>
          </div>
        </div>

        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border shrink-0 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search ID / Raw Data / Pipeline..."
              className="pl-8 pr-3 py-1.5 bg-background border border-border rounded-md text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent w-56"
            />
          </div>
          <select
            value={filterLevel}
            onChange={(e) => {
              setFilterLevel(e.target.value);
              setPage(1);
            }}
            className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">All Levels</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {PRODUCT_LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
          <select
            value={filterPipeline}
            onChange={(e) => {
              setFilterPipeline(e.target.value);
              setPage(1);
            }}
            className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">All Pipelines</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={filterSatellite}
            onChange={(e) => {
              setFilterSatellite(e.target.value);
              setPage(1);
            }}
            className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">All Satellites</option>
            {SATELLITES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={filterMode}
            onChange={(e) => {
              setFilterMode(e.target.value);
              setPage(1);
            }}
            className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">All Modes</option>
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
            className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {PRODUCT_TABLE_COLUMNS.map((column) => (
                  <th
                    key={column.id}
                    className={cn(
                      'px-3 py-2',
                      column.align === 'center' ? 'text-center' : 'text-left',
                      column.id === 'id' ? 'pl-5' : '',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(column.id)}
                      className={cn(
                        'inline-flex items-center gap-1 transition-colors hover:text-foreground',
                        column.align === 'center' ? 'justify-center' : '',
                      )}
                    >
                      <span>{column.label}</span>
                      <SortIcon active={sortBy === column.id} order={sortOrder} />
                    </button>
                  </th>
                ))}
                <th className="px-5 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => {
                const pipelineName = getPipelineName(p);
                return (
                  <tr
                    key={p.id}
                    onClick={() => openPanel(p)}
                    className={cn(
                      'border-b border-border/50 cursor-pointer transition-colors',
                      selectedProduct?.id === p.id ? 'bg-accent/5' : 'hover:bg-muted/20',
                    )}
                  >
                    <td className="px-5 py-1.5 text-xs font-mono text-foreground">{p.id}</td>
                    <td className="px-3 py-1.5 text-xs text-foreground">{getRawDataDisplayName(p)}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className="inline-flex items-center gap-1">
                        <span className="px-1.5 py-px rounded text-[10px] font-mono bg-accent/10 text-accent">
                          {PRODUCT_LEVEL_LABELS[p.level]}
                        </span>
                        {p.level === 'LEVEL_0' && (
                          <span className="rounded bg-muted px-1 py-px text-[9px] font-semibold text-muted-foreground">
                            HDF5
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {pipelineName ? (
                        <span className="inline-flex items-center gap-1 text-foreground">
                          <GitBranch className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{pipelineName}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-foreground">{p.satelliteId}</td>
                    <td className="px-3 py-1.5 text-xs text-foreground">{p.mode}</td>
                    <td className="px-3 py-1.5 text-center">
                      <ProductStatusBadge status={p.status} />
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{formatKST(p.createdAt)}</td>
                    <td className="px-5 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(p);
                          }}
                          disabled={p.status !== 'COMPLETED'}
                          className={cn(
                            'p-1 rounded-md transition-colors',
                            p.status === 'COMPLETED'
                              ? 'hover:bg-muted/50 text-muted-foreground hover:text-accent'
                              : 'text-muted-foreground/30 cursor-not-allowed',
                          )}
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setReprocessTarget(p);
                          }}
                          className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                          title="Reprocess"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={PRODUCT_TABLE_COLUMNS.length + 1} className="text-center py-12 text-sm text-muted-foreground">
                    No products match the criteria
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={currentPage}
          totalPages={pageCount}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      {panelMounted && selectedProduct && (
        <div
          className={cn(
            'absolute inset-y-0 right-0 w-150 z-20 shadow-2xl transition-all duration-200 ease-out',
            panelAnimating ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0',
          )}
        >
          <ProductDetailPanel
            product={selectedProduct}
            pipelineName={getPipelineName(selectedProduct)}
            onClose={closePanel}
            onDownload={() => handleDownload(selectedProduct)}
            onReprocess={() => setReprocessTarget(selectedProduct)}
          />
        </div>
      )}

      {reprocessTarget && (
        <ReprocessDialog
          product={reprocessTarget}
          onConfirm={handleReprocess}
          onCancel={() => setReprocessTarget(null)}
        />
      )}
    </div>
  );
}
