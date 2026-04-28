'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type OlMap from 'ol/Map';
import { usePathname, useRouter } from 'next/navigation';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import LeftSidebar from '@/components/panels/LeftSidebar';
import { toast } from '@/components/ui/Toast';
import { cn, formatKST, formatRelativeTime } from '@/lib/utils';
import type { PipelineDefinition, PipelineStep, RawDataStatus, RawDataSummary } from '@/types/pipeline';
import {
  Antenna,
  Check,
  CheckCircle2,
  ChevronDown,
  Database,
  Link2,
  MapPin,
  Play,
  RadioTower,
  Search,
  Unlink2,
  Workflow,
  X,
} from 'lucide-react';

const SATELLITES = ['Lumir-X1', 'Lumir-X2', 'Lumir-X3'];
const MODES = ['Stripmap', 'ScanSAR', 'Spotlight'];
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

const CanvasGraph = dynamic(() => import('@/components/graph/CanvasGraph'), {
  ssr: false,
  loading: () => (
    <div className="mt-3 flex h-52 items-center justify-center rounded-xl border border-border bg-background/50 text-sm text-muted-foreground">
      파이프라인 미리보기 불러오는 중...
    </div>
  ),
});

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

function RawDataStatusBadge({ status }: { status: RawDataStatus }) {
  const tone = {
    RECEIVED: 'bg-muted text-muted-foreground',
    MAPPED: 'bg-accent/15 text-accent',
    READY: 'bg-success/15 text-success',
    HOLD: 'bg-destructive/15 text-destructive',
  }[status];
  const label = {
    RECEIVED: '수신됨',
    MAPPED: '매핑됨',
    READY: '준비 완료',
    HOLD: '보류',
  }[status];

  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold', tone)}>{label}</span>;
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="rounded-md bg-accent/10 p-1 text-accent">
          <Icon className="h-3.5 w-3.5" />
        </span>
        {label}
      </div>
      <div className="mt-2 font-mono text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function isRawDataCompatiblePipeline(pipeline: PipelineDefinition): boolean {
  return pipeline.steps[0]?.kind === 'TRIGGER';
}

function PipelineMiniPreview({ pipeline }: { pipeline: PipelineDefinition | null }) {
  if (!pipeline) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
        미리볼 파이프라인을 선택하면 여기서 처리 흐름을 확인할 수 있습니다.
      </div>
    );
  }

  const previewSteps: PipelineStep[] = pipeline.steps.map((step) => ({
    order: step.order,
    kind: step.kind,
    sarStage: step.sarStage,
    inputLevel: step.inputLevel,
    targetCsc: step.kind === 'JOB_INIT'
      ? 'CSC-08'
      : step.kind === 'CATALOG' || step.kind === 'THUMBNAIL'
        ? 'CSC-07'
        : step.kind === 'TRIGGER' || step.kind === 'FILE_INPUT'
          ? 'CSC-02'
          : 'CSC-03',
    productLevel: step.inputLevel ?? 'LEVEL_0',
    status: 'PENDING',
    enabledTasks: step.enabledTasks,
  }));

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 px-3 pt-3">
          <div className="truncate text-sm font-semibold text-foreground">{pipeline.name}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{pipeline.satelliteId} · {pipeline.mode}</div>
        </div>
        <div className="px-3 pt-3">
          <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-mono text-muted-foreground">
            {pipeline.steps.length} steps
          </span>
        </div>
      </div>
      <div className="raw-preview-flow h-60 border-t border-border bg-background/40">
        <CanvasGraph
          pipelineId={`raw-preview-${pipeline.id}`}
          steps={previewSteps}
          pipelineEdges={pipeline.edges}
          editable={false}
        />
      </div>
      <div className="border-t border-border bg-card px-3 py-2">
        <div className="text-[10px] text-muted-foreground">
          현재 선택된 파이프라인의 처리 흐름 미리보기입니다.
        </div>
      </div>
    </div>
  );
}

