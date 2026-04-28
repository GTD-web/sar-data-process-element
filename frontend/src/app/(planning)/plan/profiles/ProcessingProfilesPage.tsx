'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import LeftSidebar from '@/components/panels/LeftSidebar';
import PipelineManagementTabs from '@/components/panels/PipelineManagementTabs';
import { toast } from '@/components/ui/Toast';
import { useMockRole } from '@/components/auth/RolePreviewSelect';
import type { PipelineDefinition, ProcessingProfile } from '@/types/pipeline';
import { POLARIZATION_OPTIONS } from '@/types/pipeline';
import { cn, formatKST } from '@/lib/utils';
import {
  Plus, Pencil, Trash2, X, Search, GitBranch, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SATELLITES = ['Lumir-X1', 'Lumir-X2', 'Lumir-X3'];
const MODES = ['Stripmap', 'ScanSAR', 'Spotlight'];
const PROCESSING_STAGES = ['L0', 'L1A', 'L1B', 'L1C', 'L2', 'L2A', 'L2B', 'L3'];
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const PROFILE_TABLE_COLUMNS = [
  { id: 'name', label: 'Name', align: 'left' },
  { id: 'processingStage', label: 'Stage', align: 'center' },
  { id: 'assignmentTags', label: 'Assignment Tags', align: 'left' },
  { id: 'priority', label: 'Priority', align: 'center' },
  { id: 'references', label: 'Referenced Pipelines', align: 'center' },
  { id: 'createdAt', label: 'Created At', align: 'left' },
] as const;

type ProfileSortKey = (typeof PROFILE_TABLE_COLUMNS)[number]['id'];

function SortIcon({ active, order }: { active: boolean; order: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  return order === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
}

interface ReferencingPipelineInfo {
  id: string;
  name: string;
  satelliteId: string;
  mode: string;
  archived?: boolean;
}

function buildProfileReferenceMap(pipelines: PipelineDefinition[]): Record<string, ReferencingPipelineInfo[]> {
  const map: Record<string, ReferencingPipelineInfo[]> = {};

  for (const pipeline of pipelines) {
    const profileIds = new Set(
      pipeline.steps
        .map((step) => step.jobInitConfig?.profileId)
        .filter((profileId): profileId is string => typeof profileId === 'string' && profileId.length > 0),
    );

    for (const profileId of profileIds) {
      if (!map[profileId]) map[profileId] = [];
      map[profileId].push({
        id: pipeline.id,
        name: pipeline.name,
        satelliteId: pipeline.satelliteId,
        mode: pipeline.mode,
        archived: pipeline.archived,
      });
    }
  }

  for (const profileId of Object.keys(map)) {
    map[profileId].sort((a, b) => a.name.localeCompare(b.name));
  }

  return map;
}

function getProfileTagGroups(profile: ProcessingProfile) {
  return {
    satellite: profile.satelliteTags ?? (profile.satelliteId ? [profile.satelliteId] : []),
    mode: profile.modeTags ?? (profile.mode ? [profile.mode] : []),
    polarization: profile.polarizationTags ?? (profile.polarization ? [profile.polarization] : []),
  };
}

function flattenProfileTags(profile: ProcessingProfile) {
  const groups = getProfileTagGroups(profile);
  return [
    ...groups.satellite.map((value) => `satellite:${value}`),
    ...groups.mode.map((value) => `mode:${value}`),
    ...groups.polarization.map((value) => `polarization:${value}`),
  ];
}

function AssignmentTags({ profile }: { profile: ProcessingProfile }) {
  const tags = flattenProfileTags(profile);
  if (tags.length === 0) {
    return <span className="text-xs text-muted-foreground/60">Unassigned</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {tag}
        </span>
      ))}
    </div>
  );
}

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
        <span>Rows</span>
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
          Previous
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
          Next
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

