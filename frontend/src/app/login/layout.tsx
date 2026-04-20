'use client';

import { PipelineServiceProvider } from '@/app/(planning)/_context/pipeline-service-context';
import { pipelineMockService } from '@/app/(planning)/_services/pipeline.mock.service';

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <PipelineServiceProvider service={pipelineMockService}>{children}</PipelineServiceProvider>;
}
