'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ElementType } from 'react';
import { usePathname } from 'next/navigation';
import LeftSidebar from '@/components/panels/LeftSidebar';
import ProductsView from '@/app/(planning)/plan/products/ProductsView';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import { toast } from '@/components/ui/Toast';
import { cn, formatDuration, formatKST, formatRelativeTime } from '@/lib/utils';
import { PRODUCT_LEVEL_LABELS, SAR_STAGE_TO_CSC, SAR_STAGE_TO_LEVEL } from '@/types/pipeline';
import type {
  Hdf5FileSummary,
  JobSummary,
  PipelineDefinition,
  PipelineStep,
  Product,
  ProductLevel,
  RawDataSummary,
} from '@/types/pipeline';
import CanvasGraph from '@/components/graph/CanvasGraph';
import {
  Antenna,
  Binary,
  CheckCircle2,
  Clock,
  Database,
  Download,
  Eye,
  FileJson,
  Filter,
  HardDrive,
  Image as ImageIcon,
  Layers,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Ruler,
  Search,
  Upload,
  X,
  XCircle,
} from 'lucide-react';

const LEVELS: ProductLevel[] = ['LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];
type CatalogListTab = 'raw' | 'hdf5';
type CatalogPageTab = 'lineage' | 'production';
type InspectorTab = 'raw' | 'result';
type InspectorSelection =
  | { type: 'raw' }
  | { type: 'hdf5'; fileId?: string }
  | { type: 'product'; productId?: string }
  | { type: 'job'; jobId?: string };

type UploadQueueItem = {
  id: string;
  fileName: string;
  status: 'uploading' | 'uploaded' | 'failed';
  message: string;
};

interface LineageItem {
  raw: RawDataSummary;
  hdf5Files: Hdf5FileSummary[];
  products: Product[];
  jobs: JobSummary[];
}

function createUploadQueueId(file: File, index: number): string {
  return globalThis.crypto?.randomUUID?.() ?? `${file.name}-${file.size}-${Date.now()}-${index}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex >= 3 ? 1 : 0)} ${units[unitIndex]}`;
}

function ProductStatusBadge({ status }: { status: Product['status'] }) {
  const tone = {
    COMPLETED: 'bg-success/15 text-success',
    PROCESSING: 'bg-accent/15 text-accent',
    FAILED: 'bg-destructive/15 text-destructive',
  }[status];
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', tone)}>{status}</span>;
}

function JobStatusBadge({ status }: { status: JobSummary['status'] }) {
  const tone = {
    CREATED: 'bg-muted text-muted-foreground',
    ASSIGNED: 'bg-accent/15 text-accent',
    COMPLETED: 'bg-success/15 text-success',
    FAILED: 'bg-destructive/15 text-destructive',
    CANCELED: 'bg-muted text-muted-foreground',
  }[status];
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', tone)}>{status}</span>;
}

function StatBlock({ label, value, icon: Icon }: { label: string; value: string | number; icon: ElementType }) {
  return (
    <div className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function toPreviewSteps(pipeline: PipelineDefinition, statusByOrder: Map<number, PipelineStep['status']>): PipelineStep[] {
  return pipeline.steps.map((step) => ({
    order: step.order,
    kind: step.kind,
    sarStage: step.sarStage,
    inputLevel: step.inputLevel,
    parentOrder: step.parentOrder,
    targetCsc:
      step.kind === 'SAR' && step.sarStage
        ? SAR_STAGE_TO_CSC[step.sarStage]
        : step.kind === 'JOB_INIT'
          ? 'CSC-08'
          : step.kind === 'CATALOG' || step.kind === 'THUMBNAIL'
            ? 'CSC-07'
            : 'CSC-02',
    productLevel:
      step.kind === 'SAR' && step.sarStage
        ? SAR_STAGE_TO_LEVEL[step.sarStage]
        : step.inputLevel ?? 'LEVEL_0',
    status: statusByOrder.get(step.order) ?? 'PENDING',
    enabledTasks: step.enabledTasks,
  }));
}

function buildLineage(
  rawData: RawDataSummary[],
  hdf5Files: Hdf5FileSummary[],
  products: Product[],
  jobs: JobSummary[],
): LineageItem[] {
  const hdf5ByRaw = new Map<string, Hdf5FileSummary[]>();
  const productsByRaw = new Map<string, Product[]>();
  const jobsById = new Map(jobs.map((job) => [job.jobId, job]));

  for (const file of hdf5Files) {
    const list = hdf5ByRaw.get(file.rawDataId) ?? [];
    list.push(file);
    hdf5ByRaw.set(file.rawDataId, list);
  }
  for (const product of products) {
    const list = productsByRaw.get(product.rawDataId) ?? [];
    list.push(product);
    productsByRaw.set(product.rawDataId, list);
  }

  return rawData.map((raw) => {
    const rawProducts = productsByRaw.get(raw.id) ?? [];
    const rawJobs = rawProducts
      .map((product) => jobsById.get(product.jobId))
      .filter((job): job is JobSummary => Boolean(job));
    return {
      raw,
      hdf5Files: hdf5ByRaw.get(raw.id) ?? [],
      products: rawProducts,
      jobs: Array.from(new Map(rawJobs.map((job) => [job.jobId, job])).values()),
    };
  });
}

function RawDataList({
  items,
  selectedRawId,
  onSelect,
}: {
  items: LineageItem[];
  selectedRawId: string | null;
  onSelect: (rawId: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {items.map((item) => {
        return (
          <button
            key={item.raw.id}
            type="button"
            onClick={() => onSelect(item.raw.id)}
            className={cn(
              'w-full border-b border-border px-3 py-3 text-left transition-colors',
              selectedRawId === item.raw.id ? 'bg-accent/10' : 'hover:bg-muted/25',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-foreground">{item.raw.title}</div>
                <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{item.raw.id}</div>
              </div>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {formatFileSize(item.raw.fileSizeBytes)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span>{item.raw.satelliteId} / {item.raw.mode}</span>
              <span>{formatRelativeTime(item.raw.receivedAt)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Hdf5FileList({
  files,
  selectedFileId,
  onSelect,
}: {
  files: { file: Hdf5FileSummary; raw?: RawDataSummary }[];
  selectedFileId?: string;
  onSelect: (file: Hdf5FileSummary) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {files.map(({ file, raw }) => (
        <button
          key={file.id}
          type="button"
          onClick={() => onSelect(file)}
          className={cn(
            'w-full border-b border-border px-3 py-3 text-left transition-colors',
            selectedFileId === file.id ? 'bg-accent/10' : 'hover:bg-muted/25',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-foreground">{file.fileName}</div>
              <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{file.id}</div>
            </div>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {formatFileSize(file.fileSizeBytes)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {file.nodes.length} nodes
            </span>
            <span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {file.rootGroups.length} groups
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span className="min-w-0 truncate">{raw?.title ?? file.rawDataId}</span>
            <span className="shrink-0">{formatRelativeTime(file.receivedAt)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function Hdf5Inspector({
  files,
  selectedFileId,
  l0Products,
  onJumpToProduct,
}: {
  files: Hdf5FileSummary[];
  selectedFileId?: string;
  l0Products?: Product[];
  onJumpToProduct?: (productId: string) => void;
}) {
  const file = files.find((item) => item.id === selectedFileId) ?? files[0] ?? null;
  const node = file?.nodes[0] ?? null;
  const attrs = file && node ? file.attributes[node.path] ?? [] : [];

  if (!file) {
    return <EmptyInspector title="No HDF5" description="No HDF5 files are linked to the selected Raw Data." />;
  }

  const linkedProduct = l0Products?.[0];

  return (
    <div className="min-h-0 overflow-y-auto">
      <InspectorHeader icon={Database} title={file.fileName} subtitle={`Level-0 product · ${file.nodes.length} nodes / ${formatFileSize(file.fileSizeBytes)}`} />
      {linkedProduct && onJumpToProduct && (
        <div className="border-b border-border px-4 py-3">
          <button
            type="button"
            onClick={() => onJumpToProduct(linkedProduct.id)}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-left text-xs text-accent transition-colors hover:bg-accent/10"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Package className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">View as L0 Product — {linkedProduct.id}</span>
            </span>
            <ProductStatusBadge status={linkedProduct.status} />
          </button>
        </div>
      )}
      <section className="border-b border-border px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Root Groups</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {file.rootGroups.map((group) => (
            <span key={group} className="rounded bg-muted px-2 py-1 text-[11px] text-foreground">{group}</span>
          ))}
        </div>
      </section>
      <section className="border-b border-border px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">First Node</div>
        <div className="mt-2 rounded-md border border-border bg-background px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Binary className="h-3.5 w-3.5 text-accent" />
            {node?.path ?? '-'}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {node?.type ?? '-'} / {attrs.length} attributes
          </div>
        </div>
      </section>
      <section className="px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Attributes</div>
        <div className="mt-2 overflow-hidden rounded-md border border-border">
          <table className="w-full text-[11px]">
            <tbody>
              {attrs.slice(0, 8).map((attr) => (
                <tr key={attr.name} className="border-b border-border last:border-b-0">
                  <td className="px-2 py-1.5 text-muted-foreground">{attr.name}</td>
                  <td className="px-2 py-1.5 font-mono text-foreground">{String(attr.value)}</td>
                </tr>
              ))}
              {attrs.length === 0 && (
                <tr>
                  <td className="px-2 py-5 text-center text-muted-foreground">No attributes to display.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function QualityBadge({ pass }: { pass: boolean }) {
  return pass ? (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-success">
      <CheckCircle2 className="h-3 w-3" />
      Pass
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-destructive">
      <XCircle className="h-3 w-3" />
      Fail
    </span>
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

function ProductDetailPanel({
  products,
  selectedProductId,
  hdf5Files,
  onDownload,
  onReprocess,
  onJumpToHdf5,
}: {
  products: Product[];
  selectedProductId?: string;
  hdf5Files?: Hdf5FileSummary[];
  onDownload: (product: Product) => void;
  onReprocess: (product: Product) => void;
  onJumpToHdf5?: (fileId: string) => void;
}) {
  const product = products.find((item) => item.id === selectedProductId) ?? products[0] ?? null;
  const pathname = usePathname();
  const base = pathname.startsWith('/current') ? '/current' : '/plan';

  if (!product) {
    return <EmptyInspector title="No Product" description="No product has been generated for the selected stage." />;
  }

  const linkedHdf5 = product.level === 'LEVEL_0' ? hdf5Files?.[0] : undefined;

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{product.id}</div>
          <div className="truncate text-xs text-muted-foreground">{product.rawDataName ?? product.sceneId}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <ProductStatusBadge status={product.status} />
          <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-xs text-accent">
            {PRODUCT_LEVEL_LABELS[product.level]}
          </span>
          {product.level === 'LEVEL_0' && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              HDF5
            </span>
          )}
        </div>

        {linkedHdf5 && onJumpToHdf5 && (
          <button
            type="button"
            onClick={() => onJumpToHdf5(linkedHdf5.id)}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-left text-xs text-accent transition-colors hover:bg-accent/10"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Database className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">View HDF5 schema — {linkedHdf5.fileName}</span>
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">{linkedHdf5.nodes.length} nodes</span>
          </button>
        )}

        <div className="flex aspect-square items-center justify-center rounded-lg border border-border bg-background p-3">
          {product.thumbnailUrl ? (
            <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              <span className="text-xs">Quick-look Thumbnail</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/50">No preview</span>
          )}
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Metadata</h4>
          <div className="grid grid-cols-2 gap-2">
            <MetaItem label="Satellite" value={product.satelliteId} />
            <MetaItem label="Mode" value={product.mode} />
            <MetaItem label="Polarization" value={product.polarization} />
            <MetaItem label="Job ID" value={product.jobId} href={`${base}/jobs?jobId=${product.jobId}`} />
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <MapPin className="h-3 w-3" />
            Spatial Extent
          </h4>
          <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
            W: {product.spatialExtent.west.toFixed(4)} / S: {product.spatialExtent.south.toFixed(4)}
            <br />
            E: {product.spatialExtent.east.toFixed(4)} / N: {product.spatialExtent.north.toFixed(4)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <h4 className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
              <Clock className="h-3 w-3" />
              Acquisition Time
            </h4>
            <div className="text-xs text-foreground">{formatKST(product.acquisitionStart)}</div>
            <div className="text-xs text-muted-foreground">~ {formatKST(product.acquisitionEnd)}</div>
          </div>
          <div className="space-y-1">
            <h4 className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
              <Ruler className="h-3 w-3" />
              Resolution
            </h4>
            <div className="text-xs text-foreground">
              Range: {product.resolutionRange.toFixed(1)}m
              <br />
              Azimuth: {product.resolutionAzimuth.toFixed(1)}m
            </div>
          </div>
        </div>

        <MetaItem label="Processing Time" value={formatDuration(product.processingTimeMs)} />

        {product.quality && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Eye className="h-3 w-3" />
              Quality Validation (REQ-FUNC-023)
            </h4>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-background text-muted-foreground">
                    <th className="px-3 py-1.5 text-left font-medium">Metric</th>
                    <th className="px-3 py-1.5 text-right font-medium">Value</th>
                    <th className="px-3 py-1.5 text-center font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-foreground">NESZ</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">
                      {product.quality.nesz.value.toFixed(1)} {product.quality.nesz.unit}
                    </td>
                    <td className="px-3 py-1.5 text-center"><QualityBadge pass={product.quality.nesz.pass} /></td>
                  </tr>
                  <tr className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-foreground">PSLR</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">
                      {product.quality.pslr.value.toFixed(1)} {product.quality.pslr.unit}
                    </td>
                    <td className="px-3 py-1.5 text-center"><QualityBadge pass={product.quality.pslr.pass} /></td>
                  </tr>
                  <tr className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-foreground">Geometric Accuracy</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">
                      {product.quality.geometricAccuracy.value.toFixed(1)} {product.quality.geometricAccuracy.unit}
                    </td>
                    <td className="px-3 py-1.5 text-center"><QualityBadge pass={product.quality.geometricAccuracy.pass} /></td>
                  </tr>
                  <tr className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-foreground">Radiometric Calibration</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">-</td>
                    <td className="px-3 py-1.5 text-center"><QualityBadge pass={product.quality.radiometricCalibration.pass} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
        <button
          onClick={() => onDownload(product)}
          disabled={product.status !== 'COMPLETED'}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            product.status === 'COMPLETED'
              ? 'bg-accent text-background hover:bg-accent/90'
              : 'cursor-not-allowed bg-muted text-muted-foreground',
          )}
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
        <button
          onClick={() => onReprocess(product)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/30"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reprocess
        </button>
      </div>
    </div>
  );
}

function RawInspector({ raw }: { raw: RawDataSummary }) {
  return (
    <div className="min-h-0 overflow-y-auto">
      <InspectorHeader icon={Antenna} title={raw.title} subtitle={`CCSDS · ${raw.rawDataPath}`} />
      <div className="grid grid-cols-2 border-b border-border">
        <StatBlock label="Satellite" value={raw.satelliteId} icon={Antenna} />
        <StatBlock label="Mode" value={raw.mode} icon={Filter} />
        <StatBlock label="Polarization" value={raw.polarization} icon={Layers} />
        <StatBlock label="Size" value={formatFileSize(raw.fileSizeBytes)} icon={HardDrive} />
      </div>
      <section className="border-b border-border px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Acquisition</div>
        <div className="mt-2 text-xs text-foreground">{formatKST(raw.capturedAt)}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">Received: {formatKST(raw.receivedAt)}</div>
      </section>
      <section className="px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Location</div>
        <div className="mt-2 font-mono text-xs text-foreground">
          {raw.latitude.toFixed(5)}, {raw.longitude.toFixed(5)}
        </div>
      </section>
    </div>
  );
}

function ResultOverview({
  item,
  onSelect,
}: {
  item: LineageItem;
  onSelect: (selection: InspectorSelection) => void;
}) {
  const sortedProducts = [...item.products].sort((a, b) => a.level.localeCompare(b.level));
  return (
    <div className="min-h-0 overflow-y-auto">
      <section className="border-b border-border px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <Database className="h-3 w-3" />
          Level-0 (HDF5)
        </div>
        {item.hdf5Files.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
            HDF5 has not been produced yet.
          </div>
        ) : (
          <div className="space-y-1">
            {item.hdf5Files.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => onSelect({ type: 'hdf5', fileId: file.id })}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:border-accent/45 hover:bg-accent/5"
              >
                <span className="min-w-0 truncate text-foreground">{file.fileName}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {file.nodes.length} nodes · {formatFileSize(file.fileSizeBytes)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="border-b border-border px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <Package className="h-3 w-3" />
          Products ({sortedProducts.length})
        </div>
        {sortedProducts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
            No products generated yet.
          </div>
        ) : (
          <div className="space-y-1">
            {sortedProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => onSelect({ type: 'product', productId: product.id })}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:border-accent/45 hover:bg-accent/5"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="rounded bg-accent/10 px-1.5 py-px font-mono text-[10px] text-accent">
                    {PRODUCT_LEVEL_LABELS[product.level]}
                  </span>
                  <span className="truncate text-foreground">{product.id}</span>
                </span>
                <ProductStatusBadge status={product.status} />
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <FileJson className="h-3 w-3" />
          Jobs ({item.jobs.length})
        </div>
        {item.jobs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
            No jobs triggered yet.
          </div>
        ) : (
          <div className="space-y-1">
            {item.jobs.map((job) => (
              <button
                key={job.jobId}
                type="button"
                onClick={() => onSelect({ type: 'job', jobId: job.jobId })}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:border-accent/45 hover:bg-accent/5"
              >
                <span className="min-w-0 truncate font-mono text-foreground">{job.jobId}</span>
                <JobStatusBadge status={job.status} />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function JobInspector({ jobs, selectedJobId }: { jobs: JobSummary[]; selectedJobId?: string }) {
  const job = jobs.find((item) => item.jobId === selectedJobId) ?? jobs[0] ?? null;
  if (!job) return <EmptyInspector title="No Job" description="No processing job is linked to the selected Raw Data." />;
  return (
    <div className="min-h-0 overflow-y-auto">
      <InspectorHeader icon={FileJson} title={job.jobId} subtitle={job.pipelineId} />
      <div className="border-b border-border px-4 py-3">
        <JobStatusBadge status={job.status} />
      </div>
      <div className="grid grid-cols-2 border-b border-border">
        <StatBlock label="Current Level" value={job.currentLevel ? PRODUCT_LEVEL_LABELS[job.currentLevel] : '-'} icon={Layers} />
        <StatBlock label="Retries" value={job.retryCount} icon={Clock} />
      </div>
      <section className="px-4 py-3 text-xs text-foreground">
        <div>Started: {formatKST(job.startedAt)}</div>
        <div className="mt-1 text-muted-foreground">Updated: {formatKST(job.updatedAt)}</div>
      </section>
    </div>
  );
}

function InspectorHeader({ icon: Icon, title, subtitle }: { icon: ElementType; title: string; subtitle: string }) {
  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-accent" />
        <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground">{subtitle}</div>
    </div>
  );
}

function EmptyInspector({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <XCircle className="h-8 w-8 text-muted-foreground/55" />
      <div className="mt-3 text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function Inspector({
  item,
  tab,
  selection,
  onSelect,
  onDownloadProduct,
  onReprocessProduct,
}: {
  item: LineageItem;
  tab: InspectorTab;
  selection: InspectorSelection;
  onSelect: (selection: InspectorSelection) => void;
  onDownloadProduct: (product: Product) => void;
  onReprocessProduct: (product: Product) => void;
}) {
  if (tab === 'raw') {
    return <RawInspector raw={item.raw} />;
  }

  const l0Products = item.products.filter((p) => p.level === 'LEVEL_0');
  const jumpToHdf5 = (fileId: string) => onSelect({ type: 'hdf5', fileId });
  const jumpToProduct = (productId: string) => onSelect({ type: 'product', productId });

  if (selection.type === 'hdf5') {
    return (
      <Hdf5Inspector
        files={item.hdf5Files}
        selectedFileId={selection.fileId}
        l0Products={l0Products}
        onJumpToProduct={jumpToProduct}
      />
    );
  }
  if (selection.type === 'product') {
    return (
      <ProductDetailPanel
        products={item.products}
        selectedProductId={selection.productId}
        hdf5Files={item.hdf5Files}
        onDownload={onDownloadProduct}
        onReprocess={onReprocessProduct}
        onJumpToHdf5={jumpToHdf5}
      />
    );
  }
  if (selection.type === 'job') return <JobInspector jobs={item.jobs} selectedJobId={selection.jobId} />;
  return <ResultOverview item={item} onSelect={onSelect} />;
}

export default function DataCatalogPage() {
  const service = usePipelineService();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [rawData, setRawData] = useState<RawDataSummary[]>([]);
  const [hdf5Files, setHdf5Files] = useState<Hdf5FileSummary[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<ProductLevel | 'all'>('all');
  const [catalogTab, setCatalogTab] = useState<CatalogListTab>('raw');
  const [pageTab, setPageTab] = useState<CatalogPageTab>('lineage');
  const [inspectorMounted, setInspectorMounted] = useState(true);
  const [inspectorAnimating, setInspectorAnimating] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('raw');
  const [selectedRawId, setSelectedRawId] = useState<string | null>(null);
  const [selection, setSelection] = useState<InspectorSelection>({ type: 'raw' });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [rawRes, hdf5Res, productRes, jobRes, plRes, plArchRes] = await Promise.all([
      service.원시데이터_목록을_조회한다({ limit: 500 }),
      service.HDF5_애트리뷰트_목록을_조회한다(),
      service.제품_목록을_조회한다({ limit: 500 }),
      service.Job_목록을_조회한다({ limit: 500 }),
      service.파이프라인_목록을_조회한다(),
      service.아카이브_파이프라인_목록을_조회한다(),
    ]);
    if (rawRes.data) setRawData(rawRes.data.items);
    if (hdf5Res.data) setHdf5Files(hdf5Res.data);
    if (productRes.data) setProducts(productRes.data.items);
    if (jobRes.data) setJobs(jobRes.data.items);
    setPipelines([...(plRes.data ?? []), ...(plArchRes.data ?? [])]);
    setLoading(false);
  }, [service]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openInspector() {
    if (inspectorMounted) {
      setInspectorAnimating(true);
      return;
    }
    setInspectorMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setInspectorAnimating(true));
    });
  }
  function closeInspector() {
    setInspectorAnimating(false);
    setTimeout(() => setInspectorMounted(false), 200);
  }
  function selectInInspector(next: InspectorSelection) {
    setSelection(next);
    setInspectorTab(next.type === 'raw' ? 'raw' : 'result');
  }

  const lineage = useMemo(() => buildLineage(rawData, hdf5Files, products, jobs), [rawData, hdf5Files, products, jobs]);
  const rawById = useMemo(() => new Map(rawData.map((raw) => [raw.id, raw])), [rawData]);
  const filteredLineage = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return lineage.filter((item) => {
      const matchesQuery = !normalized || [
        item.raw.id,
        item.raw.title,
        item.raw.rawDataPath,
        ...item.hdf5Files.map((file) => file.fileName),
        ...item.products.map((product) => product.id),
        ...item.jobs.map((job) => job.jobId),
      ].some((value) => value.toLowerCase().includes(normalized));
      const matchesLevel = levelFilter === 'all' || item.products.some((product) => product.level === levelFilter);
      return matchesQuery && matchesLevel;
    });
  }, [lineage, levelFilter, query]);

  const filteredHdf5Files = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return hdf5Files
      .map((file) => ({ file, raw: rawById.get(file.rawDataId) }))
      .filter(({ file, raw }) => {
        if (!normalized) return true;
        return [
          file.id,
          file.fileName,
          file.title,
          file.rawDataId,
          file.satelliteId,
          file.mode,
          ...(raw ? [raw.id, raw.title, raw.rawDataPath] : []),
          ...file.rootGroups,
          ...file.nodes.map((node) => node.path),
        ].some((value) => value.toLowerCase().includes(normalized));
      });
  }, [hdf5Files, query, rawById]);

  const selectedItem = useMemo(() => {
    return lineage.find((item) => item.raw.id === selectedRawId) ?? filteredLineage[0] ?? null;
  }, [filteredLineage, lineage, selectedRawId]);

  useEffect(() => {
    if (selectedRawId && selectedItem) return;
    if (catalogTab === 'hdf5') {
      const firstFile = filteredHdf5Files[0]?.file;
      if (!firstFile) return;
      setSelectedRawId(firstFile.rawDataId);
      setSelection({ type: 'hdf5', fileId: firstFile.id });
      return;
    }
    if (filteredLineage[0]) {
      setSelectedRawId(filteredLineage[0].raw.id);
      setSelection({ type: 'raw' });
    }
  }, [catalogTab, filteredHdf5Files, filteredLineage, selectedItem, selectedRawId]);

  const selectedHdf5FileId = selection.type === 'hdf5' ? selection.fileId : undefined;

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleHdf5Upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (selectedFiles.length === 0) return;
    if (!selectedItem) {
      toast.error('Select a Raw Data item to attach the HDF5 file to.');
      return;
    }

    const queuedUploads = selectedFiles.map((file, index) => ({
      id: createUploadQueueId(file, index),
      fileName: file.name,
      status: 'uploading' as const,
      message: 'Uploading',
    }));

    setUploading(true);
    setUploadQueue(queuedUploads);

    const uploadedFiles: Hdf5FileSummary[] = [];
    try {
      for (const [index, file] of selectedFiles.entries()) {
        const queuedUpload = queuedUploads[index];
        const [result] = await Promise.all([
          service.HDF5_파일을_업로드한다(file, selectedItem.raw.id),
          wait(700),
        ]);

        if (!result.success || !result.data) {
          setUploadQueue((current) =>
            current.map((item) =>
              item.id === queuedUpload.id
                ? { ...item, status: 'failed', message: result.message || 'Upload failed' }
                : item,
            ),
          );
          toast.error(result.message || `Failed to upload "${file.name}".`);
          continue;
        }

        const uploaded = { ...result.data, rawDataId: selectedItem.raw.id };
        uploadedFiles.push(uploaded);
        setUploadQueue((current) =>
          current.map((item) =>
            item.id === queuedUpload.id
              ? { ...item, status: 'uploaded', message: 'Upload complete' }
              : item,
          ),
        );
      }

      if (uploadedFiles.length > 0) {
        setHdf5Files((current) => [...uploadedFiles, ...current]);
        setCatalogTab('hdf5');
        setSelection({ type: 'hdf5', fileId: uploadedFiles[0].id });
        toast.success(
          uploadedFiles.length === 1
            ? `"${uploadedFiles[0].fileName}" has been added.`
            : `${uploadedFiles.length} HDF5 files have been added.`,
        );
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadProduct = async (product: Product) => {
    const res = await service.제품_다운로드_URL을_발급한다(product.id);
    if (!res.success || !res.data) {
      toast.error(res.message || 'Failed to issue download URL.');
      return;
    }
    window.open(res.data.url, '_blank', 'noopener,noreferrer');
  };

  const handleReprocessProduct = async (product: Product) => {
    const res = await service.제품_재처리를_요청한다(product.id, { targetLevel: product.level });
    if (!res.success || !res.data) {
      toast.error(res.message || 'Failed to request reprocessing.');
      return;
    }
    toast.success(`Reprocess requested - Job: ${res.data.jobId}`);
  };

  const selectedPipeline = useMemo(() => {
    if (!selectedItem) return null;

    // When a level filter is active, prefer the pipeline that actually produced
    // a product at that level — otherwise the diagram may show a full TRIGGER-based
    // pipeline that doesn't correspond to the filtered product.
    if (levelFilter !== 'all') {
      const matchingProduct = selectedItem.products.find((p) => p.level === levelFilter);
      if (matchingProduct) {
        const job = selectedItem.jobs.find((j) => j.jobId === matchingProduct.jobId);
        const pipeline = job ? pipelines.find((p) => p.id === job.pipelineId) : null;
        if (pipeline) return pipeline;
      }
    }

    const firstJob = selectedItem.jobs[0];
    if (!firstJob) return null;
    return pipelines.find((p) => p.id === firstJob.pipelineId) ?? null;
  }, [selectedItem, pipelines, levelFilter]);

  const graphSteps = useMemo<PipelineStep[]>(() => {
    if (!selectedPipeline || !selectedItem) return [];
    const statusByOrder = new Map<number, PipelineStep['status']>();
    const hasJob = selectedItem.jobs.length > 0;

    // SAR step status from product status at the corresponding level
    const sarStatuses: PipelineStep['status'][] = [];
    for (const step of selectedPipeline.steps) {
      if (step.kind !== 'SAR' || !step.sarStage) continue;
      const level = SAR_STAGE_TO_LEVEL[step.sarStage];
      const productsAtLevel = selectedItem.products.filter((p) => p.level === level);
      let status: PipelineStep['status'] = 'PENDING';
      if (productsAtLevel.length > 0) {
        if (productsAtLevel.some((p) => p.status === 'COMPLETED')) status = 'COMPLETED';
        else if (productsAtLevel.some((p) => p.status === 'PROCESSING')) status = 'RUNNING';
        else if (productsAtLevel.every((p) => p.status === 'FAILED')) status = 'FAILED';
      }
      statusByOrder.set(step.order, status);
      sarStatuses.push(status);
    }

    const allSarCompleted = sarStatuses.length > 0 && sarStatuses.every((s) => s === 'COMPLETED');

    for (const step of selectedPipeline.steps) {
      if (statusByOrder.has(step.order)) continue;
      if (step.kind === 'TRIGGER') {
        statusByOrder.set(step.order, 'COMPLETED');
      } else if (step.kind === 'JOB_INIT' || step.kind === 'FILE_INPUT') {
        statusByOrder.set(step.order, hasJob ? 'COMPLETED' : 'PENDING');
      } else if (step.kind === 'CATALOG' || step.kind === 'THUMBNAIL') {
        statusByOrder.set(step.order, allSarCompleted ? 'COMPLETED' : 'PENDING');
      }
    }

    return toPreviewSteps(selectedPipeline, statusByOrder);
  }, [selectedPipeline, selectedItem]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <LeftSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} mode="nav" activePage="data-catalog" />
      <main className="flex min-w-0 flex-1 flex-col">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".h5,.hdf5,application/x-hdf5"
          onChange={(event) => void handleHdf5Upload(event)}
          className="hidden"
        />
        <div className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-3 py-2">
          <button
            type="button"
            onClick={() => setPageTab('lineage')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              pageTab === 'lineage'
                ? 'bg-accent/10 text-accent'
                : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
            )}
          >
            <Database className="h-3.5 w-3.5" />
            Data Catalog
          </button>
          <button
            type="button"
            onClick={() => setPageTab('production')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              pageTab === 'production'
                ? 'bg-accent/10 text-accent'
                : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
            )}
          >
            <Package className="h-3.5 w-3.5" />
            Productions
          </button>
        </div>
        {pageTab === 'production' ? (
          <ProductsView />
        ) : (
        <div className="relative grid min-h-0 flex-1 grid-cols-[420px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-border bg-card">
            <div className="space-y-2 border-b border-border px-3 py-3">
              <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-background p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setCatalogTab('raw');
                    if (selectedItem) selectInInspector({ type: 'raw' });
                  }}
                  className={cn(
                    'h-7 rounded px-2 text-xs font-semibold transition-colors',
                    catalogTab === 'raw'
                      ? 'bg-accent text-background'
                      : 'text-muted-foreground hover:bg-muted/35 hover:text-foreground',
                  )}
                >
                  Raw Data
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCatalogTab('hdf5');
                    const nextFile =
                      selectedItem?.hdf5Files[0] ?? filteredHdf5Files[0]?.file;
                    if (nextFile) {
                      setSelectedRawId(nextFile.rawDataId);
                      selectInInspector({ type: 'hdf5', fileId: nextFile.id });
                    }
                  }}
                  className={cn(
                    'h-7 rounded px-2 text-xs font-semibold transition-colors',
                    catalogTab === 'hdf5'
                      ? 'bg-accent text-background'
                      : 'text-muted-foreground hover:bg-muted/35 hover:text-foreground',
                  )}
                >
                  Level-0 (HDF5)
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={catalogTab === 'raw' ? 'Search Raw / Product / Job' : 'Search HDF5 / Raw / Node'}
                  className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:border-accent"
                />
              </div>
              <div className="flex items-center gap-2">
                {catalogTab === 'raw' ? (
                  <select
                    value={levelFilter}
                    onChange={(event) => setLevelFilter(event.target.value as ProductLevel | 'all')}
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-accent"
                  >
                    <option value="all">All levels</option>
                    {LEVELS.map((level) => (
                      <option key={level} value={level}>{PRODUCT_LEVEL_LABELS[level]}</option>
                    ))}
                  </select>
                ) : (
                  <button
                    type="button"
                    onClick={handleUploadClick}
                    disabled={uploading || !selectedItem}
                    className={cn(
                      'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors',
                      uploading || !selectedItem
                        ? 'cursor-not-allowed bg-muted text-muted-foreground'
                        : 'bg-accent text-background hover:bg-accent/90',
                    )}
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Upload HDF5
                  </button>
                )}
              </div>
              <div className="text-[11px] font-semibold text-muted-foreground">
                {catalogTab === 'raw'
                  ? `Raw Data ${loading ? 'loading' : `${filteredLineage.length} items`}`
                  : `Level-0 (HDF5) ${loading ? 'loading' : `${filteredHdf5Files.length} items`}`}
              </div>
              {uploadQueue.length > 0 && (
                <div className="space-y-1">
                  {uploadQueue.slice(0, 2).map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        'rounded-md border px-2 py-1 text-[10px]',
                        item.status === 'uploaded' && 'border-success/35 text-success',
                        item.status === 'failed' && 'border-destructive/35 text-destructive',
                        item.status === 'uploading' && 'border-accent/35 text-muted-foreground',
                      )}
                    >
                      <div className="truncate font-medium">{item.fileName}</div>
                      <div className="truncate">{item.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {catalogTab === 'raw' ? (
              filteredLineage.length > 0 ? (
                <RawDataList
                  items={filteredLineage}
                  selectedRawId={selectedItem?.raw.id ?? null}
                  onSelect={(rawId) => {
                    setSelectedRawId(rawId);
                    selectInInspector({ type: 'raw' });
                  }}
                />
              ) : (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">No Raw Data matches the filters.</div>
              )
            ) : filteredHdf5Files.length > 0 ? (
              <Hdf5FileList
                files={filteredHdf5Files}
                selectedFileId={selectedHdf5FileId}
                onSelect={(file) => {
                  setSelectedRawId(file.rawDataId);
                  selectInInspector({ type: 'hdf5', fileId: file.id });
                }}
              />
            ) : (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No HDF5 files match the filters.</div>
            )}
          </aside>

          <section className="flex min-h-0 flex-col">
            {selectedItem ? (
              <>
                <div className="border-b border-border bg-background px-4 py-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Pipeline Diagram
                  </div>
                  {graphSteps.length > 0 && selectedPipeline ? (
                    <div className="h-56 overflow-hidden rounded-md border border-border bg-card">
                      <CanvasGraph
                        pipelineId={`catalog-${selectedItem.raw.id}-${selectedPipeline.id}`}
                        steps={graphSteps}
                        pipelineEdges={selectedPipeline.edges}
                        editable={false}
                        isJobMode
                        showGlow={false}
                        showMinimap={false}
                      />
                    </div>
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border bg-card text-[11px] text-muted-foreground">
                      {selectedItem.jobs.length === 0
                        ? 'No pipeline has been triggered for this Raw Data yet.'
                        : 'Pipeline definition unavailable.'}
                    </div>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">{selectedItem.raw.title}</h2>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {selectedItem.products.length} products / {selectedItem.jobs.length} jobs / {selectedItem.hdf5Files.length} HDF5
                      </div>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-md border border-border bg-card">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/35 text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Level</th>
                          <th className="px-3 py-2 font-medium">Product</th>
                          <th className="px-3 py-2 font-medium">Satellite</th>
                          <th className="px-3 py-2 font-medium">Mode</th>
                          <th className="px-3 py-2 font-medium">Job</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Created</th>
                          <th className="px-3 py-2 text-right font-medium">Download</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedItem.products.map((product) => (
                          <tr
                            key={product.id}
                            className="cursor-pointer border-t border-border hover:bg-muted/20"
                            onClick={() => {
                              selectInInspector({ type: 'product', productId: product.id });
                              openInspector();
                            }}
                          >
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1">
                                <span className="font-mono text-accent">{PRODUCT_LEVEL_LABELS[product.level]}</span>
                                {product.level === 'LEVEL_0' && (
                                  <span className="rounded bg-muted px-1 py-px text-[9px] font-semibold text-muted-foreground">HDF5</span>
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-semibold text-foreground">{product.id}</td>
                            <td className="px-3 py-2 text-foreground">{product.satelliteId}</td>
                            <td className="px-3 py-2 text-foreground">{product.mode}</td>
                            <td className="px-3 py-2 font-mono text-muted-foreground">{product.jobId}</td>
                            <td className="px-3 py-2"><ProductStatusBadge status={product.status} /></td>
                            <td className="px-3 py-2 text-muted-foreground">{formatKST(product.createdAt)}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (product.status === 'COMPLETED') void handleDownloadProduct(product);
                                }}
                                disabled={product.status !== 'COMPLETED'}
                                className={cn(
                                  'inline-flex items-center justify-center rounded p-1 transition-colors',
                                  product.status === 'COMPLETED'
                                    ? 'text-muted-foreground hover:bg-muted/40 hover:text-accent'
                                    : 'cursor-not-allowed text-muted-foreground/30',
                                )}
                                title={product.status === 'COMPLETED' ? 'Download' : 'Not available'}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {selectedItem.products.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                              No products have been generated yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <EmptyInspector title="No Data" description="Adjust the filters or check the Raw Data reception status." />
            )}
          </section>

          {selectedItem && inspectorMounted && (
            <aside
              className={cn(
                'absolute inset-y-0 right-0 z-20 flex w-[420px] min-h-0 flex-col border-l border-border bg-card shadow-2xl transition-all duration-200 ease-out',
                inspectorAnimating ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0',
              )}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setInspectorTab('raw')}
                    className={cn(
                      'rounded px-2 py-1 text-[11px] font-semibold transition-colors',
                      inspectorTab === 'raw'
                        ? 'bg-accent/10 text-accent'
                        : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                    )}
                  >
                    Raw Data
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorTab('result')}
                    className={cn(
                      'rounded px-2 py-1 text-[11px] font-semibold transition-colors',
                      inspectorTab === 'result'
                        ? 'bg-accent/10 text-accent'
                        : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                    )}
                  >
                    Result
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => closeInspector()}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                  aria-label="Close inspector"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <Inspector
                  item={selectedItem}
                  tab={inspectorTab}
                  selection={selection}
                  onSelect={selectInInspector}
                  onDownloadProduct={(product) => void handleDownloadProduct(product)}
                  onReprocessProduct={(product) => void handleReprocessProduct(product)}
                />
              </div>
            </aside>
          )}
        </div>
        )}
      </main>
    </div>
  );
}
