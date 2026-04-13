/**
 * Pipeline Mock Service (Plan 환경)
 *
 * Mock 데이터를 래핑하여 Interface 구현.
 * 추후 pipeline.current.service.v1.ts 로 실제 API 연동.
 */

import { mockPipelineService } from './pipeline.mock';
import type { IPipelineUIService } from './pipeline.service.interface';

export const pipelineMockService: IPipelineUIService = mockPipelineService;