function buildFallbackFootprint(rawData: RawDataSummary): [number, number][] {
  const widthRatio = rawData.mode === 'ScanSAR' ? 0.72 : rawData.mode === 'Spotlight' ? 0.34 : 0.46;
  const halfAlongKm = rawData.footprintKm / 2;
  const halfAcrossKm = (rawData.footprintKm * widthRatio) / 2;
  const headingSeed = rawData.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const heading = ((headingSeed % 140) - 70) * (Math.PI / 180);
  const latKm = 110.574;
  const lonKm = Math.max(1, 111.32 * Math.cos(rawData.latitude * Math.PI / 180));
  const corners = [
    [-halfAlongKm, -halfAcrossKm],
    [halfAlongKm, -halfAcrossKm],
    [halfAlongKm, halfAcrossKm],
    [-halfAlongKm, halfAcrossKm],
  ];
  const ring = corners.map(([along, across]) => {
    const eastKm = along * Math.sin(heading) + across * Math.cos(heading);
    const northKm = along * Math.cos(heading) - across * Math.sin(heading);
    return [
      Number((rawData.longitude + eastKm / lonKm).toFixed(6)),
      Number((rawData.latitude + northKm / latKm).toFixed(6)),
    ] as [number, number];
  });

  return [...ring, ring[0]!];
}

function RawDataCoverageMap({ rawData }: { rawData: RawDataSummary }) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const footprint = useMemo(() => rawData.footprint ?? buildFallbackFootprint(rawData), [rawData]);

  useEffect(() => {
    let disposed = false;
    let map: OlMap | null = null;

    (async () => {
      const [
        { default: Map },
        { default: View },
        { default: TileLayer },
        { default: VectorLayer },
        { default: OSM },
        { default: VectorSource },
        { default: Feature },
        { default: Polygon },
        { default: Point },
        { fromLonLat },
        { Fill, Stroke, Style, Circle: CircleStyle },
      ] = await Promise.all([
        import('ol/Map'),
        import('ol/View'),
        import('ol/layer/Tile'),
        import('ol/layer/Vector'),
        import('ol/source/OSM'),
        import('ol/source/Vector'),
        import('ol/Feature'),
        import('ol/geom/Polygon'),
        import('ol/geom/Point'),
        import('ol/proj'),
        import('ol/style'),
      ]);

      if (disposed || !mapElementRef.current) return;

      const center = fromLonLat([rawData.longitude, rawData.latitude]);
      const footprintCoordinates = footprint.map((coordinate) => fromLonLat(coordinate));
      const footprintFeature = new Feature({
        geometry: new Polygon([footprintCoordinates]),
      });
      footprintFeature.setStyle(new Style({
        fill: new Fill({ color: 'rgba(16, 185, 129, 0.22)' }),
        stroke: new Stroke({ color: '#10b981', width: 2 }),
      }));

      const centerFeature = new Feature({
        geometry: new Point(center),
      });
      centerFeature.setStyle(new Style({
        image: new CircleStyle({
          radius: 5,
          fill: new Fill({ color: '#ffffff' }),
          stroke: new Stroke({ color: '#10b981', width: 3 }),
        }),
      }));

      const vectorSource = new VectorSource({
        features: [footprintFeature, centerFeature],
      });

      map = new Map({
        target: mapElementRef.current,
        layers: [
          new TileLayer({ source: new OSM() }),
          new VectorLayer({ source: vectorSource }),
        ],
        view: new View({
          center,
          zoom: 9,
        }),
      });

      const extent = vectorSource.getExtent();
      if (extent) {
        map.getView().fit(extent, {
          padding: [30, 30, 30, 30],
          maxZoom: 12,
          duration: 180,
        });
      }
      window.setTimeout(() => map?.updateSize(), 80);
    })();

    return () => {
      disposed = true;
      map?.setTarget(undefined);
    };
  }, [footprint, rawData.latitude, rawData.longitude]);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="raw-coverage-map relative h-64 bg-muted/30" ref={mapElementRef} />
      <div className="grid grid-cols-3 divide-x divide-border border-t border-border bg-card text-[10px]">
        <div className="px-3 py-2">
          <div className="text-muted-foreground">Center</div>
          <div className="mt-1 font-mono text-foreground">{rawData.latitude.toFixed(4)}, {rawData.longitude.toFixed(4)}</div>
        </div>
        <div className="px-3 py-2">
          <div className="text-muted-foreground">Footprint</div>
          <div className="mt-1 font-mono text-foreground">{rawData.footprintKm.toFixed(1)} km</div>
        </div>
        <div className="px-3 py-2">
          <div className="text-muted-foreground">Mode</div>
          <div className="mt-1 font-mono text-foreground">{rawData.mode}</div>
        </div>
      </div>
    </div>
  );
}

