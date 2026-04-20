import { Suspense } from 'react';
import ArchivePage from '@/app/(planning)/plan/archive/ArchivePage';

export default function Page() {
  return (
    <Suspense>
      <ArchivePage />
    </Suspense>
  );
}
