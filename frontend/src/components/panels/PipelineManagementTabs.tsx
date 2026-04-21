'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Archive, GitBranch, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

type PipelineManagementTab = 'pipelines' | 'profiles' | 'archive';

const tabs: { id: PipelineManagementTab; label: string; icon: React.ElementType; query?: string }[] = [
  { id: 'pipelines', label: '파이프라인', icon: GitBranch, query: 'pipelines' },
  { id: 'profiles', label: '처리 프로파일', icon: SlidersHorizontal, query: 'profiles' },
  { id: 'archive', label: '아카이브', icon: Archive, query: 'archive' },
];

export default function PipelineManagementTabs({
  active,
  counts,
}: {
  active: PipelineManagementTab;
  counts?: Partial<Record<PipelineManagementTab, number>>;
}) {
  const pathname = usePathname();
  const base = pathname.startsWith('/current') ? '/current' : '/plan';

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-background/60 p-1">
      {tabs.map((tab) => {
        const href = `${base}/console?tab=${tab.query}`;
        return (
          <Link
            key={tab.id}
            href={href}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors',
              active === tab.id
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            <span>{tab.label}</span>
            {typeof counts?.[tab.id] === 'number' && (
              <span className="font-mono text-[10px] opacity-75">{counts[tab.id]}건</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