function pipelineMatchesSearch(pipeline: PipelineDefinition, keyword: string): boolean {
  if (!keyword) return true;
  const haystack = [pipeline.name, pipeline.id, pipeline.satelliteId, pipeline.mode].join(' ').toLowerCase();
  return haystack.includes(keyword);
}

function PipelineSearchOption({
  pipeline,
  selected,
  onSelect,
}: {
  pipeline: PipelineDefinition;
  selected: boolean;
  onSelect: (pipelineId: string) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(pipeline.id)}
      className={cn(
        'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors',
        selected ? 'bg-accent/12 text-foreground' : 'hover:bg-muted/35',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-accent bg-accent text-background' : 'border-border text-transparent',
        )}
      >
        <Check className="h-3 w-3" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-foreground">{pipeline.name}</span>
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
          {pipeline.satelliteId} · {pipeline.mode} · {pipeline.steps.length} steps
        </span>
      </span>
    </button>
  );
}

function PipelineSearchSelect({
  pipelines,
  recommended,
  selectedPipelineId,
  currentPipelineId,
  currentPipelineName,
  onSelectPipeline,
}: {
  pipelines: PipelineDefinition[];
  recommended: PipelineDefinition[];
  selectedPipelineId: string;
  currentPipelineId: string | null;
  currentPipelineName: string | null;
  onSelectPipeline: (pipelineId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === selectedPipelineId) ?? null;
  const connectionState = selectedPipelineId
    ? selectedPipelineId === currentPipelineId ? 'current' : 'pending'
    : 'empty';
  const showTransition = Boolean(currentPipelineName) && connectionState === 'pending' && selectedPipeline;
  const showCurrentConnection = Boolean(currentPipelineName) && connectionState === 'empty';
  const keyword = query.trim().toLowerCase();
  const filteredRecommended = recommended.filter((pipeline) => pipelineMatchesSearch(pipeline, keyword));
  const recommendedIds = new Set(recommended.map((pipeline) => pipeline.id));
  const filteredPipelines = pipelines.filter((pipeline) => !recommendedIds.has(pipeline.id) && pipelineMatchesSearch(pipeline, keyword));
  const hasResults = filteredRecommended.length > 0 || filteredPipelines.length > 0;

  const selectPipeline = (pipelineId: string) => {
    onSelectPipeline(pipelineId);
    setQuery('');
    setOpen(false);
  };

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-foreground transition-colors',
          open && 'border-accent ring-1 ring-accent/35',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="mb-1 flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-muted-foreground">파이프라인 연결</span>
            {connectionState === 'pending' ? (
              <>
                <span className="rounded-full bg-accent/15 px-1.5 py-px text-[9px] font-semibold text-accent">현재 적용</span>
                <span className="text-[10px] text-muted-foreground">-&gt;</span>
                <span className="rounded-full bg-warning/15 px-1.5 py-px text-[9px] font-semibold text-warning">변경 예정</span>
              </>
            ) : (
              <span
                className={cn(
                  'rounded-full px-1.5 py-px text-[9px] font-semibold',
                  connectionState === 'current' && 'bg-accent/15 text-accent',
                  connectionState === 'empty' && 'bg-muted text-muted-foreground',
                )}
              >
                {connectionState === 'current' ? '현재 적용' : '미지정'}
              </span>
            )}
          </span>
          {showTransition ? (
            <span className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-semibold text-accent">{currentPipelineName}</span>
                <span className="mt-0.5 block text-[9px] text-muted-foreground">현재 적용</span>
              </span>
              <span className="hidden text-[11px] text-muted-foreground sm:block">-&gt;</span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-warning">{selectedPipeline.name}</span>
                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                  {selectedPipeline.satelliteId} · {selectedPipeline.mode}
                </span>
              </span>
            </span>
          ) : selectedPipeline ? (
            <>
              <span className="block truncate font-semibold">{selectedPipeline.name}</span>
              <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                {selectedPipeline.satelliteId} · {selectedPipeline.mode}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">파이프라인 선택</span>
          )}
          {showCurrentConnection && (
            <span className="mt-1 block truncate text-[10px] text-muted-foreground">
              현재 적용: <span className="font-semibold text-accent">{currentPipelineName}</span>
            </span>
          )}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-8 text-xs text-foreground outline-none focus:border-accent"
                placeholder="이름, 위성, 모드 검색"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  aria-label="검색어 지우기"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1" role="listbox">
            <button
              type="button"
              onClick={() => selectPipeline('')}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/35 hover:text-foreground"
            >
              <span className="h-4 w-4 rounded-full border border-border" />
              파이프라인 선택 해제
            </button>

            {filteredRecommended.length > 0 && (
              <div className="border-t border-border/70 pt-1">
                <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">추천</div>
                {filteredRecommended.map((pipeline) => (
                  <PipelineSearchOption
                    key={pipeline.id}
                    pipeline={pipeline}
                    selected={pipeline.id === selectedPipelineId}
                    onSelect={selectPipeline}
                  />
                ))}
              </div>
            )}

            {filteredPipelines.length > 0 && (
              <div className="border-t border-border/70 pt-1">
                <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">전체</div>
                {filteredPipelines.map((pipeline) => (
                  <PipelineSearchOption
                    key={pipeline.id}
                    pipeline={pipeline}
                    selected={pipeline.id === selectedPipelineId}
                    onSelect={selectPipeline}
                  />
                ))}
              </div>
            )}

            {!hasResults && (
              <div className="px-3 py-5 text-center text-xs text-muted-foreground">검색 결과가 없습니다</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfirmClearDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl">
        <h3 className="text-sm font-semibold text-foreground">파이프라인 연결 해제</h3>
        <p className="mt-2 text-sm text-muted-foreground">정말 해제하시겠습니까?</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/30">
            취소
          </button>
          <button type="button" onClick={onConfirm} className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white transition-colors hover:brightness-110">
            해제
          </button>
        </div>
      </div>
    </div>
  );
}

function MappingPanel({
  rawData,
  pipelines,
  selectedPipelineId,
  saving,
  executing,
  onSelectPipeline,
  onSave,
  onClear,
  onExecute,
  onClose,
}: {
  rawData: RawDataSummary;
  pipelines: PipelineDefinition[];
  selectedPipelineId: string;
  saving: boolean;
  executing: boolean;
  onSelectPipeline: (pipelineId: string) => void;
  onSave: () => void;
  onClear: () => void;
  onExecute: () => void;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const base = pathname.startsWith('/current') ? '/current' : '/plan';
  const selectablePipelines = pipelines.filter(isRawDataCompatiblePipeline);
  const recommended = selectablePipelines.filter((pipeline) => pipeline.satelliteId === rawData.satelliteId && pipeline.mode === rawData.mode);
  const activePipeline = selectablePipelines.find((pipeline) => pipeline.id === (selectedPipelineId || rawData.mappedPipelineId)) ?? null;

  return (
    <div className="h-full flex flex-col border-l border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Antenna className="h-4 w-4 shrink-0 text-accent" />
            <h2 className="truncate text-sm font-semibold text-foreground">{rawData.title}</h2>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{rawData.rawDataPath}</div>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-2">
          <DetailStat label="위성" value={rawData.satelliteId} />
          <DetailStat label="모드" value={rawData.mode} />
          <DetailStat label="편파" value={rawData.polarization} />
          <DetailStat label="상태" value={<RawDataStatusBadge status={rawData.status} />} />
          <DetailStat label="촬영 시각" value={formatKST(rawData.capturedAt)} />
          <DetailStat label="수신 시각" value={formatKST(rawData.receivedAt)} />
          <DetailStat label="좌표" value={`${rawData.latitude.toFixed(4)}, ${rawData.longitude.toFixed(4)}`} />
          <DetailStat label="원시 파일 크기" value={formatFileSize(rawData.fileSizeBytes)} />
        </div>

        <section className="mt-5 rounded-xl border border-border bg-background/50 p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" />
            Pipeline Mapping
          </div>

          <div className="mt-3">
            <PipelineSearchSelect
              pipelines={selectablePipelines}
              recommended={recommended}
              selectedPipelineId={selectedPipelineId}
              currentPipelineId={rawData.mappedPipelineId}
              currentPipelineName={rawData.mappedPipelineName ?? null}
              onSelectPipeline={onSelectPipeline}
            />
          </div>

          <div className="mt-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Workflow className="h-3.5 w-3.5" />
              Pipeline Flow
            </div>
            <PipelineMiniPreview pipeline={activePipeline} />
          </div>

        </section>

        <section className="mt-5 rounded-xl border border-border bg-background/50 p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Coverage
          </div>
          <RawDataCoverageMap rawData={rawData} />
        </section>
      </div>

      <div className="flex gap-2 border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!selectedPipelineId || selectedPipelineId === rawData.mappedPipelineId || saving}
          className={cn(
            'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            !selectedPipelineId || selectedPipelineId === rawData.mappedPipelineId || saving
              ? 'cursor-not-allowed bg-muted text-muted-foreground'
              : 'bg-accent text-background hover:bg-accent/90',
          )}
        >
          {saving ? '저장 중...' : '파이프라인 연결 저장'}
        </button>
        <button
          type="button"
          onClick={onExecute}
          disabled={saving || executing || !selectedPipelineId}
          className={cn(
            'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            saving || executing || !selectedPipelineId
              ? 'cursor-not-allowed bg-muted text-muted-foreground'
              : 'bg-accent/12 text-accent hover:bg-accent/18',
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <Play className="h-3.5 w-3.5" />
            {executing ? '실행 중...' : '연결 후 실행'}
          </span>
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!rawData.mappedPipelineId || saving}
          className={cn(
            'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
            !rawData.mappedPipelineId || saving
              ? 'cursor-not-allowed border-border text-muted-foreground/50'
              : 'border-border text-foreground hover:bg-muted/30',
          )}
        >
          연결 해제
        </button>
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

export default function RawDataPage() {
  const service = usePipelineService();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rawData, setRawData] = useState<RawDataSummary[]>([]);
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [selectedRawData, setSelectedRawData] = useState<RawDataSummary | null>(null);
  const [mappingPipelineId, setMappingPipelineId] = useState('');
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const [panelAnimating, setPanelAnimating] = useState(false);
  const [search, setSearch] = useState('');
  const [satelliteFilter, setSatelliteFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [mappingFilter, setMappingFilter] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const panelItemRef = useRef<RawDataSummary | null>(null);
  const basePath = pathname.startsWith('/current') ? '/current' : '/plan';

  const loadData = useCallback(async () => {
    const [rawRes, pipelineRes] = await Promise.all([
      service.원시데이터_목록을_조회한다({ limit: 200 }),
      service.파이프라인_목록을_조회한다(),
    ]);
    if (rawRes.data) setRawData(rawRes.data.items);
    if (pipelineRes.data) setPipelines(pipelineRes.data);
  }, [service]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setMappingPipelineId(selectedRawData?.mappedPipelineId ?? '');
  }, [selectedRawData]);

  const filteredRawData = useMemo(() => {
    return rawData.filter((item) => {
      const matchesSearch = search.trim() === '' || item.title.toLowerCase().includes(search.toLowerCase()) || item.rawDataPath.toLowerCase().includes(search.toLowerCase());
      const matchesSatellite = satelliteFilter === '' || item.satelliteId === satelliteFilter;
      const matchesMode = modeFilter === '' || item.mode === modeFilter;
      const matchesMapping = mappingFilter === 'all' || (mappingFilter === 'mapped' ? !!item.mappedPipelineId : !item.mappedPipelineId);
      return matchesSearch && matchesSatellite && matchesMode && matchesMapping;
    });
  }, [mappingFilter, modeFilter, rawData, satelliteFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRawData.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = filteredRawData.slice(pageStart, pageStart + pageSize);
  const mappedCount = rawData.filter((item) => !!item.mappedPipelineId).length;
  const unmappedCount = rawData.filter((item) => !item.mappedPipelineId).length;
  const readyCount = rawData.filter((item) => item.status === 'READY').length;

  function openPanel(item: RawDataSummary) {
    panelItemRef.current = item;
    setSelectedRawData(item);
    setPanelMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPanelAnimating(true));
    });
  }

  function closePanel() {
    setPanelAnimating(false);
    setTimeout(() => {
      setPanelMounted(false);
      setSelectedRawData(null);
      panelItemRef.current = null;
    }, 180);
  }

  async function handleSaveMapping() {
    if (!selectedRawData || !mappingPipelineId) return;
    setSaving(true);
    const res = await service.원시데이터_파이프라인을_매핑한다(selectedRawData.id, mappingPipelineId);
    setSaving(false);
    if (!res.success || !res.data) {
      toast.error(res.message);
      return;
    }
    setRawData((prev) => prev.map((item) => item.id === res.data?.id ? res.data : item));
    setSelectedRawData(res.data);
    toast.success(res.message);
  }

  async function handleExecutePipeline() {
    if (!selectedRawData || !mappingPipelineId || executing) return;
    setExecuting(true);

    let targetPipelineId = mappingPipelineId;
    if (selectedRawData.mappedPipelineId !== mappingPipelineId) {
      setSaving(true);
      const saveRes = await service.원시데이터_파이프라인을_매핑한다(selectedRawData.id, mappingPipelineId);
      setSaving(false);
      if (!saveRes.success || !saveRes.data) {
        setExecuting(false);
        toast.error(saveRes.message);
        return;
      }
      setRawData((prev) => prev.map((item) => item.id === saveRes.data?.id ? saveRes.data : item));
      setSelectedRawData(saveRes.data);
      targetPipelineId = saveRes.data.mappedPipelineId ?? mappingPipelineId;
      toast.success('파이프라인 연결을 저장했습니다');
    }

    const execRes = await service.파이프라인을_실행한다(targetPipelineId);
    if (!execRes.success || !execRes.data) {
      setExecuting(false);
      toast.error(execRes.message);
      return;
    }
    setExecuting(false);
    const jobId = execRes.data.jobId;
    toast.custom((toastId) => (
      <div className="w-[360px] rounded-lg border border-success/40 bg-card text-foreground shadow-xl">
        <div className="flex items-start gap-2 px-3 py-2.5">
          <span className="mt-0.5 rounded-md bg-success/10 p-1 text-success">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-foreground">{jobId} 실행이 시작되었습니다</div>
            <div className="mt-2 border-t border-border pt-2">
              <button
                type="button"
                onClick={() => {
                  toast.dismiss(toastId);
                  router.push(`${basePath}/jobs?jobId=${encodeURIComponent(jobId)}`);
                }}
                className="inline-flex w-full items-center justify-center rounded-md bg-accent px-3 py-2 text-[11px] font-medium text-background transition-colors hover:bg-accent/90"
              >
                현재 실행중인 파이프라인 보기
              </button>
            </div>
          </div>
        </div>
      </div>
    ), { duration: 6000 });
  }

  async function handleClearMapping() {
    if (!selectedRawData) return;
    setSaving(true);
    const res = await service.원시데이터_파이프라인을_매핑한다(selectedRawData.id, null);
    setSaving(false);
    if (!res.success || !res.data) {
      toast.error(res.message);
      return;
    }
    setRawData((prev) => prev.map((item) => item.id === res.data?.id ? res.data : item));
    setSelectedRawData(res.data);
    setClearDialogOpen(false);
    toast.success(res.message);
  }

  return (
    <div className="h-full flex">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        activePage="raw-data"
      />

      <div className="relative flex-1 overflow-hidden">
        <div className="flex h-full overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
          <header className="border-b border-border bg-card px-6 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                  <RadioTower className="h-3.5 w-3.5" />
                  Reception Intake
                </div>
                <h1 className="text-xl font-bold text-foreground">Raw Data 목록</h1>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryCard label="수신 원시 데이터" value={rawData.length} icon={Database} />
                <SummaryCard label="매핑 완료" value={mappedCount} icon={Link2} />
                <SummaryCard label="미매핑" value={unmappedCount} icon={Unlink2} />
                <SummaryCard label="준비 완료" value={readyCount} icon={CheckCircle2} />
              </div>
            </div>
          </header>

          <div className="border-b border-border bg-card px-6 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Raw data title / path 검색"
                  className="w-72 rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <select
                value={satelliteFilter}
                onChange={(e) => {
                  setSatelliteFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">전체 위성</option>
                {SATELLITES.map((satellite) => (
                  <option key={satellite} value={satellite}>{satellite}</option>
                ))}
              </select>
              <select
                value={modeFilter}
                onChange={(e) => {
                  setModeFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">전체 모드</option>
                {MODES.map((mode) => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
              <select
                value={mappingFilter}
                onChange={(e) => {
                  setMappingFilter(e.target.value as 'all' | 'mapped' | 'unmapped');
                  setPage(1);
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="all">전체 매핑 상태</option>
                <option value="mapped">매핑됨</option>
                <option value="unmapped">미매핑</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-background">
            <table className="w-full min-w-[1220px]">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-6 py-3 text-left whitespace-nowrap">Raw Data</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">위성 / 모드</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">촬영 시각</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">위도</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">경도</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">원시 파일</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">연결 파이프라인</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">상태</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => openPanel(item)}
                    className={cn(
                      'cursor-pointer border-b border-border/60 transition-colors',
                      selectedRawData?.id === item.id ? 'bg-accent/5' : 'hover:bg-muted/20',
                    )}
                  >
                    <td className="px-6 py-3 whitespace-nowrap">
                      <div className="max-w-[340px] truncate font-mono text-xs font-semibold text-foreground">{item.title}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{formatRelativeTime(item.receivedAt)} 수신</div>
                    </td>
                    <td className="px-3 py-3 text-xs text-foreground whitespace-nowrap">
                      <div>{item.satelliteId}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{item.mode} · {item.polarization}</div>
                    </td>
                    <td className="px-3 py-3 text-xs text-foreground whitespace-nowrap">{formatKST(item.capturedAt)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-foreground whitespace-nowrap">{item.latitude.toFixed(4)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-foreground whitespace-nowrap">{item.longitude.toFixed(4)}</td>
                    <td className="px-3 py-3 text-xs text-foreground whitespace-nowrap">
                      <div>{formatFileSize(item.fileSizeBytes)}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{item.footprintKm.toFixed(1)} km footprint</div>
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      {item.mappedPipelineName ? (
                        <div className="max-w-[240px] truncate font-semibold text-accent">{item.mappedPipelineName}</div>
                      ) : (
                        <span className="font-semibold text-muted-foreground">미지정</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      <RawDataStatusBadge status={item.status} />
                    </td>
                  </tr>
                ))}
                {pageItems.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center text-sm text-muted-foreground">
                      조건에 맞는 raw data가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-6 py-3">
            <div className="text-[11px] text-muted-foreground">
              {filteredRawData.length === 0 ? '0 / 0' : `${pageStart + 1}-${Math.min(pageStart + pageSize, filteredRawData.length)} / ${filteredRawData.length}`}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                  setPage(1);
                }}
                className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size}개씩</option>
                ))}
              </select>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-30"
              >
                이전
              </button>
              <span className="min-w-14 text-center text-[11px] font-mono text-foreground">{currentPage}/{totalPages}</span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-30"
              >
                다음
              </button>
            </div>
          </div>
          </div>
        </div>

        {panelMounted && selectedRawData && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-20">
            <div
              className={cn(
                'pointer-events-auto h-full w-[840px] overflow-hidden border-l border-border bg-card shadow-2xl transition-all duration-200 ease-out',
                panelAnimating ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0',
              )}
            >
              <MappingPanel
                rawData={selectedRawData}
                pipelines={pipelines}
                selectedPipelineId={mappingPipelineId}
                saving={saving}
                executing={executing}
                onSelectPipeline={setMappingPipelineId}
                onSave={handleSaveMapping}
                onClear={() => setClearDialogOpen(true)}
                onExecute={handleExecutePipeline}
                onClose={closePanel}
              />
            </div>
          </div>
        )}
        <ConfirmClearDialog
          open={clearDialogOpen}
          onConfirm={handleClearMapping}
          onCancel={() => setClearDialogOpen(false)}
        />
        <style jsx global>{`
          .raw-preview-flow .react-flow__controls,
          .raw-preview-flow .react-flow__minimap {
            display: none !important;
          }
          .raw-coverage-map .ol-viewport {
            border-radius: 0.75rem 0.75rem 0 0;
          }
          .raw-coverage-map .ol-control button {
            background: var(--card);
            color: var(--foreground);
            border: 1px solid var(--border);
          }
          .raw-coverage-map .ol-control button:hover,
          .raw-coverage-map .ol-control button:focus {
            background: var(--muted);
          }
        `}</style>
      </div>
    </div>
  );
}
