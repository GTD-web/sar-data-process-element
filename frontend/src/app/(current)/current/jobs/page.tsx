import { Suspense } from 'react';
import JobsPage from '@/app/(planning)/plan/jobs/JobsPage';

export default function Page() {
  return (
    <Suspense>
      <JobsPage />
    </Suspense>
  );
}
