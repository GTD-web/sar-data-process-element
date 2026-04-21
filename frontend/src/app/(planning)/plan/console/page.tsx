import { Suspense } from 'react';
import PipelineManagementPage from './PipelineManagementPage';

export default function Page() {
  return (
    <Suspense>
      <PipelineManagementPage />
    </Suspense>
  );
}
