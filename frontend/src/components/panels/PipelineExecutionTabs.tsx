'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

type PipelineExecutionTab = 'auto' | 'manual';

const tabs: { id: PipelineExecutionTab; label: string; icon: React.ElementType }[] = [
  { id: 'auto', label: 'Automatic Pipelines', icon: Radio },
  { id: 'manual', label: 'Job Execution History', icon: Briefcase },
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
  const tabHref: Record<PipelineExecutionTab, string> = {
    auto: `${base}/deployed?tab=auto`,
    manual: `${base}/jobs`,
  };

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-background/60 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tabHref[tab.id]}
          className={cn(
            'inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors',
            active === tab.id
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
          )}
        >
          <tab.icon className="h-3.5 w-3.5" />
          <span>{tab.label}</span>
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-none',
              active === tab.id ? 'bg-background/20 text-accent-foreground' : 'bg-muted/60 text-muted-foreground',
            )}
          >
            {counts?.[tab.id] ?? 0}
          </span>
        </Link>
      ))}
    </div>
  );
}
