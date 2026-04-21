'use client';

import { useSearchParams } from 'next/navigation';
import JobsPage from '@/app/(planning)/plan/jobs/JobsPage';
import DeployedPipelinesPage from './DeployedPipelinesPage';

export default function PipelineExecutionManagementPage() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');

  if (tab === 'manual') return <JobsPage />;
  return <DeployedPipelinesPage />;
}
