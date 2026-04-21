import { Suspense } from 'react';
import PipelineExecutionManagementPage from './PipelineExecutionManagementPage';

export default function Page() {
  return (
    <Suspense>
      <PipelineExecutionManagementPage />
    </Suspense>
  );
}
