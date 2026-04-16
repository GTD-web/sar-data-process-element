'use client';

import { PipelineServiceProvider } from '@/app/(planning)/_context/pipeline-service-context';
import { pipelineMockService } from '@/app/(planning)/_services/pipeline.mock.service';
import ProcessingProfilesPage from '@/app/(planning)/_ui/ProcessingProfilesPage';

export default function PlanProfilesPage() {
  return (
    <PipelineServiceProvider service={pipelineMockService}>
      <ProcessingProfilesPage />
    </PipelineServiceProvider>
  );
}
