'use client';

import { useState, useMemo, useEffect } from 'react';
import type { PipelineStepDefinition, ProcessingProfile, JobInitConfig } from '@/types/pipeline';
import {
  DEADLINE_HOUR_OPTIONS,
  JOB_INIT_PROFILE_MISSING_MESSAGE,
} from '@/types/pipeline';
import {
  SlidersHorizontal, Save, ChevronDown, ChevronRight,
  Zap, UserCog, AlertTriangle,
  Satellite, Radio, Activity, Pencil,
} from 'lucide-react';
import CustomSelect, { type CustomSelectOption } from '@/components/ui/CustomSelect';

interface JobInitEditPanelProps {
  step: PipelineStepDefinition;
  /** 파이프라인 편집 컨텍스트에서는 비어 있을 수 있다 — satellite/mode 매칭은 비어 있으면 생략. */
  satelliteId?: string;
  mode?: string;
  profiles: ProcessingProfile[];
  onSave: (step: PipelineStepDefinition) => void;
}

const DEFAULT_CONFIG: JobInitConfig = {
  polarization: 'HH',
  priority: 5,
  retryInterval: 'IMMEDIATE',
  deadlineHours: 4,
};

function TbcBadge({ note }: { note?: string }) {
  return (
    <span className="inline-flex items-center text-[9px] bg-amber-500/10 text-amber-500 rounded px-1.5 py-0.5 shrink-0">
      TBC{note ? ` · ${note}` : ''}
    </span>
  );
}

function getProfileTags(profile: ProcessingProfile) {
  return {
    satellites: profile.satelliteTags ?? (profile.satelliteId ? [profile.satelliteId] : []),
    modes: profile.modeTags ?? (profile.mode ? [profile.mode] : []),
    polarizations: profile.polarizationTags ?? (profile.polarization ? [profile.polarization] : []),
  };
}

/** satellite/mode가 주어졌을 때만 그 차원으로 필터 (polarization은 필터 차원에서 제외 — 프로필 선택 후 자동 적용). */
function profileMatchesContext(profile: ProcessingProfile, satelliteId: string | undefined, mode: string | undefined) {
  const { satellites, modes } = getProfileTags(profile);
  return (
    (!satelliteId || satellites.length === 0 || satellites.includes(satelliteId)) &&
    (!mode || modes.length === 0 || modes.includes(mode))
  );
}

