import { Suspense } from 'react';
import ConsolePage from './ConsolePage';

export default function Page() {
  return (
    <Suspense>
      <ConsolePage />
    </Suspense>
  );
}
