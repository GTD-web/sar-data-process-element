/**
 * Pipeline Mock Service (Planning 환경)
 *
 * Mock 데이터를 래핑하여 Interface 구현.
 */

import { mockPipelineService } from './pipeline.mock';
import type { IPipelineUIService } from '@/services/pipeline.service.interface';

export const pipelineMockService: IPipelineUIService = mockPipelineService;