function TagPicker({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };

  return (
    <div>
      <div className="mb-1 text-[10px] font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={cn(
                'rounded-full border px-2 py-1 text-[10px] font-medium transition-colors',
                active
                  ? 'border-accent/45 bg-accent/10 text-accent'
                  : 'border-border bg-card text-muted-foreground hover:border-accent/35 hover:text-foreground',
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProfileFormDialog({ profile, onSave, onCancel }: ProfileFormProps) {
  const [name, setName] = useState(profile?.name ?? '');
  const [satelliteTags, setSatelliteTags] = useState<string[]>(profile?.satelliteTags ?? (profile?.satelliteId ? [profile.satelliteId] : []));
  const [modeTags, setModeTags] = useState<string[]>(profile?.modeTags ?? (profile?.mode ? [profile.mode] : []));
  const [polarizationTags, setPolarizationTags] = useState<string[]>(profile?.polarizationTags ?? (profile?.polarization ? [profile.polarization] : []));
  const [processingStage, setProcessingStage] = useState(profile?.processingStage ?? PROCESSING_STAGES[0]);
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
      setParametersError('Invalid JSON. Check the processing parameters.');
      return;
    }
    onSave({
      name,
      satelliteId: undefined,
      mode: undefined,
      polarization: undefined,
      satelliteTags,
      modeTags,
      polarizationTags,
      processingStage,
      priority,
      description,
      parameters,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">
            {isEdit ? 'Edit Processing Profile' : 'New Processing Profile'}
          </h2>
          <button type="button" onClick={onCancel} className="p-1 rounded hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* Name */}
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className="mt-1 w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Example: L1A Range Processing Baseline"
            />
          </label>

          {/* Stage + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">Stage</span>
              <select
                value={processingStage}
                onChange={(e) => setProcessingStage(e.target.value)}
                className="mt-1 w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {PROCESSING_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">Priority (1-10)</span>
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

          <div className="rounded-lg border border-border bg-background/45 p-3">
            <div className="mb-2">
              <div className="text-[11px] font-semibold text-foreground">Assignment Tags</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                Leave tags empty to keep this profile available for every satellite, mode, and polarization.
              </div>
            </div>
            <div className="space-y-2.5">
              <TagPicker label="Satellite" options={SATELLITES} selected={satelliteTags} onChange={setSatelliteTags} />
              <TagPicker label="Mode" options={MODES} selected={modeTags} onChange={setModeTags} />
              <TagPicker label="Polarization" options={POLARIZATION_OPTIONS} selected={polarizationTags} onChange={setPolarizationTags} />
            </div>
          </div>

          {/* Description */}
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              className="mt-1 w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              placeholder="Optional"
            />
          </label>

          {/* Parameters JSON */}
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Processing Parameters (JSON)</span>
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
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 rounded-md text-xs font-medium bg-accent text-background hover:bg-accent/90 transition-colors"
          >
            {isEdit ? 'Update' : 'Create'}
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
        <h3 className="text-sm font-semibold text-foreground mb-2">Delete Profile</h3>
        {hasRefs ? (
          <p className="text-xs text-destructive">
            This profile is referenced by {profile.referencedPipelineCount} pipeline(s).
            Change or remove the profile from those pipelines first.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Delete profile &quot;{profile.name}&quot;? This action cannot be undone.
          </p>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
          >
            Cancel
          </button>
          {!hasRefs && (
            <button
              onClick={onConfirm}
              className="px-4 py-1.5 rounded-md text-xs font-medium bg-destructive text-white hover:bg-destructive/90 transition-colors"
            >
              Delete
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
  referencedPipelines,
  onClose,
}: {
  profile: ProcessingProfile;
  referencedPipelines: ReferencingPipelineInfo[];
  onClose: () => void;
}) {
  const parameters = JSON.stringify(profile.parameters ?? {}, null, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4">
        <div className="flex items-start justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{profile.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{profile.processingStage ?? 'No stage'} · Processing profile</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DetailItem label="Stage" value={profile.processingStage ?? '-'} mono />
            <DetailItem label="Priority" value={String(profile.priority)} mono />
            <DetailItem label="Referenced Pipelines" value={`${referencedPipelines.length}`} mono />
            <DetailItem label="Created At" value={formatKST(profile.createdAt)} />
            <DetailItem label="Updated At" value={formatKST(profile.updatedAt)} />
          </div>

          <div>
            <div className="text-[11px] font-medium text-muted-foreground mb-1">Assignment Tags</div>
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <AssignmentTags profile={profile} />
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-muted-foreground mb-1">Referenced Pipelines</div>
            {referencedPipelines.length === 0 ? (
              <p className="text-xs text-muted-foreground">No pipelines reference this profile.</p>
            ) : (
              <div className="space-y-2">
                {referencedPipelines.map((pipeline) => (
                  <div
                    key={pipeline.id}
                    className="rounded-md border border-border bg-background px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-foreground truncate">{pipeline.name}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {pipeline.satelliteId} · {pipeline.mode}
                        </div>
                      </div>
                      {pipeline.archived && (
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground bg-muted">
                          Archived
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {profile.description && (
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">Description</div>
              <p className="text-xs text-foreground leading-relaxed">{profile.description}</p>
            </div>
          )}

          <div>
            <div className="text-[11px] font-medium text-muted-foreground mb-1">Processing Parameters</div>
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
            Close
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
  const [profileReferences, setProfileReferences] = useState<Record<string, ReferencingPipelineInfo[]>>({});

  // Filters
  const [filterStage, setFilterStage] = useState('');
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
    const [pRes, plRes, archivedRes] = await Promise.all([
      service.처리_프로파일_목록을_조회한다(),
      service.파이프라인_목록을_조회한다(),
      service.아카이브_파이프라인_목록을_조회한다(),
    ]);

    if (pRes.data) setProfiles(pRes.data);

    const activePipelines = plRes.data ?? [];
    const archivedPipelines = (archivedRes.data ?? []).map((pipeline) => ({ ...pipeline, archived: true }));
    setProfileReferences(buildProfileReferenceMap([...activePipelines, ...archivedPipelines]));
  }, [service]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 의존성이 변경될 때 비동기 데이터를 fetch하여 상태를 갱신하는 정규 패턴
    loadData();
  }, [loadData]);

  const filtered = profiles.filter((p) => {
    if (filterStage && p.processingStage !== filterStage) return false;
    if (search) {
      const normalized = search.toLowerCase();
      const searchable = [p.name, p.description ?? '', p.processingStage ?? '', ...flattenProfileTags(p)].join(' ').toLowerCase();
      if (!searchable.includes(normalized)) return false;
    }
    return true;
  }).sort((a, b) => {
    const stageCmp = (a.processingStage ?? '').localeCompare(b.processingStage ?? '');
    if (stageCmp !== 0) return stageCmp;
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
        activePage="console"
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border shrink-0">
          <PipelineManagementTabs active="profiles" counts={{ profiles: filtered.length }} />
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
              placeholder="Search profile or tag..."
              className="pl-8 pr-3 py-1.5 bg-background border border-border rounded-md text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent w-48"
            />
          </div>
          <select
            value={filterStage}
            onChange={(e) => {
              setFilterStage(e.target.value);
              setPage(1);
            }}
            className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">All stages</option>
            {PROCESSING_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
          <div className="ml-auto">
            {canManage && (
              <button
                onClick={() => { setEditProfile(null); setFormOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-accent text-background hover:bg-accent/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Profile</span>
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="text-left px-5 py-2.5">Name</th>
                <th className="text-center px-3 py-2.5">Stage</th>
                <th className="text-left px-3 py-2.5">Assignment Tags</th>
                <th className="text-center px-3 py-2.5">Priority</th>
                <th className="text-center px-3 py-2.5">Referenced Pipelines</th>
                <th className="text-left px-3 py-2.5">Created At</th>
                <th className="text-right px-5 py-2.5">Actions</th>
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
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-block px-1.5 py-0.5 rounded text-xs font-mono bg-muted text-foreground">
                      {p.processingStage ?? '-'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 max-w-[280px]">
                    <AssignmentTags profile={p} />
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-foreground font-mono">{p.priority}</td>
                  <td className="px-3 py-2.5 text-center">
                    {(profileReferences[p.id]?.length ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-accent">
                        <GitBranch className="w-3 h-3" />
                        {profileReferences[p.id]!.length}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">None</span>
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
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(p);
                            }}
                            className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-destructive transition-colors"
                            title="Delete"
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
                  <td colSpan={7} className="text-center py-12 text-sm text-muted-foreground">
                    No profiles match the current filters
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
          referencedPipelines={profileReferences[detailProfile.id] ?? []}
          onClose={() => setDetailProfile(null)}
        />
      )}
    </div>
  );
}
