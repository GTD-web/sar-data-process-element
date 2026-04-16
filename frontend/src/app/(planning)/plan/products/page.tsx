'use client';

import { PipelineServiceProvider } from '@/app/(planning)/_context/pipeline-service-context';
import { pipelineMockService } from '@/app/(planning)/_services/pipeline.mock.service';
import ProductsPage from '@/app/(planning)/_ui/ProductsPage';

export default function PlanProductsPage() {
  return (
    <PipelineServiceProvider service={pipelineMockService}>
      <ProductsPage />
    </PipelineServiceProvider>
  );
}
