'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { IPipelineUIService } from '@/services/pipeline.service.interface';

const PipelineServiceContext = createContext<IPipelineUIService | null>(null);

export function PipelineServiceProvider({
  children,
  service,
}: {
  children: ReactNode;
  service: IPipelineUIService;
}) {
  return <PipelineServiceContext.Provider value={service}>{children}</PipelineServiceContext.Provider>;
}

export function usePipelineService(): IPipelineUIService {
  const ctx = useContext(PipelineServiceContext);
  if (!ctx) {
    throw new Error('usePipelineService must be used within a PipelineServiceProvider');
  }
  return ctx;
}
