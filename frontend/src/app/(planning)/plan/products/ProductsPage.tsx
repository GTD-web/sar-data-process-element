'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import LeftSidebar from '@/components/panels/LeftSidebar';
import { toast } from '@/components/ui/Toast';
import type { Product, ProductLevel } from '@/types/pipeline';
import { PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { cn, formatKST, formatDuration } from '@/lib/utils';
import {
  Package,
  Search,
  Download,
  RefreshCw,
  X,
  CheckCircle,
  XCircle,
  Image as ImageIcon,
  MapPin,
  Clock,
  Ruler,
  Eye,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SATELLITES = ['Lumir-X1', 'Lumir-X2', 'Lumir-X3'];
const MODES = ['Stripmap', 'ScanSAR', 'Spotlight'];
const LEVELS: ProductLevel[] = ['LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];
const STATUSES = ['COMPLETED', 'FAILED', 'PROCESSING'];

// ---------------------------------------------------------------------------
// Product Status Badge
// ---------------------------------------------------------------------------

function ProductStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: 'bg-success/15 text-success',
    FAILED: 'bg-destructive/15 text-destructive',
    PROCESSING: 'bg-accent/15 text-accent',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
        styles[status] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {status === 'COMPLETED' && <CheckCircle className="w-3 h-3" />}
      {status === 'FAILED' && <XCircle className="w-3 h-3" />}
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Quality Badge
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Reprocess Dialog
// ---------------------------------------------------------------------------

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
        <h3 className="text-sm font-semibold text-foreground mb-3">제품 재처리</h3>

        <div className="space-y-3">
          <div>
            <span className="text-[11px] text-muted-foreground">Scene ID</span>
            <div className="text-xs font-mono text-foreground mt-0.5">{product.sceneId}</div>
          </div>

          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">시작 레벨</span>
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
            <span className="text-[11px] text-muted-foreground">새 Job이 생성됩니다</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
          >
            취소
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
            재처리 요청
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product Detail Panel
// ---------------------------------------------------------------------------

function ProductDetailPanel({
  product,
  onClose,
  onDownload,
  onReprocess,
}: {
  product: Product;
  onClose: () => void;
  onDownload: () => void;
  onReprocess: () => void;
}) {
  const pathname = usePathname();
  const base = pathname.startsWith('/current') ? '/current' : '/plan';

  return (
    <div className="h-full flex flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">{product.id}</div>
          <div className="text-xs text-muted-foreground">{product.sceneId}</div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted/50 transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status + Level */}
        <div className="flex items-center gap-2">
          <ProductStatusBadge status={product.status} />
          <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-accent/10 text-accent">
            {PRODUCT_LEVEL_LABELS[product.level]}
          </span>
        </div>

        {/* Thumbnail */}
        <div className="rounded-lg border border-border bg-background p-3 flex items-center justify-center aspect-square">
          {product.thumbnailUrl ? (
            <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
              <ImageIcon className="w-8 h-8" />
              <span className="text-xs">Quick-look Thumbnail</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/50">미리보기 없음</span>
          )}
        </div>

        {/* Metadata */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">메타데이터</h4>
          <div className="grid grid-cols-2 gap-2">
            <MetaItem label="위성" value={product.satelliteId} />
            <MetaItem label="모드" value={product.mode} />
            <MetaItem label="편파" value={product.polarization} />
            <MetaItem label="Job ID" value={product.jobId} href={`${base}/jobs?jobId=${product.jobId}`} />
          </div>
        </div>

        {/* Spatial */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            공간 범위
          </h4>
          <div className="text-xs font-mono text-foreground bg-background rounded-md px-3 py-2 border border-border">
            W: {product.spatialExtent.west.toFixed(4)}° &nbsp; S: {product.spatialExtent.south.toFixed(4)}°<br />
            E: {product.spatialExtent.east.toFixed(4)}° &nbsp; N: {product.spatialExtent.north.toFixed(4)}°
          </div>
        </div>

        {/* Time + Resolution */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
              <Clock className="w-3 h-3" />
              촬영 시간
            </h4>
            <div className="text-xs text-foreground">{formatKST(product.acquisitionStart)}</div>
            <div className="text-xs text-muted-foreground">~ {formatKST(product.acquisitionEnd)}</div>
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
              <Ruler className="w-3 h-3" />
              해상도
            </h4>
            <div className="text-xs text-foreground">
              Range: {product.resolutionRange.toFixed(1)}m<br />
              Azimuth: {product.resolutionAzimuth.toFixed(1)}m
            </div>
          </div>
        </div>

        {/* Processing Time */}
        <MetaItem label="처리 소요 시간" value={formatDuration(product.processingTimeMs)} />

        {/* Quality */}
        {product.quality && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Eye className="w-3 h-3" />
              품질 검증 (REQ-FUNC-023)
            </h4>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-background text-muted-foreground">
                    <th className="text-left px-3 py-1.5 font-medium">지표</th>
                    <th className="text-right px-3 py-1.5 font-medium">값</th>
                    <th className="text-center px-3 py-1.5 font-medium">판정</th>
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
                    <td className="px-3 py-1.5 text-foreground">기하 정확도</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">
                      {product.quality.geometricAccuracy.value.toFixed(1)} {product.quality.geometricAccuracy.unit}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <QualityBadge pass={product.quality.geometricAccuracy.pass} />
                    </td>
                  </tr>
                  <tr className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-foreground">방사 보정</td>
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

      {/* Actions — pinned to bottom */}
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
          다운로드
        </button>
        <button
          onClick={onReprocess}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-border text-foreground hover:bg-muted/30 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          재처리
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

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ProductsPage() {
  const service = usePipelineService();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // Panel animation
  const [panelMounted, setPanelMounted] = useState(false);
  const [panelAnimating, setPanelAnimating] = useState(false);
  const panelProductRef = useRef<Product | null>(null);

  // Open panel
  function openPanel(product: Product) {
    panelProductRef.current = product;
    setSelectedProduct(product);
    setPanelMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPanelAnimating(true));
    });
  }

  // Close panel with animation
  function closePanel() {
    setPanelAnimating(false);
    setTimeout(() => {
      setPanelMounted(false);
      setSelectedProduct(null);
      panelProductRef.current = null;
    }, 200);
  }

  // Filters
  const [filterLevel, setFilterLevel] = useState('');
  const [filterSatellite, setFilterSatellite] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  // Dialogs
  const [reprocessTarget, setReprocessTarget] = useState<Product | null>(null);

  const loadData = useCallback(async () => {
    const pRes = await service.제품_목록을_조회한다({
      level: filterLevel || undefined,
      satelliteId: filterSatellite || undefined,
      mode: filterMode || undefined,
      status: filterStatus || undefined,
      limit: 50,
    });
    if (pRes.data) {
      setProducts(pRes.data.items);
      setTotalCount(pRes.data.total);
    }
  }, [service, filterLevel, filterSatellite, filterMode, filterStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 의존성이 변경될 때 비동기 데이터를 fetch하여 상태를 갱신하는 정규 패턴
    loadData();
  }, [loadData]);

  const filtered = (search
    ? products.filter(
        (p) =>
          p.id.toLowerCase().includes(search.toLowerCase()) || p.sceneId.toLowerCase().includes(search.toLowerCase()),
      )
    : products
  )
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  async function handleDownload(product: Product) {
    const res = await service.제품_다운로드_URL을_발급한다(product.id);
    if (res.success && res.data) {
      toast.success(`다운로드 링크 생성 완료 (${Math.floor(res.data.expiresIn / 60)}분 후 만료)`);
      window.open(res.data.url, '_blank');
    } else {
      toast.error(res.message);
    }
  }

  async function handleReprocess(targetLevel: string) {
    if (!reprocessTarget) return;
    const res = await service.제품_재처리를_요청한다(reprocessTarget.id, { targetLevel });
    if (res.success && res.data) {
      toast.success(`재처리 요청 완료 — Job: ${res.data.jobId}`);
    } else {
      toast.error(res.message);
    }
    setReprocessTarget(null);
  }

  return (
    <div className="h-full flex">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        activePage="products"
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Main list area */}
        <div className={cn('flex-1 flex flex-col overflow-hidden', panelMounted && 'max-w-[calc(100%-600px)]')}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-accent" />
              <h1 className="text-sm font-semibold text-foreground">제품</h1>
              <span className="text-[10px] text-muted-foreground font-mono">{totalCount}건</span>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border shrink-0 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ID / Scene ID 검색..."
                className="pl-8 pr-3 py-1.5 bg-background border border-border rounded-md text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent w-52"
              />
            </div>
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">전체 레벨</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {PRODUCT_LEVEL_LABELS[l]}
                </option>
              ))}
            </select>
            <select
              value={filterSatellite}
              onChange={(e) => setFilterSatellite(e.target.value)}
              className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">전체 위성</option>
              {SATELLITES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">전체 모드</option>
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">전체 상태</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="text-left px-5 py-2.5">Product ID</th>
                  <th className="text-left px-3 py-2.5">Scene ID</th>
                  <th className="text-center px-3 py-2.5">레벨</th>
                  <th className="text-left px-3 py-2.5">위성</th>
                  <th className="text-left px-3 py-2.5">모드</th>
                  <th className="text-center px-3 py-2.5">상태</th>
                  <th className="text-left px-3 py-2.5">생성일</th>
                  <th className="text-right px-5 py-2.5">작업</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => openPanel(p)}
                    className={cn(
                      'border-b border-border/50 cursor-pointer transition-colors',
                      selectedProduct?.id === p.id ? 'bg-accent/5' : 'hover:bg-muted/20',
                    )}
                  >
                    <td className="px-5 py-2.5 text-xs font-mono text-foreground">{p.id}</td>
                    <td className="px-3 py-2.5 text-xs text-foreground">{p.sceneId}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/10 text-accent">
                        {PRODUCT_LEVEL_LABELS[p.level]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-foreground">{p.satelliteId}</td>
                    <td className="px-3 py-2.5 text-xs text-foreground">{p.mode}</td>
                    <td className="px-3 py-2.5 text-center">
                      <ProductStatusBadge status={p.status} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatKST(p.createdAt)}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(p);
                          }}
                          disabled={p.status !== 'COMPLETED'}
                          className={cn(
                            'p-1.5 rounded-md transition-colors',
                            p.status === 'COMPLETED'
                              ? 'hover:bg-muted/50 text-muted-foreground hover:text-accent'
                              : 'text-muted-foreground/30 cursor-not-allowed',
                          )}
                          title="다운로드"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setReprocessTarget(p);
                          }}
                          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                          title="재처리"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-sm text-muted-foreground">
                      조건에 맞는 제품이 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Panel */}
        {panelMounted && selectedProduct && (
          <div
            className={cn(
              'w-150 shrink-0 transition-all duration-200 ease-out overflow-hidden',
              panelAnimating ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0',
            )}
          >
            <ProductDetailPanel
              product={selectedProduct}
              onClose={closePanel}
              onDownload={() => handleDownload(selectedProduct)}
              onReprocess={() => setReprocessTarget(selectedProduct)}
            />
          </div>
        )}
      </div>

      {/* Dialogs */}
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
