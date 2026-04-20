'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import LeftSidebar from '@/components/panels/LeftSidebar';
import { toast } from '@/components/ui/Toast';
import { useMockRole } from '@/components/auth/RolePreviewSelect';
import type { ProcessingProfile } from '@/types/pipeline';
import { POLARIZATION_OPTIONS } from '@/types/pipeline';
import { cn, formatKST } from '@/lib/utils';
import {
  Plus, Pencil, Trash2, X, Search, SlidersHorizontal, GitBranch,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SATELLITES = ['Lumir-X1', 'Lumir-X2', 'Lumir-X3'];
const MODES = ['Stripmap', 'ScanSAR', 'Spotlight'];
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

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

// ---------------------------------------------------------------------------
// Profile Form Dialog
// ---------------------------------------------------------------------------

interface ProfileFormProps {
  profile?: ProcessingProfile | null;
  onSave: (data: Omit<ProcessingProfile, 'id' | 'createdAt' | 'updatedAt' | 'referencedPipelineCount'>) => void;
  onCancel: () => void;
}

function ProfileFormDialog({ profile, onSave, onCancel }: ProfileFormProps) {
  const [name, setName] = useState(profile?.name ?? '');
  const [satelliteId, setSatelliteId] = useState(profile?.satelliteId ?? SATELLITES[0]);
  const [mode, setMode] = useState(profile?.mode ?? MODES[0]);
  const [polarization, setPolarization] = useState(profile?.polarization ?? 'HH');
  const [priority, setPriority] = useState(profile?.priority ?? 5);
  const [description, setDescription] = useState(profile?.description ?? '');
  const [parametersJson, setParametersJson] = useState(
    profile?.parameters ? JSON.stringify(profile.parameters, null, 2) : '{}',
  );
  const [parametersError, setParametersError] = useState('');

  const isEdit = !!profile;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let parameters: Record<string, unknown> = {};
    try {
      parameters = JSON.parse(parametersJson);
      setParametersError('');
    } catch {
      setParametersError('JSON 형식이 올바르지 않습니다. 처리 파라미터를 다시 확인하세요.');
      return;
    }
    onSave({ name, satelliteId, mode, polarization, priority, description, parameters });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">
            {isEdit ? '처리 프로파일 수정' : '새 처리 프로파일'}
          </h2>
          <button type="button" onClick={onCancel} className="p-1 rounded hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* Name */}
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">이름</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className="mt-1 w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="예: Lumir-X1 Stripmap Standard"
            />
          </label>

          {/* Satellite + Mode */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">위성</span>
              <select
                value={satelliteId}
                onChange={(e) => setSatelliteId(e.target.value)}
                className="mt-1 w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {SATELLITES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">모드</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="mt-1 w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>

          {/* Polarization + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">편파</span>
              <select
                value={polarization}
                onChange={(e) => setPolarization(e.target.value)}
                className="mt-1 w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {POLARIZATION_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">우선순위 (1–10)</span>
              <input
                type="number"
                min={1}
                max={10}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="mt-1 w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
          </div>

          {/* Description */}
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">설명</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              className="mt-1 w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              placeholder="선택사항"
            />
          </label>

          {/* Parameters JSON */}
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">처리 파라미터 (JSON)</span>
            <textarea
              value={parametersJson}
              onChange={(e) => {
                setParametersJson(e.target.value);
                if (parametersError) setParametersError('');
              }}
              rows={4}
              aria-invalid={parametersError ? 'true' : 'false'}
              className={`mt-1 w-full bg-background border rounded-md px-3 py-2 text-xs text-foreground font-mono focus:outline-none focus:ring-1 resize-none ${
                parametersError
                  ? 'border-destructive focus:ring-destructive'
                  : 'border-border focus:ring-accent'
              }`}
            />
            {parametersError && (
              <span className="mt-1 block text-[11px] text-destructive">{parametersError}</span>
            )}
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 rounded-md text-xs font-medium bg-accent text-background hover:bg-accent/90 transition-colors"
          >
            {isEdit ? '수정' : '생성'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirm Dialog
// ---------------------------------------------------------------------------

function DeleteConfirmDialog({
  profile,
  onConfirm,
  onCancel,
}: {
  profile: ProcessingProfile;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const hasRefs = (profile.referencedPipelineCount ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5">
        <h3 className="text-sm font-semibold text-foreground mb-2">프로파일 삭제</h3>
        {hasRefs ? (
          <p className="text-xs text-destructive">
            이 프로파일을 참조하는 파이프라인이 {profile.referencedPipelineCount}개 있습니다.
            먼저 해당 파이프라인에서 프로파일을 변경하거나 제거해야 합니다.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            프로파일 &quot;{profile.name}&quot;을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </p>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
          >
            취소
          </button>
          {!hasRefs && (
            <button
              onClick={onConfirm}
              className="px-4 py-1.5 rounded-md text-xs font-medium bg-destructive text-white hover:bg-destructive/90 transition-colors"
            >
              삭제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Dialog
// ---------------------------------------------------------------------------

function ProfileDetailDialog({
  profile,
  onClose,
}: {
  profile: ProcessingProfile;
  onClose: () => void;
}) {
  const parameters = JSON.stringify(profile.parameters ?? {}, null, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4">
        <div className="flex items-start justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{profile.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {profile.satelliteId} / {profile.mode} / {profile.polarization}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DetailItem label="위성" value={profile.satelliteId} />
            <DetailItem label="모드" value={profile.mode} />
            <DetailItem label="편파" value={profile.polarization} />
            <DetailItem label="우선순위" value={String(profile.priority)} mono />
            <DetailItem label="참조 파이프라인" value={`${profile.referencedPipelineCount ?? 0}개`} mono />
            <DetailItem label="생성일" value={formatKST(profile.createdAt)} />
            <DetailItem label="수정일" value={formatKST(profile.updatedAt)} />
          </div>

          {profile.description && (
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">설명</div>
              <p className="text-xs text-foreground leading-relaxed">{profile.description}</p>
            </div>
          )}

          <div>
            <div className="text-[11px] font-medium text-muted-foreground mb-1">처리 파라미터</div>
            <pre className="rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground font-mono overflow-auto max-h-56">
              {parameters}
            </pre>
          </div>
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-xs font-medium bg-accent text-background hover:bg-accent/90 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xs text-foreground ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ProcessingProfilesPage() {
  const service = usePipelineService();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profiles, setProfiles] = useState<ProcessingProfile[]>([]);

  // Filters
  const [filterSatellite, setFilterSatellite] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [search, setSearch] = useState('');
  const [previewRole] = useMockRole();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<ProcessingProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProcessingProfile | null>(null);
  const [detailProfile, setDetailProfile] = useState<ProcessingProfile | null>(null);

  const loadData = useCallback(async () => {
    const pRes = await service.처리_프로파일_목록을_조회한다();
    if (pRes.data) setProfiles(pRes.data);
  }, [service]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 의존성이 변경될 때 비동기 데이터를 fetch하여 상태를 갱신하는 정규 패턴
    loadData();
  }, [loadData]);

  const filtered = profiles.filter((p) => {
    if (filterSatellite && p.satelliteId !== filterSatellite) return false;
    if (filterMode && p.mode !== filterMode) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    const satCmp = a.satelliteId.localeCompare(b.satelliteId);
    if (satCmp !== 0) return satCmp;
    const modeCmp = a.mode.localeCompare(b.mode);
    if (modeCmp !== 0) return modeCmp;
    return a.priority - b.priority;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(pageStart, pageStart + pageSize);
  const canManage = previewRole === 'Administrator';

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  async function handleSave(data: Omit<ProcessingProfile, 'id' | 'createdAt' | 'updatedAt' | 'referencedPipelineCount'>) {
    if (editProfile) {
      const res = await service.처리_프로파일을_수정한다(editProfile.id, data);
      (res.success ? toast.success : toast.error)(res.message);
    } else {
      const res = await service.처리_프로파일을_생성한다(data);
      (res.success ? toast.success : toast.error)(res.message);
    }
    setFormOpen(false);
    setEditProfile(null);
    await loadData();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await service.처리_프로파일을_삭제한다(deleteTarget.id);
    (res.success ? toast.success : toast.error)(res.message);
    setDeleteTarget(null);
    if (res.success) await loadData();
  }

  return (
    <div className="h-full flex">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        activePage="profiles"
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-accent" />
            <h1 className="text-sm font-semibold text-foreground">처리 프로파일</h1>
            <span className="text-[10px] text-muted-foreground font-mono">{filtered.length}건</span>
          </div>
          <div className="flex items-center gap-2">
            {canManage && (
              <button
                onClick={() => { setEditProfile(null); setFormOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-accent text-background hover:bg-accent/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>새 프로파일</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="이름 검색..."
              className="pl-8 pr-3 py-1.5 bg-background border border-border rounded-md text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent w-48"
            />
          </div>
          <select
            value={filterSatellite}
            onChange={(e) => {
              setFilterSatellite(e.target.value);
              setPage(1);
            }}
            className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">전체 위성</option>
            {SATELLITES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterMode}
            onChange={(e) => {
              setFilterMode(e.target.value);
              setPage(1);
            }}
            className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">전체 모드</option>
            {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="text-left px-5 py-2.5">이름</th>
                <th className="text-left px-3 py-2.5">위성</th>
                <th className="text-left px-3 py-2.5">모드</th>
                <th className="text-left px-3 py-2.5">편파</th>
                <th className="text-center px-3 py-2.5">우선순위</th>
                <th className="text-center px-3 py-2.5">참조</th>
                <th className="text-left px-3 py-2.5">생성일</th>
                <th className="text-right px-5 py-2.5">작업</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setDetailProfile(p)}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                >
                  <td className="px-5 py-2.5">
                    <div className="text-xs font-medium text-foreground">{p.name}</div>
                    {p.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{p.description}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-foreground">{p.satelliteId}</td>
                  <td className="px-3 py-2.5 text-xs text-foreground">{p.mode}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-block px-1.5 py-0.5 rounded text-xs font-mono bg-accent/10 text-accent">
                      {p.polarization}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-foreground font-mono">{p.priority}</td>
                  <td className="px-3 py-2.5 text-center">
                    {(p.referencedPipelineCount ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-xs text-accent">
                        <GitBranch className="w-3 h-3" />
                        {p.referencedPipelineCount}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatKST(p.createdAt)}</td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {canManage && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditProfile(p);
                              setFormOpen(true);
                            }}
                            className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                            title="수정"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(p);
                            }}
                            className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-destructive transition-colors"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-sm text-muted-foreground">
                    조건에 맞는 프로파일이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={currentPage}
          totalPages={pageCount}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      {/* Dialogs */}
      {formOpen && (
        <ProfileFormDialog
          profile={editProfile}
          onSave={handleSave}
          onCancel={() => { setFormOpen(false); setEditProfile(null); }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmDialog
          profile={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {detailProfile && (
        <ProfileDetailDialog
          profile={detailProfile}
          onClose={() => setDetailProfile(null)}
        />
      )}
    </div>
  );
}
