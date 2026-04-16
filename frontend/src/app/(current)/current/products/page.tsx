'use client';

import { PipelineServiceProvider } from '@/app/(planning)/_context/pipeline-service-context';
import { pipelineCurrentService } from '@/app/(current)/_services/pipeline.current.service';
import ProductsPage from '@/app/(planning)/_ui/ProductsPage';

export default function CurrentProductsPage() {
  return (
    <PipelineServiceProvider service={pipelineCurrentService}>
      <ProductsPage />
    </PipelineServiceProvider>
  );
}
