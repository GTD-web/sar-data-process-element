'use client';

import { useSearchParams } from 'next/navigation';
import ArchivePage from '@/app/(planning)/plan/archive/ArchivePage';
import ProcessingProfilesPage from '@/app/(planning)/plan/profiles/ProcessingProfilesPage';
import ConsolePage from './ConsolePage';

export default function PipelineManagementPage() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');

  if (tab === 'profiles') return <ProcessingProfilesPage />;
  if (tab === 'archive') return <ArchivePage />;
  return <ConsolePage />;
}
