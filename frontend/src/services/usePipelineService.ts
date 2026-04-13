'use client';

/**
 * Pipeline 서비스 훅
 *
 * 현재는 Mock 서비스만 반환.
 * 추후 환경 분기 (mock / current) 전환용 훅.
 */

import { useMemo } from 'react';
import type { IPipelineUIService } from './pipeline.service.interface';
import { pipelineMockService } from './pipeline.mock.service';

export function usePipelineService(): IPipelineUIService {
  return useMemo(() => pipelineMockService, []);
}
