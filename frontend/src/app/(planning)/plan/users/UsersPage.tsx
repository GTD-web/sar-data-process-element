'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  KeyRound,
  Pencil,
  Plus,
  Shield,
  UserCheck,
  UserCog,
  UserX,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import LeftSidebar from '@/components/panels/LeftSidebar';
import { useMockRole } from '@/components/auth/RolePreviewSelect';
import UserFormModal from '@/components/auth/UserFormModal';
import PasswordResetModal from '@/components/auth/PasswordResetModal';
import { cn, formatKST, formatRelativeTime } from '@/lib/utils';
import type { Role, User } from '@/types/user';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SortIcon({ active, order }: { active: boolean; order: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  return order === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function getPageRange(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('ellipsis');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

function Pagination({
  page,
  totalPages,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  const range = getPageRange(page, totalPages);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border bg-card shrink-0">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>페이지 당</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="bg-background border border-border rounded-md px-1.5 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="font-mono tabular-nums">
          {start}–{end} / {total}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          이전
        </button>
        {range.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e-${i}`} className="px-1.5 text-[11px] text-muted-foreground select-none">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={cn(
                'min-w-6.5 px-2 py-1 text-[11px] rounded-md border transition-colors tabular-nums',
                p === page
                  ? 'border-accent bg-accent text-background font-semibold'
                  : 'border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground',
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          다음
        </button>
      </div>
    </div>
  );
}

function StatCard({
  label,
  count,
  icon: Icon,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon: React.ElementType;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left min-w-0',
        active
          ? 'border-accent bg-accent/5 ring-1 ring-accent/30'
          : 'border-border hover:border-accent/40 hover:bg-muted/20',
      )}
    >
      <Icon className={cn('w-3.5 h-3.5 shrink-0', color)} />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground tabular-nums">{count}</div>
        <div className="text-[9px] text-muted-foreground truncate">{label}</div>
      </div>
    </button>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
        role === 'Administrator' ? 'bg-accent/15 text-accent' : 'bg-muted/50 text-muted-foreground',
      )}
    >
      {role === 'Administrator' ? <Shield className="w-3 h-3" /> : <UserCog className="w-3 h-3" />}
      {role}
    </span>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
        active ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
      )}
    >
      {active ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
      {active ? '활성' : '비활성'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Detail Panel
// ---------------------------------------------------------------------------

function DetailPanel({
  user,
  isSelf,
  activeAdminCount,
  onEdit,
  onReset,
  onToggleActive,
}: {
  user: User;
  isSelf: boolean;
  activeAdminCount: number;
  onEdit: (u: User) => void;
  onReset: (u: User) => void;
  onToggleActive: (u: User) => void;
}) {
  const lastAdminBlocked = user.role === 'Administrator' && user.active && activeAdminCount <= 1;
  const disableDeactivate = isSelf || lastAdminBlocked;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <RoleBadge role={user.role} />
          <ActiveBadge active={user.active} />
          {isSelf && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-accent text-background">본인</span>
          )}
        </div>
        <div className="font-mono text-sm text-foreground break-all">{user.username}</div>
        <div className="text-[11px] text-muted-foreground break-all">{user.email}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DetailField label="사용자 ID" value={user.id} mono />
        <DetailField label="생성일" value={formatKST(user.createdAt)} />
        <DetailField
          label="최근 로그인"
          value={user.lastLoginAt ? `${formatKST(user.lastLoginAt)} (${formatRelativeTime(user.lastLoginAt)})` : '—'}
        />
        <DetailField label="최근 IP" value={user.lastLoginIp ?? '—'} mono />
        <DetailField label="비밀번호 재설정 필요" value={user.requiresPasswordReset ? '예' : '아니오'} />
      </div>

      <div className="pt-1 border-t border-border space-y-2">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">액션</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onEdit(user)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border text-[11px] text-foreground hover:bg-muted/30 transition-colors"
          >
            <Pencil className="w-3 h-3" />
            편집
          </button>
          <button
            onClick={() => onReset(user)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border text-[11px] text-foreground hover:bg-muted/30 transition-colors"
          >
            <KeyRound className="w-3 h-3" />
            비밀번호 초기화
          </button>
          <button
            onClick={() => onToggleActive(user)}
            disabled={disableDeactivate && user.active}
            title={
              isSelf
                ? '본인 계정은 비활성화할 수 없습니다'
                : lastAdminBlocked && user.active
                  ? '최소 1명의 Administrator 가 활성 상태여야 합니다'
                  : undefined
            }
            className={cn(
              'col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-[11px] transition-colors',
              user.active
                ? 'border-destructive/40 text-destructive hover:bg-destructive/10'
                : 'border-success/40 text-success hover:bg-success/10',
              disableDeactivate && user.active && 'opacity-50 cursor-not-allowed hover:bg-transparent',
            )}
          >
            {user.active ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
            {user.active ? '비활성화' : '활성화'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
      <div className={cn('text-xs text-foreground break-all', mono && 'font-mono text-[11px]')}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type StatFilter = '' | 'active' | 'inactive' | 'Administrator' | 'Operator';

const SORT_COLUMNS: { id: keyof User; label: string }[] = [
  { id: 'username', label: '사용자명' },
  { id: 'email', label: '이메일' },
  { id: 'role', label: '역할' },
  { id: 'active', label: '상태' },
  { id: 'lastLoginAt', label: '최근 로그인' },
  { id: 'createdAt', label: '생성일' },
];

export default function UsersPage() {
  const service = usePipelineService();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [previewRole] = useMockRole();
  const canManage = previewRole === 'Administrator';

  // Mock 환경에서는 useMockRole 값을 본인 역할로 가정. username 은 sticky 목업으로 매핑.
  const mockCurrentUsername = previewRole === 'Administrator' ? 'admin' : 'operator-01';

  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [globalCounts, setGlobalCounts] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    Administrator: 0,
    Operator: 0,
    activeAdministrator: 0,
  });

  const [search, setSearch] = useState('');
  const [statFilter, setStatFilter] = useState<StatFilter>('');
  const [sortBy, setSortBy] = useState<keyof User>('username');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [formModal, setFormModal] = useState<null | { kind: 'create' } | { kind: 'edit'; user: User }>(null);
  const [resetModalUser, setResetModalUser] = useState<User | null>(null);

  const filterParams = useMemo<Parameters<typeof service.사용자목록을_조회한다>[0]>(() => {
    const params: Parameters<typeof service.사용자목록을_조회한다>[0] = {
      search: search || undefined,
      page,
      size: pageSize,
      sortBy,
      sortOrder,
    };
    if (statFilter === 'active') params.active = true;
    if (statFilter === 'inactive') params.active = false;
    if (statFilter === 'Administrator') params.role = 'Administrator';
    if (statFilter === 'Operator') params.role = 'Operator';
    return params;
    // service 는 Context 주입 후 불변이므로 의존성 배열에서 제외 (type-only reference)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statFilter, page, pageSize, sortBy, sortOrder]);

  const loadData = useCallback(async () => {
    if (!canManage) {
      setUsers([]);
      setTotal(0);
      setSelectedUser(null);
      return;
    }
    const res = await service.사용자목록을_조회한다(filterParams);
    if (res.data) {
      setUsers(res.data.items);
      setTotal(res.data.total);
      if (selectedUser) {
        const updated = res.data.items.find((u) => u.id === selectedUser.id);
        if (updated) setSelectedUser(updated);
      }
    }
  }, [service, filterParams, canManage, selectedUser]);

  const loadStats = useCallback(async () => {
    if (!canManage) return;
    const res = await service.사용자목록을_조회한다({ size: 500 });
    if (res.data) {
      const all = res.data.items;
      setGlobalCounts({
        total: all.length,
        active: all.filter((u) => u.active).length,
        inactive: all.filter((u) => !u.active).length,
        Administrator: all.filter((u) => u.role === 'Administrator').length,
        Operator: all.filter((u) => u.role === 'Operator').length,
        activeAdministrator: all.filter((u) => u.role === 'Administrator' && u.active).length,
      });
    }
  }, [service, canManage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleSort = useCallback(
    (col: keyof User) => {
      const next = sortBy === col && sortOrder === 'asc' ? 'desc' : 'asc';
      setSortBy(col);
      setSortOrder(next);
    },
    [sortBy, sortOrder],
  );

  const handleSelectStat = useCallback((key: StatFilter) => {
    setStatFilter((prev) => (prev === key ? '' : key));
    setPage(1);
  }, []);

  const hasFilters = Boolean(search) || statFilter !== '';

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatFilter('');
    setPage(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const activeAdminCount = globalCounts.activeAdministrator;

  const handleToggleActive = useCallback(
    async (user: User) => {
      const res = await service.사용자를_수정한다(user.id, { active: !user.active });
      if (!res.success) return;
      await Promise.all([loadData(), loadStats()]);
    },
    [service, loadData, loadStats],
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([loadData(), loadStats()]);
  }, [loadData, loadStats]);

  const panelOpen = selectedUser !== null;

  return (
    <div className="h-full flex">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        activePage="users"
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <UsersIcon className="w-4 h-4 text-accent" />
            <h1 className="text-sm font-semibold text-foreground">사용자 관리</h1>
            <span className="text-[10px] text-muted-foreground font-mono">{total}건</span>
          </div>
          <div className="flex items-center gap-2">
            {hasFilters && canManage && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              >
                <X className="w-3 h-3" />
                필터 초기화
              </button>
            )}
            {canManage && (
              <button
                onClick={() => setFormModal({ kind: 'create' })}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="w-3 h-3" />
                사용자 추가
              </button>
            )}
          </div>
        </div>

        {!canManage ? (
          <div className="flex-1 flex items-center justify-center bg-background">
            <div className="max-w-sm text-center">
              <UsersIcon className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <h2 className="text-sm font-semibold text-foreground">사용자 관리는 Administrator 전용입니다</h2>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Operator 역할은 본인 비밀번호 변경은 가능하지만, 다른 사용자 계정 관리 권한은 없습니다.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="px-5 py-3 border-b border-border shrink-0">
              <div className="grid grid-cols-5 gap-2">
                <StatCard
                  label="전체"
                  count={globalCounts.total}
                  icon={UsersIcon}
                  color="text-accent"
                  active={statFilter === ''}
                  onClick={() => setStatFilter('')}
                />
                <StatCard
                  label="활성"
                  count={globalCounts.active}
                  icon={UserCheck}
                  color="text-success"
                  active={statFilter === 'active'}
                  onClick={() => handleSelectStat('active')}
                />
                <StatCard
                  label="비활성"
                  count={globalCounts.inactive}
                  icon={UserX}
                  color="text-muted-foreground"
                  active={statFilter === 'inactive'}
                  onClick={() => handleSelectStat('inactive')}
                />
                <StatCard
                  label="Administrator"
                  count={globalCounts.Administrator}
                  icon={Shield}
                  color="text-accent"
                  active={statFilter === 'Administrator'}
                  onClick={() => handleSelectStat('Administrator')}
                />
                <StatCard
                  label="Operator"
                  count={globalCounts.Operator}
                  icon={UserCog}
                  color="text-muted-foreground"
                  active={statFilter === 'Operator'}
                  onClick={() => handleSelectStat('Operator')}
                />
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border shrink-0">
              <input
                type="text"
                placeholder="사용자명·이메일 검색..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent w-64"
              />
            </div>

            {/* Table + Detail */}
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-auto">
                  {users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                      <UsersIcon className="w-8 h-8 opacity-30" />
                      <span className="text-sm">
                        {hasFilters ? '조건에 맞는 사용자가 없습니다' : '사용자가 없습니다'}
                      </span>
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card z-10">
                        <tr className="text-left border-b border-border">
                          {SORT_COLUMNS.map((col) => (
                            <th key={col.id} className="px-4 py-2.5 font-medium text-muted-foreground">
                              <button
                                type="button"
                                onClick={() => handleSort(col.id)}
                                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                              >
                                {col.label}
                                <SortIcon active={sortBy === col.id} order={sortOrder} />
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => {
                          const isSelected = selectedUser?.id === u.id;
                          const isSelf = u.username === mockCurrentUsername;
                          return (
                            <tr
                              key={u.id}
                              onClick={() => setSelectedUser(isSelected ? null : u)}
                              className={cn(
                                'border-b border-border/50 cursor-pointer transition-colors',
                                isSelected ? 'bg-accent/5' : 'hover:bg-muted/20',
                              )}
                            >
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-accent">{u.username}</span>
                                  {isSelf && (
                                    <span className="px-1 py-0 rounded text-[9px] font-bold bg-accent/15 text-accent">
                                      본인
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground">{u.email}</td>
                              <td className="px-4 py-2.5">
                                <RoleBadge role={u.role} />
                              </td>
                              <td className="px-4 py-2.5">
                                <ActiveBadge active={u.active} />
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                                {u.lastLoginAt ? formatRelativeTime(u.lastLoginAt) : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                                {formatKST(u.createdAt)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  onPageSizeChange={(s) => {
                    setPageSize(s);
                    setPage(1);
                  }}
                />
              </div>

              {/* Detail Panel */}
              <div
                className={cn(
                  'h-full border-l border-border bg-card flex flex-col shrink-0 transition-all duration-300 ease-in-out overflow-hidden',
                  panelOpen ? 'w-95 min-w-95 opacity-100 translate-x-0' : 'w-0 min-w-0 opacity-0 translate-x-4 border-l-0',
                )}
              >
                {selectedUser && (
                  <>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <UserCog className="w-4 h-4 text-accent shrink-0" />
                        <span className="text-xs font-semibold text-foreground truncate">사용자 상세</span>
                      </div>
                      <button
                        onClick={() => setSelectedUser(null)}
                        className="p-1 rounded-md hover:bg-muted/50 transition-colors"
                      >
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                    <DetailPanel
                      user={selectedUser}
                      isSelf={selectedUser.username === mockCurrentUsername}
                      activeAdminCount={activeAdminCount}
                      onEdit={(u) => setFormModal({ kind: 'edit', user: u })}
                      onReset={(u) => setResetModalUser(u)}
                      onToggleActive={handleToggleActive}
                    />
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <UserFormModal
        open={formModal !== null}
        mode={formModal}
        onClose={() => setFormModal(null)}
        onSaved={refreshAll}
        currentUserId={users.find((u) => u.username === mockCurrentUsername)?.id ?? null}
      />

      <PasswordResetModal
        open={resetModalUser !== null}
        user={resetModalUser}
        onClose={() => setResetModalUser(null)}
      />
    </div>
  );
}
