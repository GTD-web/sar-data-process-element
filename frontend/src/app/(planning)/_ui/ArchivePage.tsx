'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import LeftSidebar from '@/components/panels/LeftSidebar';
import Toast, { type ToastMessage } from '@/components/ui/Toast';
import { ArchiveRestore, Archive } from 'lucide-react';
import type { PipelineDefinition, PipelineStep, JobSummary } from '@/types/pipeline';
import { SAR_STAGE_TO_CSC, SAR_STAGE_TO_LEVEL } from '@/types/pipeline';

const CanvasGraph = dynamic(() => import('@/components/graph/CanvasGraph'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-background text-muted-foreground text-sm">
      그래프 로딩 중...
    </div>
  ),
});

export default function ArchivePage() {
  const service = usePipelineService();

  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) ?? null;

  useEffect(() => {
    (async () => {
      const [plRes, jRes] = await Promise.all([
        service.아카이브_파이프라인_목록을_조회한다(),
        service.Job_목록을_조회한다({ limit: 20 }),
      ]);
      if (plRes.data) {
        setPipelines(plRes.data);
        if (plRes.data.length > 0) setSelectedPipelineId(plRes.data[0]!.id);
      }
      if (jRes.data) setJobs(jRes.data.items);
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

  const handleRestore = useCallback(async () => {
    if (!selectedPipelineId) return;
    const res = await service.파이프라인을_아카이브한다(selectedPipelineId, false);
    if (res.success) {
      setPipelines((prev) => {
        const next = prev.filter((p) => p.id !== selectedPipelineId);
        if (next.length > 0) setSelectedPipelineId(next[0]!.id);
        else setSelectedPipelineId(null);
        return next;
      });
      setToast({ type: 'success', message: '파이프라인이 복원되었습니다' });
    }
  }, [selectedPipelineId, service]);

  return (
    <div className="h-full flex overflow-hidden">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        activePage="archive"
        jobs={jobs}
        archivePipelines={pipelines}
        selectedArchiveId={selectedPipelineId}
        onSelectArchive={setSelectedPipelineId}
      />

      {/* Center: Canvas (read-only) */}
      <div className="flex-1 flex flex-col overflow-hidden">
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
            {/* Restore button */}
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <button
                type="button"
                onClick={handleRestore}
                className="pointer-events-auto flex items-center gap-2 pl-2.5 pr-3.5 py-2 rounded-lg
                           text-[11px] font-semibold shadow-lg whitespace-nowrap
                           bg-accent text-accent-foreground
                           hover:brightness-110 active:brightness-95 transition-all"
              >
                <ArchiveRestore className="w-3.5 h-3.5" />
                파이프라인 복원
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-background">
            <div className="text-center text-muted-foreground">
              <Archive className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm">아카이브된 파이프라인이 없습니다</p>
            </div>
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
