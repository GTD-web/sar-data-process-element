'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  GitBranch,
  ListTodo,
  AlertTriangle,
  Server,
  FileText,
  Settings,
  Activity,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: '대시보드', icon: LayoutDashboard },
  { href: '/jobs', label: 'Jobs', icon: ListTodo },
  { href: '/pipelines', label: '파이프라인', icon: GitBranch },
  { href: '/alerts', label: 'Alerts', icon: AlertTriangle },
  { href: '/servers', label: '서버/큐', icon: Server },
  { href: '/audit', label: '감사 로그', icon: FileText },
] as const;

const SETTINGS_ITEMS = [
  { href: '/settings/profiles', label: '처리 프로파일', icon: Settings },
] as const;

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside className="w-60 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-full">
      {/* Logo */}
      <div className="h-14 flex items-center gap-2 px-4 border-b border-sidebar-border">
        <Activity className="w-6 h-6 text-accent" />
        <span className="font-semibold text-sm text-foreground tracking-tight">
          SDPE Pipeline Console
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          모니터링
        </div>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors',
              isActive(href)
                ? 'bg-sidebar-accent text-accent-foreground font-medium'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}

        <div className="px-2 pt-4 pb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          설정
        </div>
        {SETTINGS_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors',
              isActive(href)
                ? 'bg-sidebar-accent text-accent-foreground font-medium'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Version */}
      <div className="px-4 py-3 border-t border-sidebar-border text-[11px] text-muted-foreground">
        v0.1.0 · Mock Mode
      </div>
    </aside>
  );
}
