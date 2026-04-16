'use client';

import { PipelineServiceProvider } from '@/app/(planning)/_context/pipeline-service-context';
import { pipelineMockService } from '@/app/(planning)/_services/pipeline.mock.service';
import AuditPage from '@/app/(planning)/_ui/AuditPage';

export default function PlanAuditPage() {
  return (
    <PipelineServiceProvider service={pipelineMockService}>
      <AuditPage />
    </PipelineServiceProvider>
  );
}
