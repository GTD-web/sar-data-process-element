'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Bell,
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
    toast.success('설정을 저장했습니다');
  };

  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
    toast.success('기본 설정으로 되돌렸습니다');
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
          <header className="flex items-center justify-between gap-4 border-b border-border pb-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-accent" />
                <h1 className="text-lg font-bold text-foreground">설정</h1>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                계정과 운영 콘솔 표시 방식을 조정합니다.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                기본값
              </button>
              <button
                type="button"
                onClick={save}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:brightness-110 transition-all"
              >
                <Save className="w-3.5 h-3.5" />
                저장
              </button>
            </div>
          </header>

          <div className="mt-6 grid grid-cols-[minmax(0,1fr)_340px] gap-5">
            <div className="space-y-5 min-w-0">
              <SettingsSection
                icon={User}
                title="계정 설정"
                description="현재 세션과 기본 역할을 확인하고 비밀번호 변경을 시작합니다."
              >
                <SettingRow label="계정" description="현재 콘솔 사용자">
                  <div className="text-right">
                    <div className="text-xs font-mono text-foreground">{sessionInfo.username}</div>
                    <div className="text-[10px] text-muted-foreground">{sessionInfo.auth}</div>
                  </div>
                </SettingRow>
                <SettingRow label="기본 역할" description="Mock 권한 미리보기 기본값">
                  <SelectValue value={role} onChange={(next) => setRole(next as MockRole)}>
                    <option value="Administrator">Administrator</option>
                    <option value="Operator">Operator</option>
                  </SelectValue>
                </SettingRow>
                <SettingRow label="비밀번호" description="계정 보안 설정">
                  <button
                    type="button"
                    onClick={() => setPwModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-foreground hover:bg-muted/30 transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                    비밀번호 변경
                  </button>
                </SettingRow>
              </SettingsSection>

              <SettingsSection
                icon={MonitorCog}
                title="화면 설정"
                description="콘솔 레이아웃과 테이블 표시 기본값을 조정합니다."
              >
                <SettingRow label="사이드바 기본 상태" description="새 화면 진입 시 왼쪽 메뉴 표시 방식">
                  <Segmented
                    value={settings.sidebarDefault}
                    options={[
                      { value: 'expanded', label: '펼침' },
                      { value: 'collapsed', label: '접힘' },
                    ]}
                    onChange={(value) => update('sidebarDefault', value as SidebarDefault)}
                  />
                </SettingRow>
                <SettingRow label="오른쪽 패널 기본 상태" description="작업/콘솔 상세 패널 표시 방식">
                  <Segmented
                    value={settings.rightPanelDefault}
                    options={[
                      { value: 'open', label: '열림' },
                      { value: 'closed', label: '닫힘' },
                    ]}
                    onChange={(value) => update('rightPanelDefault', value as PanelDefault)}
                  />
                </SettingRow>
                <SettingRow label="테이블 페이지 크기" description="목록 화면 기본 페이지 크기">
                  <SelectValue
                    value={String(settings.tablePageSize)}
                    onChange={(value) => update('tablePageSize', Number(value))}
                  >
                    <option value="10">10 rows</option>
                    <option value="20">20 rows</option>
                    <option value="50">50 rows</option>
                  </SelectValue>
                </SettingRow>
              </SettingsSection>

              <SettingsSection
                icon={Clock3}
                title="운영 콘솔 환경"
                description="시간 표시, 로그 로딩 범위, 새로고침 주기를 설정합니다."
              >
                <SettingRow label="시간대 표시" description="운영 화면의 시간 포맷 기준">
                  <Segmented
                    value={settings.timeZone}
                    options={[
                      { value: 'Asia/Seoul', label: 'KST' },
                      { value: 'UTC', label: 'UTC' },
                    ]}
                    onChange={(value) => update('timeZone', value as TimeZoneMode)}
                  />
                </SettingRow>
                <SettingRow label="로그 표시 개수" description="실행 로그 패널 기본 로딩 수">
                  <SelectValue
                    value={String(settings.logLimit)}
                    onChange={(value) => update('logLimit', Number(value))}
                  >
                    <option value="100">100 events</option>
                    <option value="300">300 events</option>
                    <option value="500">500 events</option>
                  </SelectValue>
                </SettingRow>
                <SettingRow label="자동 새로고침 간격" description="대시보드/큐 상태 갱신 주기">
                  <SelectValue
                    value={String(settings.refreshIntervalSec)}
                    onChange={(value) => update('refreshIntervalSec', Number(value))}
                  >
                    <option value="10">10 seconds</option>
                    <option value="30">30 seconds</option>
                    <option value="60">60 seconds</option>
                    <option value="0">Off</option>
                  </SelectValue>
                </SettingRow>
              </SettingsSection>

              <SettingsSection
                icon={Bell}
                title="알림 표시 설정"
                description="Toast와 사이드바 배지 표시 범위를 선택합니다."
              >
                <SettingRow label="Toast 표시" description="화면 우상단 알림 메시지 표시 범위">
                  <SelectValue
                    value={settings.toastMode}
                    onChange={(value) => update('toastMode', value as ToastMode)}
                  >
                    <option value="all">All events</option>
                    <option value="important">Important only</option>
                    <option value="silent">Silent</option>
                  </SelectValue>
                </SettingRow>
                <SettingRow label="배지 표시" description="사이드바 알림 카운터 표시 방식">
                  <SelectValue
                    value={settings.badgeMode}
                    onChange={(value) => update('badgeMode', value as BadgeMode)}
                  >
                    <option value="all">All counts</option>
                    <option value="unread">Unread only</option>
                    <option value="off">Off</option>
                  </SelectValue>
                </SettingRow>
              </SettingsSection>
            </div>

            <aside className="space-y-4">
              <div className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-accent" />
                    <div className="text-sm font-semibold text-foreground">세션 정보</div>
                  </div>
                </div>
                <div className="p-4 space-y-3 text-xs">
                  <SummaryRow label="사용자" value={sessionInfo.username} mono />
                  <SummaryRow label="역할" value={sessionInfo.role} />
                  <SummaryRow label="세션" value={sessionInfo.session} />
                  <SummaryRow label="최근 확인" value={sessionInfo.lastSeen} />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-accent" />
                    <div className="text-sm font-semibold text-foreground">현재 적용 예정</div>
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
    <section className="rounded-lg border border-border bg-card overflow-hidden">
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
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-md border border-border bg-background px-2.5 py-1.5 pr-8 text-[11px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
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
