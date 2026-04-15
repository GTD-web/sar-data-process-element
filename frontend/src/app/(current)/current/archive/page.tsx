'use client';

import { Suspense } from 'react';
import { PipelineServiceProvider } from '@/app/(planning)/_context/pipeline-service-context';
import { pipelineCurrentService } from '@/app/(current)/_services/pipeline.current.service';
import ArchivePage from '@/app/(planning)/_ui/ArchivePage';

export default function CurrentArchivePage() {
  return (
    <PipelineServiceProvider service={pipelineCurrentService}>
      <Suspense>
        <ArchivePage />
      </Suspense>
    </PipelineServiceProvider>
  );
}
