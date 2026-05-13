'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Bell,
  Check,
  ChevronDown,
  Clock3,
  Columns3,
  Eye,
  KeyRound,
  LayoutPanelLeft,
  MonitorCog,
  PanelRight,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Table2,
  TimerReset,
  User,
} from 'lucide-react';
import LeftSidebar from '@/components/panels/LeftSidebar';
import PasswordChangeModal from '@/components/auth/PasswordChangeModal';
import { useMockRole, type MockRole } from '@/components/auth/RolePreviewSelect';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/Toast';

type SidebarDefault = 'expanded' | 'collapsed';
type PanelDefault = 'open' | 'closed';
type TimeZoneMode = 'Asia/Seoul' | 'UTC';
type ToastMode = 'all' | 'important' | 'silent';
type BadgeMode = 'all' | 'unread' | 'off';
type SelectOption = { value: string; label: string; description?: string };

interface ConsoleSettings {
  sidebarDefault: SidebarDefault;
  rightPanelDefault: PanelDefault;
  tablePageSize: number;
  timeZone: TimeZoneMode;
  logLimit: number;
  refreshIntervalSec: number;
  toastMode: ToastMode;
  badgeMode: BadgeMode;
}

const STORAGE_KEY = 'sdpe.consoleSettings';

const DEFAULT_SETTINGS: ConsoleSettings = {
  sidebarDefault: 'expanded',
  rightPanelDefault: 'open',
  tablePageSize: 20,
  timeZone: 'Asia/Seoul',
  logLimit: 300,
  refreshIntervalSec: 30,
  toastMode: 'all',
  badgeMode: 'unread',
};

