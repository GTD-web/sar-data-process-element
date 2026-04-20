import { Suspense } from 'react';
import JobsPage from './JobsPage';

export default function Page() {
  return (
    <Suspense>
      <JobsPage />
    </Suspense>
  );
}
