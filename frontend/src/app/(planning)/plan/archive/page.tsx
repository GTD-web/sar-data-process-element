'use client';

import { Suspense } from 'react';
import { PipelineServiceProvider } from '@/app/(planning)/_context/pipeline-service-context';
import { pipelineMockService } from '@/app/(planning)/_services/pipeline.mock.service';
import ArchivePage from '@/app/(planning)/_ui/ArchivePage';

export default function PlanArchivePage() {
  return (
    <PipelineServiceProvider service={pipelineMockService}>
      <Suspense>
        <ArchivePage />
      </Suspense>
    </PipelineServiceProvider>
  );
}