function loadSettings(): ConsoleSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as ConsoleSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function SettingsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [role, setRole] = useMockRole();
  const [settings, setSettings] = useState<ConsoleSettings>(DEFAULT_SETTINGS);
  const [pwModalOpen, setPwModalOpen] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const sessionInfo = useMemo(() => {
    const username = role === 'Administrator' ? 'admin' : 'operator-01';
    return {
      username,
      role,
      session: 'Mock session',
      auth: 'JWT preview mode',
      lastSeen: new Intl.DateTimeFormat('ko-KR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date()),
    };
  }, [role]);

  const update = <K extends keyof ConsoleSettings>(key: K, value: ConsoleSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const save = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    toast.success('Settings saved');
  };

  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
    toast.success('Reverted to default settings');
  };

  return (
    <div className="h-full flex overflow-hidden bg-background">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        activePage="settings"
      />

      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="min-h-full px-8 py-7">
          <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-accent" />
                <h1 className="text-lg font-bold text-foreground">Settings</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Defaults
              </button>
              <button
                type="button"
                onClick={save}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:brightness-110 transition-all"
              >
                <Save className="w-3.5 h-3.5" />
                Save
              </button>
            </div>
          </header>

          <div className="mt-6 grid grid-cols-[minmax(0,1fr)_340px] gap-5">
            <div className="space-y-5 min-w-0">
              <SettingsSection
                icon={User}
                title="Account Settings"
                description="View the current session and default role, and start a password change."
              >
                <SettingRow label="Account" description="Current console user">
                  <div className="text-right">
                    <div className="text-xs font-mono text-foreground">{sessionInfo.username}</div>
                    <div className="text-[10px] text-muted-foreground">{sessionInfo.auth}</div>
                  </div>
                </SettingRow>
                <SettingRow label="Default Role" description="Default mock permission preview">
                  <SelectValue
                    value={role}
                    options={[
                      { value: 'Administrator', label: 'Administrator', description: 'Administrator privileges' },
                      { value: 'Operator', label: 'Operator', description: 'Operator privileges' },
                    ]}
                    onChange={(next) => setRole(next as MockRole)}
                  />
                </SettingRow>
                <SettingRow label="Password" description="Account security settings">
                  <button
                    type="button"
                    onClick={() => setPwModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-foreground hover:bg-muted/30 transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                    Change Password
                  </button>
                </SettingRow>
              </SettingsSection>

              <SettingsSection
                icon={MonitorCog}
                title="Display Settings"
                description="Adjust the console layout and table display defaults."
              >
                <SettingRow label="Default Sidebar State" description="How the left menu appears when entering a new screen">
                  <Segmented
                    value={settings.sidebarDefault}
                    options={[
                      { value: 'expanded', label: 'Expanded' },
                      { value: 'collapsed', label: 'Collapsed' },
                    ]}
                    onChange={(value) => update('sidebarDefault', value as SidebarDefault)}
                  />
                </SettingRow>
                <SettingRow label="Default Right Panel State" description="How the job/console detail panel is displayed">
                  <Segmented
                    value={settings.rightPanelDefault}
                    options={[
                      { value: 'open', label: 'Open' },
                      { value: 'closed', label: 'Closed' },
                    ]}
                    onChange={(value) => update('rightPanelDefault', value as PanelDefault)}
                  />
                </SettingRow>
                <SettingRow label="Table Page Size" description="Default page size for list screens">
                  <SelectValue
                    value={String(settings.tablePageSize)}
                    options={[
                      { value: '10', label: '10 rows' },
                      { value: '20', label: '20 rows' },
                      { value: '50', label: '50 rows' },
                    ]}
                    onChange={(value) => update('tablePageSize', Number(value))}
                  />
                </SettingRow>
              </SettingsSection>

              <SettingsSection
                icon={Clock3}
                title="Operations Console Environment"
                description="Configure time display, log loading scope, and refresh interval."
              >
                <SettingRow label="Time Zone Display" description="Time format basis for operations screens">
                  <Segmented
                    value={settings.timeZone}
                    options={[
                      { value: 'Asia/Seoul', label: 'KST' },
                      { value: 'UTC', label: 'UTC' },
                    ]}
                    onChange={(value) => update('timeZone', value as TimeZoneMode)}
                  />
                </SettingRow>
                <SettingRow label="Log Display Count" description="Default loading count for the run log panel">
                  <SelectValue
                    value={String(settings.logLimit)}
                    options={[
                      { value: '100', label: '100 events' },
                      { value: '300', label: '300 events' },
                      { value: '500', label: '500 events' },
                    ]}
                    onChange={(value) => update('logLimit', Number(value))}
                  />
                </SettingRow>
                <SettingRow label="Auto Refresh Interval" description="Dashboard / queue status refresh interval">
                  <SelectValue
                    value={String(settings.refreshIntervalSec)}
                    options={[
                      { value: '10', label: '10 seconds' },
                      { value: '30', label: '30 seconds' },
                      { value: '60', label: '60 seconds' },
                      { value: '0', label: 'Off' },
                    ]}
                    onChange={(value) => update('refreshIntervalSec', Number(value))}
                  />
                </SettingRow>
              </SettingsSection>

              <SettingsSection
                icon={Bell}
                title="Notification Display Settings"
                description="Choose the display scope for toasts and sidebar badges."
              >
                <SettingRow label="Toast Display" description="Display scope for top-right notification messages">
                  <SelectValue
                    value={settings.toastMode}
                    options={[
                      { value: 'all', label: 'All events' },
                      { value: 'important', label: 'Important only' },
                      { value: 'silent', label: 'Silent' },
                    ]}
                    onChange={(value) => update('toastMode', value as ToastMode)}
                  />
                </SettingRow>
                <SettingRow label="Badge Display" description="How the sidebar notification counter is displayed">
                  <SelectValue
                    value={settings.badgeMode}
                    options={[
                      { value: 'all', label: 'All counts' },
                      { value: 'unread', label: 'Unread only' },
                      { value: 'off', label: 'Off' },
                    ]}
                    onChange={(value) => update('badgeMode', value as BadgeMode)}
                  />
                </SettingRow>
              </SettingsSection>
            </div>

            <aside className="space-y-4">
              <div className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-accent" />
                    <div className="text-sm font-semibold text-foreground">Session Info</div>
                  </div>
                </div>
                <div className="p-4 space-y-3 text-xs">
                  <SummaryRow label="User" value={sessionInfo.username} mono />
                  <SummaryRow label="Role" value={sessionInfo.role} />
                  <SummaryRow label="Session" value={sessionInfo.session} />
                  <SummaryRow label="Last Seen" value={sessionInfo.lastSeen} />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-accent" />
                    <div className="text-sm font-semibold text-foreground">Pending Application</div>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  <PreviewLine icon={LayoutPanelLeft} label="Sidebar" value={settings.sidebarDefault} />
                  <PreviewLine icon={PanelRight} label="Right panel" value={settings.rightPanelDefault} />
                  <PreviewLine icon={Table2} label="Page size" value={`${settings.tablePageSize} rows`} />
                  <PreviewLine icon={TimerReset} label="Refresh" value={settings.refreshIntervalSec === 0 ? 'Off' : `${settings.refreshIntervalSec}s`} />
                  <PreviewLine icon={Columns3} label="Logs" value={`${settings.logLimit} events`} />
                  <PreviewLine icon={BadgeCheck} label="Badges" value={settings.badgeMode} />
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <PasswordChangeModal open={pwModalOpen} onClose={() => setPwModalOpen(false)} />
    </div>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="divide-y divide-border/70">{children}</div>
    </section>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_220px] items-center gap-5 px-4 py-3">
      <div className="min-w-0">
        <div className="text-xs font-medium text-foreground">{label}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{description}</div>
      </div>
      <div className="flex justify-end">{children}</div>
    </div>
  );
}

function SelectValue({
  value,
  options,
  onChange,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  const selectOption = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div
      className={cn('relative w-full', open && 'z-40')}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex min-h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-[11px] font-medium text-foreground transition-colors',
          open ? 'border-accent ring-1 ring-accent/35' : 'hover:bg-muted/25',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block truncate">{selected?.label ?? value}</span>
          {selected?.description && (
            <span className="mt-0.5 block truncate text-[9px] font-normal text-muted-foreground">{selected.description}</span>
          )}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-xl"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => selectOption(option.value)}
                className={cn(
                  'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors',
                  active ? 'bg-accent/12 text-foreground' : 'hover:bg-muted/35',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                    active ? 'border-accent bg-accent text-background' : 'border-border text-transparent',
                  )}
                >
                  <Check className="h-3 w-3 stroke-[3]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold text-foreground">{option.label}</span>
                  {option.description && (
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{option.description}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid w-full grid-cols-2 rounded-md border border-border bg-background p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded px-2 py-1 text-[11px] font-medium transition-colors',
            value === option.value
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('text-right text-foreground', mono && 'font-mono')}>{value}</span>
    </div>
  );
}

function PreviewLine({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-[11px] text-muted-foreground">{label}</span>
      </div>
      <span className="shrink-0 text-[11px] font-medium text-foreground">{value}</span>
    </div>
  );
}
