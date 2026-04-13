'use client';

import { PipelineServiceProvider } from '@/app/(planning)/_context/pipeline-service-context';
import { pipelineCurrentService } from '@/app/(current)/_services/pipeline.current.service';
import ConsolePage from '@/app/(planning)/_ui/ConsolePage';

export default function CurrentPage() {
  return (
    <PipelineServiceProvider service={pipelineCurrentService}>
      <ConsolePage />
    </PipelineServiceProvider>
  );
}
