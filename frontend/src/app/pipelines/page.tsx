'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePipelineService } from '@/services/usePipelineService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { PipelineDefinition } from '@/types/pipeline';
import { CSC_LABELS } from '@/types/pipeline';
import { GitBranch, ChevronRight } from 'lucide-react';

export default function PipelinesPage() {
  const service = usePipelineService();
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    service.파이프라인_목록을_조회한다().then((res) => {
      if (res.data) setPipelines(res.data);
      setLoading(false);
    });
  }, [service]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">파이프라인 정의</h1>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 bg-card border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pipelines.map((pl) => (
            <Link key={pl.id} href={`/pipelines/${pl.id}`}>
              <Card className="hover:border-accent/50 transition-colors cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between py-2.5">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-accent" />
                    <CardTitle>{pl.name}</CardTitle>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>위성: {pl.satelliteId}</span>
                    <span>모드: {pl.mode}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {pl.steps.map((step) => (
                      <span
                        key={step.order}
                        className="px-2 py-0.5 rounded bg-muted/50 text-[11px] text-muted-foreground font-mono"
                      >
                        {step.targetCsc}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
