'use client';

import { PipelineServiceProvider } from '@/app/(planning)/_context/pipeline-service-context';
import { pipelineCurrentService } from '@/app/(current)/_services/pipeline.current.service';

export default function CurrentLayout({ children }: { children: React.ReactNode }) {
  return <PipelineServiceProvider service={pipelineCurrentService}>{children}</PipelineServiceProvider>;
}
