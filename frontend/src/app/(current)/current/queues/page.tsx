'use client';

import { PipelineServiceProvider } from '@/app/(planning)/_context/pipeline-service-context';
import { pipelineCurrentService } from '@/app/(current)/_services/pipeline.current.service';
import QueueDashboardPage from '@/app/(planning)/_ui/QueueDashboardPage';

export default function CurrentQueuesPage() {
  return (
    <PipelineServiceProvider service={pipelineCurrentService}>
      <QueueDashboardPage />
    </PipelineServiceProvider>
  );
}
