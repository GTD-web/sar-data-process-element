'use client';

import { PipelineServiceProvider } from '@/app/(planning)/_context/pipeline-service-context';
import { pipelineCurrentService } from '@/app/(current)/_services/pipeline.current.service';
import AlertsPage from '@/app/(planning)/_ui/AlertsPage';

export default function CurrentAlertsPage() {
  return (
    <PipelineServiceProvider service={pipelineCurrentService}>
      <AlertsPage />
    </PipelineServiceProvider>
  );
}
