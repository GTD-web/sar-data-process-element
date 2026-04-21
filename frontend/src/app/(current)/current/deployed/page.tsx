import { Suspense } from 'react';
import PipelineExecutionManagementPage from '@/app/(planning)/plan/deployed/PipelineExecutionManagementPage';

export default function Page() {
  return (
    <Suspense>
      <PipelineExecutionManagementPage />
    </Suspense>
  );
}
