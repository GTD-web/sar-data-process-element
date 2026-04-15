'use client';

import { Suspense } from 'react';
import { PipelineServiceProvider } from '@/app/(planning)/_context/pipeline-service-context';
import { pipelineMockService } from '@/app/(planning)/_services/pipeline.mock.service';
import ConsolePage from '@/app/(planning)/_ui/ConsolePage';

export default function PlanConsolePage() {
  return (
    <PipelineServiceProvider service={pipelineMockService}>
      <Suspense>
        <ConsolePage />
      </Suspense>
    </PipelineServiceProvider>
  );
}
