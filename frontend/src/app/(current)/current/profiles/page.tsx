'use client';

import { PipelineServiceProvider } from '@/app/(planning)/_context/pipeline-service-context';
import { pipelineCurrentService } from '@/app/(current)/_services/pipeline.current.service';
import ProcessingProfilesPage from '@/app/(planning)/_ui/ProcessingProfilesPage';

export default function CurrentProfilesPage() {
  return (
    <PipelineServiceProvider service={pipelineCurrentService}>
      <ProcessingProfilesPage />
    </PipelineServiceProvider>
  );
}
