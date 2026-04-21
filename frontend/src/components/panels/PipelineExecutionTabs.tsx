'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

type PipelineExecutionTab = 'auto' | 'manual';

const tabs: { id: PipelineExecutionTab; label: string; icon: React.ElementType; query: string }[] = [
  { id: 'auto', label: '자동 파이프라인', icon: Radio, query: 'auto' },
  { id: 'manual', label: '수동 파이프라인', icon: Briefcase, query: 'manual' },
];

export default function PipelineExecutionTabs({
  active,
  counts,
}: {
  active: PipelineExecutionTab;
  counts?: Partial<Record<PipelineExecutionTab, number>>;
}) {
  const pathname = usePathname();
  const base = pathname.startsWith('/current') ? '/current' : '/plan';

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-background/60 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={`${base}/deployed?tab=${tab.query}`}
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
      ))}
    </div>
  );
}
