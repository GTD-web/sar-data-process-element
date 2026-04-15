'use client';

import { PipelineServiceProvider } from '@/app/(planning)/_context/pipeline-service-context';
import { pipelineMockService } from '@/app/(planning)/_services/pipeline.mock.service';
import QueueDashboardPage from '@/app/(planning)/_ui/QueueDashboardPage';

export default function PlanQueuesPage() {
  return (
    <PipelineServiceProvider service={pipelineMockService}>
      <QueueDashboardPage />
    </PipelineServiceProvider>
  );
}
