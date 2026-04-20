import { Suspense } from 'react';
import ConsolePage from '@/app/(planning)/plan/console/ConsolePage';

export default function Page() {
  return (
    <Suspense>
      <ConsolePage />
    </Suspense>
  );
}