export default function JobInitEditPanel({ step, satelliteId, mode, profiles, onSave }: JobInitEditPanelProps) {
  const initial = step.jobInitConfig ?? DEFAULT_CONFIG;

  const [profileId, setProfileId] = useState(initial.profileId ?? '');
  const [polarization, setPolarization] = useState(initial.polarization);
  const [priority, setPriority] = useState(initial.priority);
  const [deadlineHours, setDeadlineHours] = useState<number | undefined>(initial.deadlineHours);
  const [overrideOpen, setOverrideOpen] = useState(false);

  const matchingProfiles = useMemo(
    () => profiles.filter((p) => profileMatchesContext(p, satelliteId, mode)),
    [profiles, satelliteId, mode],
  );

  const selectedProfile = profiles.find((p) => p.id === profileId);
  const selectedTags = selectedProfile ? getProfileTags(selectedProfile) : null;

  // 사용자가 다른 프로필로 바꾸면 그 프로필이 들고 있는 값들로 자동 갱신:
  //   - polarization: 첫 번째 polarizationTag (이미 새 프로필 태그에 있으면 유지)
  //   - priority    : 프로필의 priority 그대로 사용
  // 다른 job-level 설정(deadlineHours, retryInterval)은 프로필이 보유하지 않으므로 유지.
  const handleProfileChange = (nextProfileId: string) => {
    setProfileId(nextProfileId);
    const next = profiles.find((p) => p.id === nextProfileId);
    if (!next) return;
    const tags = getProfileTags(next);
    if (tags.polarizations.length > 0 && !tags.polarizations.includes(polarization)) {
      setPolarization(tags.polarizations[0]);
    }
    setPriority(next.priority);
    setOverrideOpen(false);
  };

  // 모달 처음 열렸을 때 step의 polarization이 선택된 프로필의 polarizationTags에 없으면 첫 태그로 보정.
  useEffect(() => {
    if (!selectedTags) return;
    if (selectedTags.polarizations.length > 0 && !selectedTags.polarizations.includes(polarization)) {
      setPolarization(selectedTags.polarizations[0]);
    }
    // selectedTags 변경에만 반응 (polarization 자체 변경엔 반응 X — 무한루프 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTags?.polarizations.join(',')]);

  const profileMissingInDefinition = !step.jobInitConfig?.profileId;

  const hasChanges = useMemo(() => {
    const orig = step.jobInitConfig ?? DEFAULT_CONFIG;
    return (
      polarization !== orig.polarization ||
      (profileId || undefined) !== orig.profileId ||
      priority !== orig.priority ||
      deadlineHours !== orig.deadlineHours
    );
  }, [step, polarization, profileId, priority, deadlineHours]);

  const handleSave = () => {
    // retryInterval은 ICD 3.5에서 시스템 차원으로 결정되는 값이라 본 패널에서는 편집하지 않는다.
    // 기존 값이 있으면 보존, 없으면 DEFAULT_CONFIG.retryInterval로 채운다.
    const config: JobInitConfig = {
      polarization,
      profileId: profileId || undefined,
      priority,
      deadlineHours,
      retryInterval: initial.retryInterval ?? DEFAULT_CONFIG.retryInterval,
    };
    onSave({ ...step, jobInitConfig: config });
  };

  const polarizationOverridden = selectedTags
    ? selectedTags.polarizations.length > 0 && polarization !== selectedTags.polarizations[0]
    : false;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <SlidersHorizontal className="w-4 h-4 text-accent flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">Job Initialization</span>
        </div>
        <div className="text-[11px] text-muted-foreground">CSU-08.02 · Job creation + profile selection</div>
      </div>

      {profileMissingInDefinition && (
        <div className="flex gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-[10px] leading-relaxed text-amber-800 dark:text-amber-100/95">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" strokeWidth={2.25} aria-hidden />
          <p className="min-w-0">{JOB_INIT_PROFILE_MISSING_MESSAGE}</p>
        </div>
      )}

      <div className="h-px bg-border" />

      {/* Section 1: Processing Profile */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <UserCog className="w-3.5 h-3.5 text-accent" />
          Processing Profile
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
          {/* Profile Select */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Profile</label>
            {matchingProfiles.length > 0 ? (
              <CustomSelect<string>
                value={profileId}
                onChange={handleProfileChange}
                placeholder="Select a profile…"
                options={matchingProfiles.map((p) => ({
                  value: p.id,
                  label: p.name,
                  description: p.description,
                } satisfies CustomSelectOption))}
              />
            ) : (
              <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground/60 bg-card border border-border rounded-md">
                No profile tags match {satelliteId ?? 'any satellite'} / {mode ?? 'any mode'}
              </div>
            )}
          </div>

          {/* Profile-derived tags (readonly chips) */}
          {selectedProfile && selectedTags && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <div className="text-[10px] text-muted-foreground">Linked tags from profile</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedTags.satellites.map((s) => (
                  <span key={`sat-${s}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[10px] text-foreground/80">
                    <Satellite className="w-3 h-3 text-accent/70" />
                    {s}
                  </span>
                ))}
                {selectedTags.modes.map((m) => (
                  <span key={`mode-${m}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[10px] text-foreground/80">
                    <Activity className="w-3 h-3 text-accent/70" />
                    {m}
                  </span>
                ))}
                {selectedTags.polarizations.map((p) => {
                  const isUsed = p === polarization;
                  return (
                    <span
                      key={`pol-${p}`}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] ${
                        isUsed ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border bg-card text-foreground/80'
                      }`}
                    >
                      <Radio className="w-3 h-3" />
                      {p}
                      {isUsed && <span className="text-[9px] opacity-70">· in use</span>}
                    </span>
                  );
                })}
              </div>

              {/* Override toggle — 평소엔 닫혀 있음. polarization 등 조정하고 싶을 때만 펼침. */}
              {selectedTags.polarizations.length > 1 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setOverrideOpen((v) => !v)}
                    className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {overrideOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <Pencil className="w-3 h-3" />
                    Override profile values
                    {polarizationOverridden && (
                      <span className="ml-1 rounded-sm bg-accent/15 px-1 text-[9px] font-semibold text-accent">modified</span>
                    )}
                  </button>

                  {overrideOpen && (
                    <div className="mt-2 rounded-md border border-border bg-card p-2.5 space-y-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">Polarization (override)</label>
                        <CustomSelect<string>
                          value={polarization}
                          onChange={setPolarization}
                          options={selectedTags.polarizations.map((p) => ({ value: p, label: p }))}
                        />
                      </div>
                      <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
                        Picks one of the polarizations linked to this profile. Defaults to the first tag.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Profile description */}
              {selectedProfile.description && (
                <div className="text-[10px] text-muted-foreground leading-relaxed pt-2 border-t border-border/50">
                  {selectedProfile.description}
                </div>
              )}

              {/* Profile ID */}
              <div className="flex justify-between text-[10px] pt-1">
                <span className="text-muted-foreground">Profile ID</span>
                <span className="font-mono text-muted-foreground/70">{selectedProfile.id}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Job Settings */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <Zap className="w-3.5 h-3.5 text-accent" />
          Job Settings
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          {/* Priority */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-muted-foreground">Priority</label>
              <span className="text-[10px] font-mono text-accent">{priority}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer accent-accent"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground/50 mt-0.5">
              <span>1 (highest)</span>
              <span>10 (lowest)</span>
            </div>
          </div>

          {/* Deadline */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-muted-foreground">Deadline</label>
              <TbcBadge note="SI-04" />
            </div>
            <CustomSelect<string>
              value={deadlineHours != null ? String(deadlineHours) : ''}
              onChange={(v) => setDeadlineHours(v ? Number(v) : undefined)}
              options={[
                { value: '', label: 'Not set' },
                ...DEADLINE_HOUR_OPTIONS.map((h) => ({ value: String(h), label: `${h} hours` })),
              ]}
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="pt-2 border-t border-border">
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 disabled:opacity-30 transition-colors"
        >
          <Save className="w-3 h-3" />
          Apply
        </button>
      </div>
    </div>
  );
}
