'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import LeftSidebar from '@/components/panels/LeftSidebar';
import PipelineManagementTabs from '@/components/panels/PipelineManagementTabs';
import { useMockRole } from '@/components/auth/RolePreviewSelect';
import { toast } from '@/components/ui/Toast';
import { ArchiveRestore, Archive, X } from 'lucide-react';
import type { PipelineDefinition, PipelineStep } from '@/types/pipeline';
import { SAR_STAGE_TO_CSC, SAR_STAGE_TO_LEVEL } from '@/types/pipeline';

const CanvasGraph = dynamic(() => import('@/components/graph/CanvasGraph'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-background text-muted-foreground text-sm">
      그래프 로딩 중...
    </div>
  ),
});

function formatArchiveDate(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function RestorePipelineConfirmDialog({
  pipeline,
  onConfirm,
  onCancel,
}: {
  pipeline: PipelineDefinition;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <ArchiveRestore className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">파이프라인 복원</h2>
          </div>
          <button type="button" onClick={onCancel} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            아카이브에서 운영 파이프라인 목록으로 되돌립니다. 복원 후에는 콘솔에서 별도로 배포해야 운영 이벤트에 연결됩니다.
          </p>
          <div className="bg-muted/30 rounded-lg px-3 py-2.5 space-y-1">
            <div className="flex justify-between gap-3 text-[11px]">
              <span className="text-muted-foreground">이름</span>
              <span className="font-semibold text-foreground text-right">{pipeline.name}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">대상</span>
              <span className="font-mono text-foreground">{pipeline.satelliteId} · {pipeline.mode}</span>
            </div>
            <div className="flex justify-between gap-3 text-[11px]">
              <span className="text-muted-foreground">폐기일</span>
              <span className="font-mono text-foreground text-right">{formatArchiveDate(pipeline.archivedAt)}</span>
            </div>
          </div>
          <div className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2.5">
            <div className="text-[10px] font-semibold text-warning mb-1">폐기 사유</div>
            <p className="text-[11px] leading-relaxed text-foreground">
              {pipeline.archiveReason ?? '폐기 사유가 기록되지 않았습니다.'}
            </p>
          </div>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:brightness-110 transition-colors"
          >
            복원 확인
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ArchivePage() {
  const service = usePipelineService();

  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [previewRole] = useMockRole();
  const [restoreTarget, setRestoreTarget] = useState<PipelineDefinition | null>(null);

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) ?? null;
  const canManage = previewRole === 'Administrator';

  useEffect(() => {
    (async () => {
      const plRes = await service.아카이브_파이프라인_목록을_조회한다();
      if (plRes.data) {
        setPipelines(plRes.data);
        if (plRes.data.length > 0) setSelectedPipelineId(plRes.data[0]!.id);
      }
    })();
  }, [service]);

  const graphSteps: PipelineStep[] = selectedPipeline
    ? selectedPipeline.steps.map((s) => ({
        order: s.order,
        kind: s.kind,
        sarStage: s.sarStage,
        inputLevel: s.inputLevel,
        parentOrder: s.parentOrder,
        targetCsc: s.kind === 'SAR' && s.sarStage ? SAR_STAGE_TO_CSC[s.sarStage] : s.kind === 'JOB_INIT' ? 'CSC-08' : s.kind === 'CATALOG' ? 'CSC-07' : 'CSC-02',
        productLevel: s.kind === 'SAR' && s.sarStage ? SAR_STAGE_TO_LEVEL[s.sarStage] : 'LEVEL_0',
        status: 'PENDING',
        enabledTasks: s.enabledTasks,
      }))
    : [];

  const graphEdges = selectedPipeline?.edges ?? [];

  const handleRestoreConfirm = useCallback(async () => {
    if (!canManage) return;
    if (!restoreTarget) return;
    const restoringId = restoreTarget.id;
    const res = await service.파이프라인을_아카이브한다(restoringId, false);
    if (res.success) {
      setPipelines((prev) => {
        const next = prev.filter((p) => p.id !== restoringId);
        if (next.length > 0) setSelectedPipelineId(next[0]!.id);
        else setSelectedPipelineId(null);
        return next;
      });
      setRestoreTarget(null);
      toast.success('파이프라인이 복원되었습니다');
    } else {
      toast.error(res.message);
    }
  }, [restoreTarget, service, canManage]);

  return (
    <div className="h-full flex overflow-hidden">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        activePage="console"
        archivePipelines={pipelines}
        selectedArchiveId={selectedPipelineId}
        onSelectArchive={setSelectedPipelineId}
      />

      {/* Center: Canvas (read-only) */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border px-5 py-2.5 shrink-0">
          <PipelineManagementTabs active="archive" counts={{ archive: pipelines.length }} />
        </div>
        {graphSteps.length > 0 && selectedPipeline ? (
          <div className="flex-1 relative overflow-hidden">
            <CanvasGraph
              pipelineId={selectedPipelineId}
              steps={graphSteps}
              pipelineEdges={graphEdges}
              editable={false}
              onNodeClick={() => {}}
            />
            {/* Pipeline name badge */}
            <div className="absolute top-3 left-3 z-10">
              <div className="px-3 py-1.5 rounded-md bg-card/80 backdrop-blur-sm border border-border shadow-sm text-xs">
                <span className="text-muted-foreground">아카이브: </span>
                <span className="font-semibold text-foreground">{selectedPipeline.name}</span>
              </div>
            </div>
            {/* Archive reason */}
            <div className="absolute top-3 right-3 z-10 w-[min(360px,calc(100%-1.5rem))]">
              <div className="rounded-lg bg-card/90 backdrop-blur-sm border border-border shadow-lg overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">폐기 사유</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{formatArchiveDate(selectedPipeline.archivedAt)}</span>
                </div>
                <p className="px-3 py-2.5 text-[11px] leading-relaxed text-foreground">
                  {selectedPipeline.archiveReason ?? '폐기 사유가 기록되지 않았습니다.'}
                </p>
              </div>
            </div>
            {/* Restore button */}
            {canManage && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                <button
                  type="button"
                  onClick={() => setRestoreTarget(selectedPipeline)}
                  className="pointer-events-auto flex items-center gap-2 pl-2.5 pr-3.5 py-2 rounded-lg
                             text-[11px] font-semibold shadow-lg whitespace-nowrap
                             bg-accent text-accent-foreground
                             hover:brightness-110 active:brightness-95 transition-all"
                >
                  <ArchiveRestore className="w-3.5 h-3.5" />
                  파이프라인 복원
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 relative flex items-center justify-center bg-background">
            <div className="text-center text-muted-foreground">
              <Archive className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm">아카이브된 파이프라인이 없습니다</p>
            </div>
          </div>
        )}
      </div>

      {restoreTarget && (
        <RestorePipelineConfirmDialog
          pipeline={restoreTarget}
          onConfirm={handleRestoreConfirm}
          onCancel={() => setRestoreTarget(null)}
        />
      )}
    </div>
  );
}
