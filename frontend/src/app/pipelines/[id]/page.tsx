'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePipelineService } from '@/services/usePipelineService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { PipelineDefinition, PipelineStep } from '@/types/pipeline';
import { CSC_LABELS, PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { ArrowLeft } from 'lucide-react';

const PipelineGraph = dynamic(() => import('@/components/graph/PipelineGraph'), {
  ssr: false,
  loading: () => (
    <div className="h-[350px] bg-card rounded-lg border border-border flex items-center justify-center text-muted-foreground text-sm">
      그래프 로딩 중...
    </div>
  ),
});

export default function PipelineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const service = usePipelineService();
  const [pipeline, setPipeline] = useState<PipelineDefinition | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    service.파이프라인_목록을_조회한다().then((res) => {
      if (res.data) {
        const found = res.data.find((p) => p.id === id);
        setPipeline(found ?? null);
      }
      setLoading(false);
    });
  }, [service, id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 bg-muted rounded animate-pulse" />
        <div className="h-[350px] bg-card border border-border rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <p className="text-muted-foreground">파이프라인을 찾을 수 없습니다</p>
        <Link href="/pipelines" className="text-accent text-sm hover:underline">
          파이프라인 목록으로
        </Link>
      </div>
    );
  }

  const mockSteps: PipelineStep[] = pipeline.steps.map((s) => ({
    order: s.order,
    targetCsc: s.targetCsc,
    productLevel: s.productLevel,
    status: 'PENDING',
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/pipelines" className="p-1.5 rounded-md hover:bg-muted/50 transition-colors">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold">{pipeline.name}</h1>
          <div className="text-xs text-muted-foreground">
            {pipeline.satelliteId} · {pipeline.mode} · {pipeline.steps.length}단계
          </div>
        </div>
      </div>

      <PipelineGraph steps={mockSteps} />

      <Card>
        <CardHeader>
          <CardTitle>단계 구성</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {pipeline.steps.map((step) => (
              <div key={step.order} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-mono text-muted-foreground">
                    {step.order}
                  </span>
                  <div>
                    <div className="text-sm font-medium">{step.targetCsc}</div>
                    <div className="text-xs text-muted-foreground">{CSC_LABELS[step.targetCsc]}</div>
                  </div>
                </div>
                <span className="text-xs font-mono text-muted-foreground">
                  {PRODUCT_LEVEL_LABELS[step.productLevel]}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
