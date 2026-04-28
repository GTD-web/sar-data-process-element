'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ElementType } from 'react';
import { usePathname } from 'next/navigation';
import LeftSidebar from '@/components/panels/LeftSidebar';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import { toast } from '@/components/ui/Toast';
import { cn, formatDuration, formatKST, formatRelativeTime } from '@/lib/utils';
import { PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import type {
  Hdf5FileSummary,
  JobSummary,
  Product,
  ProductLevel,
  RawDataSummary,
} from '@/types/pipeline';
import {
  Antenna,
  Binary,
  CheckCircle2,
  Circle,
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
              <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {item.raw.status}
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

function StageNode({
  label,
  count,
  active,
  icon: Icon,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  icon: ElementType;
  onClick: () => void;
}) {
  const hasData = count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-24 flex-col items-start justify-between rounded-md border px-3 py-3 text-left transition-colors',
        active
          ? 'border-accent bg-accent/10'
          : hasData
            ? 'border-border bg-card hover:border-accent/45'
            : 'border-dashed border-border bg-background/40 text-muted-foreground',
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <Icon className={cn('h-4 w-4', hasData ? 'text-accent' : 'text-muted-foreground')} />
        {hasData ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground/50" />}
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">{count > 0 ? `${count}개 항목` : '미생성'}</div>
      </div>
    </button>
  );
}

function LineageTimeline({
  item,
  selection,
  onSelect,
}: {
  item: LineageItem;
  selection: InspectorSelection;
  onSelect: (selection: InspectorSelection) => void;
}) {
  return (
    <div className="border-b border-border bg-background px-4 py-4">
      <div className="grid grid-cols-6 gap-2">
        <StageNode
          label="Raw"
          count={1}
          active={selection.type === 'raw'}
          icon={Antenna}
          onClick={() => onSelect({ type: 'raw' })}
        />
        <StageNode
          label="HDF5"
          count={item.hdf5Files.length}
          active={selection.type === 'hdf5'}
          icon={Database}
          onClick={() => onSelect({ type: 'hdf5', fileId: item.hdf5Files[0]?.id })}
        />
        {LEVELS.map((level) => {
          const levelProducts = item.products.filter((product) => product.level === level);
          return (
            <StageNode
              key={level}
              label={PRODUCT_LEVEL_LABELS[level]}
              count={levelProducts.length}
              active={selection.type === 'product' && levelProducts.some((product) => product.id === selection.productId)}
              icon={level === 'LEVEL_0' ? HardDrive : level === 'LEVEL_3' ? Package : Layers}
              onClick={() => onSelect({ type: 'product', productId: levelProducts[0]?.id })}
            />
          );
        })}
      </div>
    </div>
  );
}

function Hdf5Inspector({ files, selectedFileId }: { files: Hdf5FileSummary[]; selectedFileId?: string }) {
  const file = files.find((item) => item.id === selectedFileId) ?? files[0] ?? null;
  const node = file?.nodes[0] ?? null;
  const attrs = file && node ? file.attributes[node.path] ?? [] : [];

  if (!file) {
    return <EmptyInspector title="HDF5 없음" description="선택한 Raw Data에 연결된 HDF5 파일이 없습니다." />;
  }

  return (
    <div className="min-h-0 overflow-y-auto">
      <InspectorHeader icon={Database} title={file.fileName} subtitle={`${file.nodes.length} nodes / ${formatFileSize(file.fileSizeBytes)}`} />
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
            {node?.type ?? '-'} / attrs.length attributes
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
                  <td className="px-2 py-5 text-center text-muted-foreground">표시할 attribute가 없습니다.</td>
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
  onClose,
  onDownload,
  onReprocess,
}: {
  products: Product[];
  selectedProductId?: string;
  onClose: () => void;
  onDownload: (product: Product) => void;
  onReprocess: (product: Product) => void;
}) {
  const product = products.find((item) => item.id === selectedProductId) ?? products[0] ?? null;
  const pathname = usePathname();
  const base = pathname.startsWith('/current') ? '/current' : '/plan';

  if (!product) {
    return <EmptyInspector title="Production 없음" description="선택한 단계에 생성된 산출물이 없습니다." />;
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{product.id}</div>
          <div className="truncate text-xs text-muted-foreground">{product.rawDataName ?? product.sceneId}</div>
        </div>
        <button onClick={onClose} className="rounded p-1 transition-colors hover:bg-muted/50" aria-label="Production 상세 닫기">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <ProductStatusBadge status={product.status} />
          <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-xs text-accent">
            {PRODUCT_LEVEL_LABELS[product.level]}
          </span>
        </div>

        <div className="flex aspect-square items-center justify-center rounded-lg border border-border bg-background p-3">
          {product.thumbnailUrl ? (
            <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              <span className="text-xs">Quick-look Thumbnail</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/50">미리보기 없음</span>
          )}
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">메타데이터</h4>
          <div className="grid grid-cols-2 gap-2">
            <MetaItem label="위성" value={product.satelliteId} />
            <MetaItem label="모드" value={product.mode} />
            <MetaItem label="편파" value={product.polarization} />
            <MetaItem label="Job ID" value={product.jobId} href={`${base}/jobs?jobId=${product.jobId}`} />
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <MapPin className="h-3 w-3" />
            공간 범위
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
              촬영 시간
            </h4>
            <div className="text-xs text-foreground">{formatKST(product.acquisitionStart)}</div>
            <div className="text-xs text-muted-foreground">~ {formatKST(product.acquisitionEnd)}</div>
          </div>
          <div className="space-y-1">
            <h4 className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
              <Ruler className="h-3 w-3" />
              해상도
            </h4>
            <div className="text-xs text-foreground">
              Range: {product.resolutionRange.toFixed(1)}m
              <br />
              Azimuth: {product.resolutionAzimuth.toFixed(1)}m
            </div>
          </div>
        </div>

        <MetaItem label="처리 소요 시간" value={formatDuration(product.processingTimeMs)} />

        {product.quality && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Eye className="h-3 w-3" />
              품질 검증 (REQ-FUNC-023)
            </h4>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-background text-muted-foreground">
                    <th className="px-3 py-1.5 text-left font-medium">지표</th>
                    <th className="px-3 py-1.5 text-right font-medium">값</th>
                    <th className="px-3 py-1.5 text-center font-medium">판정</th>
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
                    <td className="px-3 py-1.5 text-foreground">기하 정확도</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">
                      {product.quality.geometricAccuracy.value.toFixed(1)} {product.quality.geometricAccuracy.unit}
                    </td>
                    <td className="px-3 py-1.5 text-center"><QualityBadge pass={product.quality.geometricAccuracy.pass} /></td>
                  </tr>
                  <tr className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-foreground">방사 보정</td>
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
          다운로드
        </button>
        <button
          onClick={() => onReprocess(product)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/30"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          재처리
        </button>
      </div>
    </div>
  );
}

function RawInspector({ raw }: { raw: RawDataSummary }) {
  return (
    <div className="min-h-0 overflow-y-auto">
      <InspectorHeader icon={Antenna} title={raw.title} subtitle={raw.rawDataPath} />
      <div className="grid grid-cols-2 border-b border-border">
        <StatBlock label="위성" value={raw.satelliteId} icon={Antenna} />
        <StatBlock label="모드" value={raw.mode} icon={Filter} />
        <StatBlock label="편파" value={raw.polarization} icon={Layers} />
        <StatBlock label="크기" value={formatFileSize(raw.fileSizeBytes)} icon={HardDrive} />
      </div>
      <section className="border-b border-border px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Acquisition</div>
        <div className="mt-2 text-xs text-foreground">{formatKST(raw.capturedAt)}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">수신: {formatKST(raw.receivedAt)}</div>
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

function JobInspector({ jobs, selectedJobId }: { jobs: JobSummary[]; selectedJobId?: string }) {
  const job = jobs.find((item) => item.jobId === selectedJobId) ?? jobs[0] ?? null;
  if (!job) return <EmptyInspector title="Job 없음" description="선택한 Raw Data에서 연결된 처리 Job을 찾지 못했습니다." />;
  return (
    <div className="min-h-0 overflow-y-auto">
      <InspectorHeader icon={FileJson} title={job.jobId} subtitle={job.pipelineId} />
      <div className="border-b border-border px-4 py-3">
        <JobStatusBadge status={job.status} />
      </div>
      <div className="grid grid-cols-2 border-b border-border">
        <StatBlock label="현재 레벨" value={job.currentLevel ? PRODUCT_LEVEL_LABELS[job.currentLevel] : '-'} icon={Layers} />
        <StatBlock label="재시도" value={job.retryCount} icon={Clock} />
      </div>
      <section className="px-4 py-3 text-xs text-foreground">
        <div>시작: {formatKST(job.startedAt)}</div>
        <div className="mt-1 text-muted-foreground">업데이트: {formatKST(job.updatedAt)}</div>
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
  selection,
  onCloseProduct,
  onDownloadProduct,
  onReprocessProduct,
}: {
  item: LineageItem;
  selection: InspectorSelection;
  onCloseProduct: () => void;
  onDownloadProduct: (product: Product) => void;
  onReprocessProduct: (product: Product) => void;
}) {
  if (selection.type === 'hdf5') return <Hdf5Inspector files={item.hdf5Files} selectedFileId={selection.fileId} />;
  if (selection.type === 'product') {
    return (
      <ProductDetailPanel
        products={item.products}
        selectedProductId={selection.productId}
        onClose={onCloseProduct}
        onDownload={onDownloadProduct}
        onReprocess={onReprocessProduct}
      />
    );
  }
  if (selection.type === 'job') return <JobInspector jobs={item.jobs} selectedJobId={selection.jobId} />;
  return <RawInspector raw={item.raw} />;
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
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<ProductLevel | 'all'>('all');
  const [catalogTab, setCatalogTab] = useState<CatalogListTab>('raw');
  const [selectedRawId, setSelectedRawId] = useState<string | null>(null);
  const [selection, setSelection] = useState<InspectorSelection>({ type: 'raw' });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [rawRes, hdf5Res, productRes, jobRes] = await Promise.all([
      service.원시데이터_목록을_조회한다({ limit: 500 }),
      service.HDF5_애트리뷰트_목록을_조회한다(),
      service.제품_목록을_조회한다({ limit: 500 }),
      service.Job_목록을_조회한다({ limit: 500 }),
    ]);
    if (rawRes.data) setRawData(rawRes.data.items);
    if (hdf5Res.data) setHdf5Files(hdf5Res.data);
    if (productRes.data) setProducts(productRes.data.items);
    if (jobRes.data) setJobs(jobRes.data.items);
    setLoading(false);
  }, [service]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
      toast.error('HDF5 파일을 연결할 Raw Data를 먼저 선택하세요.');
      return;
    }

    const queuedUploads = selectedFiles.map((file, index) => ({
      id: createUploadQueueId(file, index),
      fileName: file.name,
      status: 'uploading' as const,
      message: '업로드 중',
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
                ? { ...item, status: 'failed', message: result.message || '업로드 실패' }
                : item,
            ),
          );
          toast.error(result.message || `"${file.name}" 업로드에 실패했습니다.`);
          continue;
        }

        const uploaded = { ...result.data, rawDataId: selectedItem.raw.id };
        uploadedFiles.push(uploaded);
        setUploadQueue((current) =>
          current.map((item) =>
            item.id === queuedUpload.id
              ? { ...item, status: 'uploaded', message: '업로드 완료' }
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
            ? `"${uploadedFiles[0].fileName}" 파일이 추가되었습니다.`
            : `${uploadedFiles.length}개의 HDF5 파일이 추가되었습니다.`,
        );
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadProduct = async (product: Product) => {
    const res = await service.제품_다운로드_URL을_발급한다(product.id);
    if (!res.success || !res.data) {
      toast.error(res.message || '다운로드 URL을 발급하지 못했습니다.');
      return;
    }
    window.open(res.data.url, '_blank', 'noopener,noreferrer');
  };

  const handleReprocessProduct = async (product: Product) => {
    const res = await service.제품_재처리를_요청한다(product.id, { targetLevel: product.level });
    if (!res.success || !res.data) {
      toast.error(res.message || '재처리 요청에 실패했습니다.');
      return;
    }
    toast.success(`재처리 요청 완료 - Job: ${res.data.jobId}`);
  };

  const totals = useMemo(() => ({
    raw: rawData.length,
    hdf5: hdf5Files.length,
    products: products.length,
    completed: products.filter((product) => product.status === 'COMPLETED').length,
  }), [hdf5Files.length, products, rawData.length]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <LeftSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} mode="nav" activePage="data-catalog" />
      <main className="min-w-0 flex-1">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".h5,.hdf5,application/x-hdf5"
          onChange={(event) => void handleHdf5Upload(event)}
          className="hidden"
        />
        <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)_360px]">
          <aside className="flex min-h-0 flex-col border-r border-border bg-card">
            <div className="space-y-2 border-b border-border px-3 py-3">
              <div className="grid grid-cols-4 overflow-hidden rounded-md border border-border bg-background">
                <div className="px-2 py-1.5">
                  <div className="text-[9px] text-muted-foreground">Raw</div>
                  <div className="text-xs font-semibold text-foreground">{totals.raw}</div>
                </div>
                <div className="border-l border-border px-2 py-1.5">
                  <div className="text-[9px] text-muted-foreground">HDF5</div>
                  <div className="text-xs font-semibold text-foreground">{totals.hdf5}</div>
                </div>
                <div className="border-l border-border px-2 py-1.5">
                  <div className="text-[9px] text-muted-foreground">Prod</div>
                  <div className="text-xs font-semibold text-foreground">{totals.products}</div>
                </div>
                <div className="border-l border-border px-2 py-1.5">
                  <div className="text-[9px] text-muted-foreground">Done</div>
                  <div className="text-xs font-semibold text-foreground">{totals.completed}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-background p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setCatalogTab('raw');
                    if (selectedItem) setSelection({ type: 'raw' });
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
                      setSelection({ type: 'hdf5', fileId: nextFile.id });
                    }
                  }}
                  className={cn(
                    'h-7 rounded px-2 text-xs font-semibold transition-colors',
                    catalogTab === 'hdf5'
                      ? 'bg-accent text-background'
                      : 'text-muted-foreground hover:bg-muted/35 hover:text-foreground',
                  )}
                >
                  HDF5 Files
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
                {catalogTab === 'raw' && (
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
                )}
                <button
                  type="button"
                  onClick={handleUploadClick}
                  disabled={uploading || !selectedItem}
                  className={cn(
                    'flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors',
                    catalogTab === 'hdf5' && 'flex-1',
                    uploading || !selectedItem
                      ? 'cursor-not-allowed bg-muted text-muted-foreground'
                      : 'bg-accent text-background hover:bg-accent/90',
                  )}
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  HDF5
                </button>
              </div>
              <div className="text-[11px] font-semibold text-muted-foreground">
                {catalogTab === 'raw'
                  ? `Raw Data ${loading ? 'loading' : `${filteredLineage.length} items`}`
                  : `HDF5 Files ${loading ? 'loading' : `${filteredHdf5Files.length} items`}`}
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
                    setSelection({ type: 'raw' });
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
                  setSelection({ type: 'hdf5', fileId: file.id });
                }}
              />
            ) : (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No HDF5 files match the filters.</div>
            )}
          </aside>

          <section className="flex min-h-0 flex-col">
            {selectedItem ? (
              <>
                <LineageTimeline item={selectedItem} selection={selection} onSelect={setSelection} />
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
                          <th className="px-3 py-2 font-medium">Job</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedItem.products.map((product) => (
                          <tr
                            key={product.id}
                            className="cursor-pointer border-t border-border hover:bg-muted/20"
                            onClick={() => setSelection({ type: 'product', productId: product.id })}
                          >
                            <td className="px-3 py-2 font-mono text-accent">{PRODUCT_LEVEL_LABELS[product.level]}</td>
                            <td className="px-3 py-2 font-semibold text-foreground">{product.id}</td>
                            <td className="px-3 py-2 font-mono text-muted-foreground">{product.jobId}</td>
                            <td className="px-3 py-2"><ProductStatusBadge status={product.status} /></td>
                            <td className="px-3 py-2 text-muted-foreground">{formatKST(product.createdAt)}</td>
                          </tr>
                        ))}
                        {selectedItem.products.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                              아직 생성된 Production 산출물이 없습니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <EmptyInspector title="데이터 없음" description="검색 조건을 조정하거나 Raw Data 수신 상태를 확인하세요." />
            )}
          </section>

          <aside className="min-h-0 border-l border-border bg-card">
            {selectedItem ? (
              <Inspector
                item={selectedItem}
                selection={selection}
                onCloseProduct={() => setSelection({ type: 'raw' })}
                onDownloadProduct={(product) => void handleDownloadProduct(product)}
                onReprocessProduct={(product) => void handleReprocessProduct(product)}
              />
            ) : null}
          </aside>
        </div>
      </main>
    </div>
  );
}
