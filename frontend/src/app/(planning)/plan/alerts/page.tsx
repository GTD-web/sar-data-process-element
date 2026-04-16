'use client';

import { PipelineServiceProvider } from '@/app/(planning)/_context/pipeline-service-context';
import { pipelineMockService } from '@/app/(planning)/_services/pipeline.mock.service';
import AlertsPage from '@/app/(planning)/_ui/AlertsPage';

export default function PlanAlertsPage() {
  return (
    <PipelineServiceProvider service={pipelineMockService}>
      <AlertsPage />
    </PipelineServiceProvider>
  );
}
