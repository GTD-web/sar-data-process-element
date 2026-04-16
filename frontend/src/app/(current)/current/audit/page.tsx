'use client';

import { PipelineServiceProvider } from '@/app/(planning)/_context/pipeline-service-context';
import { pipelineCurrentService } from '@/app/(current)/_services/pipeline.current.service';
import AuditPage from '@/app/(planning)/_ui/AuditPage';

export default function CurrentAuditPage() {
  return (
    <PipelineServiceProvider service={pipelineCurrentService}>
      <AuditPage />
    </PipelineServiceProvider>
  );
}
