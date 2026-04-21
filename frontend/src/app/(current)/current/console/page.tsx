import { Suspense } from 'react';
import PipelineManagementPage from '@/app/(planning)/plan/console/PipelineManagementPage';

export default function Page() {
  return (
    <Suspense>
      <PipelineManagementPage />
    </Suspense>
  );
}
