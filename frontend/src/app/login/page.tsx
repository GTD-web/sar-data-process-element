import { Suspense } from 'react';
import LoginPage from './LoginPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}
