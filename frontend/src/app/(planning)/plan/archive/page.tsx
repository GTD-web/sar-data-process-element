import { Suspense } from 'react';
import ArchivePage from './ArchivePage';

export default function Page() {
  return (
    <Suspense>
      <ArchivePage />
    </Suspense>
  );
}
